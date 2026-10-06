import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { AppData } from '../types';
import { generateId } from '../utils';
import { CloudSnapshot, TripAccess, UserIdentity, cloudToLocal, localToCloud } from './mapping';

export type SyncStatus = 'loading' | 'synced' | 'saving' | 'error';

interface SyncedChild {
  json: string;
  tripId: string;
}

interface SyncCallbacks {
  /** Fresh data from the cloud; replace local state with it. */
  onRemoteData: (data: AppData, access: Map<string, TripAccess>) => void;
  onStatus: (status: SyncStatus, error?: string) => void;
}

const PUSH_DELAY_MS = 400;
const REFRESH_DELAY_MS = 250;
const RETRY_DELAY_MS = 5000;

function describeError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return String(error);
}

/**
 * Keeps local app state and Supabase in step for one signed-in user.
 *
 * Local edits are diffed against the last state known to match the cloud and
 * only changed rows are written. Remote changes (realtime) trigger a refetch,
 * which is deferred while local edits are still unsaved so they are never
 * clobbered.
 */
export class CloudSync {
  private access = new Map<string, TripAccess>();
  /** Trips created on this device that haven't been inserted yet. */
  private pendingTrips = new Map<string, string>();
  private syncedTrips = new Map<string, string>();
  private syncedExpenses = new Map<string, SyncedChild>();
  private syncedSettlements = new Map<string, SyncedChild>();
  private syncedFriends: string | null = null;

  private latest: AppData | null = null;
  private localVersion = 0;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private pushing = false;
  private refreshWanted = false;
  private channel: RealtimeChannel | null = null;
  private disposed = false;

  constructor(
    private readonly client: SupabaseClient,
    private readonly user: UserIdentity,
    private readonly callbacks: SyncCallbacks,
  ) {}

