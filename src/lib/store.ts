import { Activity, AppData, Expense, Friend, Settlement, Trip } from './types';
import { sampleTrips, sampleExpenses, sampleFriends, sampleSettlements } from './sample-data';
import { syncItineraryToRange } from './trip-helpers';
import { ME_ID } from './selectors';
import { PRESET_COLORS, generateId, todayKey } from './utils';

/**
 * Low-level localStorage persistence. This module is only ever called from
 * the client (inside effects in AppProvider); it never runs during render, so
 * server and client markup always match.
 */

export const STORAGE_KEYS = {
  trips: 'travelle_trips',
  expenses: 'travelle_expenses',
  friends: 'travelle_friends',
  settlements: 'travelle_settlements',
} as const;

type StorageKey = keyof typeof STORAGE_KEYS;

function readJson<T>(key: StorageKey): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[key]);
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Travelle: failed to read "${STORAGE_KEYS[key]}" from localStorage`, error);
    return undefined;
  }
}

function writeJson(key: StorageKey, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(value);
    // Skip identical writes so cross-tab `storage` events don't ping-pong.
    if (window.localStorage.getItem(STORAGE_KEYS[key]) === serialized) return;
    window.localStorage.setItem(STORAGE_KEYS[key], serialized);
  } catch (error) {
    console.warn(`Travelle: failed to write "${STORAGE_KEYS[key]}" to localStorage`, error);
  }
}

// ---------------------------------------------------------------------------
// Normalisation: tolerate older/partial records so a bad entry never crashes
// the app.
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const asNumber = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function normalizeActivity(raw: unknown): Activity | null {
  if (!isRecord(raw)) return null;
  return {
    id: asString(raw.id) || generateId(),
    time: asString(raw.time),
    title: asString(raw.title),
    location: asString(raw.location),
    notes: asString(raw.notes),
    category: (asString(raw.category, 'other') as Activity['category']) || 'other',
  };
}

export function normalizeTrip(raw: unknown): Trip | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (!id) return null;
  const trip: Trip = {
    id,
    name: asString(raw.name, 'Untitled trip'),
    destination: asString(raw.destination),
    startDate: asString(raw.startDate),
    endDate: asString(raw.endDate),
    coverImage: asString(raw.coverImage),
    description: asString(raw.description),
    travelers: asArray<unknown>(raw.travelers).filter((t): t is string => typeof t === 'string'),
    budget: asNumber(raw.budget),
    itinerary: asArray<unknown>(raw.itinerary)
      .filter(isRecord)
      .map((day) => ({
        date: asString(day.date),
        activities: asArray<unknown>(day.activities)
          .map(normalizeActivity)
          .filter((a): a is Activity => a !== null),
      }))
      .filter((day) => day.date),
    checklist: asArray<unknown>(raw.checklist)
      .filter(isRecord)
      .map((item) => ({
        id: asString(item.id) || generateId(),
        text: asString(item.text),
        done: Boolean(item.done),
      })),
  };
  return syncItineraryToRange(trip);
}

export function normalizeExpense(raw: unknown): Expense | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const tripId = asString(raw.tripId);
  if (!id || !tripId) return null;
  const splitBetween = asArray<unknown>(raw.splitBetween)
    .filter(isRecord)
    .map((s) => ({
      // Older builds wrote `userId`; accept both.
      friendId: asString(s.friendId) || asString(s.userId),
      amount: asNumber(s.amount),
    }))
    .filter((s) => s.friendId);
  const splitInputs = isRecord(raw.splitInputs)
    ? Object.fromEntries(
        Object.entries(raw.splitInputs)
          .filter(([, v]) => typeof v === 'number')
          .map(([k, v]) => [k, v as number]),
      )
    : undefined;
  return {
    id,
    tripId,
    description: asString(raw.description),
    amount: asNumber(raw.amount),
    currency: asString(raw.currency, 'USD'),
    paidBy: asString(raw.paidBy),
    splitBetween,
    date: asString(raw.date) || todayKey(),
    category: (asString(raw.category, 'other') as Expense['category']) || 'other',
    splitMode: raw.splitMode as Expense['splitMode'],
    splitInputs,
  };
}

export function normalizeFriend(raw: unknown): Friend | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (!id) return null;
  return {
    id,
    name: asString(raw.name, 'Unnamed'),
    email: asString(raw.email),
    color: asString(raw.color, PRESET_COLORS[0]),
  };
}

export function normalizeSettlement(raw: unknown): Settlement | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const tripId = asString(raw.tripId);
  const from = asString(raw.from);
  const to = asString(raw.to);
  if (!id || !tripId || !from || !to) return null;
  return {
    id,
    tripId,
    from,
    to,
    amount: asNumber(raw.amount),
    date: asString(raw.date) || todayKey(),
    note: typeof raw.note === 'string' ? raw.note : undefined,
  };
}

function ensureMe(friends: Friend[]): Friend[] {
  if (friends.some((f) => f.id === ME_ID)) return friends;
  return [{ id: ME_ID, name: 'You', email: '', color: PRESET_COLORS[0] }, ...friends];
}

/** Raw, untrusted shape of persisted data (anything may be missing or malformed). */
export type RawAppData = Partial<Record<keyof AppData, unknown>>;

export function normalizeData(input: RawAppData): AppData {
  return {
    trips: asArray<unknown>(input.trips).map(normalizeTrip).filter((t): t is Trip => t !== null),
    expenses: asArray<unknown>(input.expenses)
      .map(normalizeExpense)
      .filter((e): e is Expense => e !== null),
    friends: ensureMe(
      asArray<unknown>(input.friends).map(normalizeFriend).filter((f): f is Friend => f !== null),
    ),
    settlements: asArray<unknown>(input.settlements)
      .map(normalizeSettlement)
      .filter((s): s is Settlement => s !== null),
  };
}

export function getSampleData(): AppData {
  return normalizeData({
    trips: sampleTrips,
    expenses: sampleExpenses,
    friends: sampleFriends,
    settlements: sampleSettlements,
  });
}

/**
 * Load everything from localStorage. Slices that were never saved fall back
 * to the sample data so first-time visitors see a populated app.
 */
export function loadData(): AppData {
  const sample = getSampleData();
  return normalizeData({
    trips: readJson<unknown[]>('trips') ?? sample.trips,
    expenses: readJson<unknown[]>('expenses') ?? sample.expenses,
    friends: readJson<unknown[]>('friends') ?? sample.friends,
    settlements: readJson<unknown[]>('settlements') ?? sample.settlements,
  });
}

export function saveData(data: AppData): void {
  writeJson('trips', data.trips);
  writeJson('expenses', data.expenses);
  writeJson('friends', data.friends);
  writeJson('settlements', data.settlements);
}

export function isStorageKey(key: string | null): boolean {
  return key !== null && (Object.values(STORAGE_KEYS) as string[]).includes(key);
}