  start(): void {
    this.callbacks.onStatus('loading');
    void this.refresh();
    const onChange = () => this.scheduleRefresh();
    this.channel = this.client
      .channel(`travelle-${this.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_members' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' }, onChange)
      .subscribe();
  }

  dispose(): void {
    this.disposed = true;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.channel) void this.client.removeChannel(this.channel);
  }

  getAccess(tripId: string): TripAccess | undefined {
    return this.access.get(tripId);
  }

  /** Called with every local state change. Cheap when nothing differs from the cloud. */
  notifyLocalChange(data: AppData): void {
    this.latest = data;
    if (!this.hasDiff(data)) return;
    this.localVersion += 1;
    this.callbacks.onStatus('saving');
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.push(), PUSH_DELAY_MS);
  }

  scheduleRefresh(): void {
    if (this.disposed) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), REFRESH_DELAY_MS);
  }

  // -------------------------------------------------------------------------

  private personIdFor = (tripId: string): string => {
    const known = this.access.get(tripId)?.personId ?? this.pendingTrips.get(tripId);
    if (known) return known;
    const id = generateId();
    this.pendingTrips.set(tripId, id);
    return id;
  };

  private rows(data: AppData) {
    return localToCloud(data, this.user, this.personIdFor);
  }

  private hasDiff(data: AppData): boolean {
    const rows = this.rows(data);
    if (rows.trips.size !== this.syncedTrips.size) return true;
    for (const [id, row] of rows.trips) if (this.syncedTrips.get(id) !== JSON.stringify(row)) return true;
    if (rows.expenses.size !== this.syncedExpenses.size) return true;
    for (const [id, row] of rows.expenses) if (this.syncedExpenses.get(id)?.json !== JSON.stringify(row)) return true;
    if (rows.settlements.size !== this.syncedSettlements.size) return true;
    for (const [id, row] of rows.settlements)
      if (this.syncedSettlements.get(id)?.json !== JSON.stringify(row)) return true;
    return JSON.stringify(rows.friends) !== this.syncedFriends;
  }

  /** Record `data` as exactly what the cloud holds. */
  private markSynced(data: AppData): void {
    const rows = this.rows(data);
    this.syncedTrips = new Map([...rows.trips].map(([id, row]) => [id, JSON.stringify(row)]));
    this.syncedExpenses = new Map(
      [...rows.expenses].map(([id, row]) => [id, { json: JSON.stringify(row), tripId: row.trip_id }]),
    );
    this.syncedSettlements = new Map(
      [...rows.settlements].map(([id, row]) => [id, { json: JSON.stringify(row), tripId: row.trip_id }]),
    );
    this.syncedFriends = JSON.stringify(rows.friends);
  }

  private async fetchSnapshot(): Promise<CloudSnapshot> {
    const [trips, members, expenses, settlements, userData] = await Promise.all([
      this.client.from('trips').select('id, owner_id, owner_person_id, data'),
      this.client.from('trip_members').select('trip_id, user_id, person_id'),
      this.client.from('expenses').select('id, trip_id, data'),
      this.client.from('settlements').select('id, trip_id, data'),
      this.client.from('user_data').select('friends').eq('user_id', this.user.id).maybeSingle(),
    ]);
    const error = trips.error ?? members.error ?? expenses.error ?? settlements.error ?? userData.error;
    if (error) throw error;
    return {
      trips: trips.data ?? [],
      members: members.data ?? [],
      expenses: expenses.data ?? [],
      settlements: settlements.data ?? [],
      friends: Array.isArray(userData.data?.friends) ? userData.data.friends : null,
    };
  }

  private async refresh(): Promise<void> {
    if (this.disposed) return;
    if (this.pushing || this.pushTimer) {
      this.refreshWanted = true;
      return;
    }
    const versionAtStart = this.localVersion;
    try {
      const snapshot = await this.fetchSnapshot();
      if (this.disposed) return;
      if (this.localVersion !== versionAtStart || this.pushing || this.pushTimer) {
        // Local edits arrived mid-fetch; retry once they're saved.
        this.refreshWanted = true;
        return;
      }
      const { data, access } = cloudToLocal(snapshot, this.user);
      this.access = access;
      for (const id of access.keys()) this.pendingTrips.delete(id);
      this.markSynced(data);
      this.latest = data;
      this.callbacks.onRemoteData(data, access);
      this.callbacks.onStatus('synced');
    } catch (error) {
      if (this.disposed) return;
      this.callbacks.onStatus('error', describeError(error));
      this.refreshTimer = setTimeout(() => void this.refresh(), RETRY_DELAY_MS);
    }
  }

  private async push(): Promise<void> {
    this.pushTimer = null;
    if (this.disposed || !this.latest) return;
    if (this.pushing) {
      // Another push is in flight; it will re-check when done.
      return;
    }
    this.pushing = true;
    const data = this.latest;
    const rows = this.rows(data);
    try {
      // 1. Trips (new ones first so children can reference them).
      for (const [id, row] of rows.trips) {
        const json = JSON.stringify(row);
        if (this.syncedTrips.get(id) === json) continue;
        if (this.syncedTrips.has(id)) {
          const { error } = await this.client.from('trips').update({ data: row.data }).eq('id', id);
          if (error) throw error;
        } else {
          const { error } = await this.client
            .from('trips')
            .insert({ id, owner_person_id: row.owner_person_id, data: row.data });
          if (error) throw error;
          this.access.set(id, { personId: row.owner_person_id, isOwner: true, linkedPersonIds: [row.owner_person_id] });
          this.pendingTrips.delete(id);
        }
        this.syncedTrips.set(id, json);
      }

      const removedTrips = [...this.syncedTrips.keys()].filter((id) => !rows.trips.has(id));

      // 2. Expenses and settlements.
      await this.pushChildren('expenses', rows.expenses, this.syncedExpenses, removedTrips);
      await this.pushChildren('settlements', rows.settlements, this.syncedSettlements, removedTrips);

      // 3. Removed trips: owners delete, members leave.
      for (const id of removedTrips) {
        const access = this.access.get(id);
        const { error } =
          access && !access.isOwner
            ? await this.client.from('trip_members').delete().eq('trip_id', id).eq('user_id', this.user.id)
            : await this.client.from('trips').delete().eq('id', id);
        if (error) throw error;
        this.syncedTrips.delete(id);
        this.access.delete(id);
        for (const map of [this.syncedExpenses, this.syncedSettlements]) {
          for (const [childId, child] of map) if (child.tripId === id) map.delete(childId);
        }
      }

      // 4. Friends list.
      const friendsJson = JSON.stringify(rows.friends);
      if (friendsJson !== this.syncedFriends) {
        const { error } = await this.client
          .from('user_data')
          .upsert({ user_id: this.user.id, friends: rows.friends }, { onConflict: 'user_id' });
        if (error) throw error;
        this.syncedFriends = friendsJson;
      }

      this.pushing = false;
      if (this.latest !== data && this.hasDiff(this.latest)) {
        void this.push();
        return;
      }
      this.callbacks.onStatus('synced');
      if (this.refreshWanted) {
        this.refreshWanted = false;
        this.scheduleRefresh();
      }
    } catch (error) {
      this.pushing = false;
      if (this.disposed) return;
      this.callbacks.onStatus('error', describeError(error));
      this.pushTimer = setTimeout(() => void this.push(), RETRY_DELAY_MS);
    }
  }

  private async pushChildren(
    table: 'expenses' | 'settlements',
    rows: Map<string, { trip_id: string; data: unknown }>,
    synced: Map<string, SyncedChild>,
    removedTrips: string[],
  ): Promise<void> {
    const upserts: { id: string; trip_id: string; data: unknown }[] = [];
    for (const [id, row] of rows) {
      if (synced.get(id)?.json !== JSON.stringify(row)) upserts.push({ id, ...row });
    }
    if (upserts.length) {
      const { error } = await this.client.from(table).upsert(upserts, { onConflict: 'id' });
      if (error) throw error;
      for (const row of upserts) {
        synced.set(row.id, { json: JSON.stringify({ trip_id: row.trip_id, data: row.data }), tripId: row.trip_id });
      }
    }
    // Children of removed trips are handled with the trip (cascade, or kept for others when leaving).
    const deletes = [...synced]
      .filter(([id, child]) => !rows.has(id) && !removedTrips.includes(child.tripId))
      .map(([id]) => id);
    if (deletes.length) {
      const { error } = await this.client.from(table).delete().in('id', deletes);
      if (error) throw error;
      deletes.forEach((id) => synced.delete(id));
    }
  }
}
