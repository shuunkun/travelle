import { AppData, Friend, Trip } from '../types';
import { ME_ID, getTripParticipantIds } from '../selectors';
import { STORAGE_KEYS, normalizeData } from '../store';
import { sampleTrips } from '../sample-data';
import { generateId } from '../utils';

const IMPORTED_KEY = 'travelle_imported_trip_ids';
const SAMPLE_TRIP_IDS = new Set(sampleTrips.map((t) => t.id));

function readArray(key: string): unknown[] | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** What this device saved while signed out (no sample-data fallback). */
export function readDeviceData(): AppData {
  if (typeof window === 'undefined') return { trips: [], expenses: [], friends: [], settlements: [] };
  return normalizeData({
    trips: readArray(STORAGE_KEYS.trips) ?? [],
    expenses: readArray(STORAGE_KEYS.expenses) ?? [],
    friends: readArray(STORAGE_KEYS.friends) ?? [],
    settlements: readArray(STORAGE_KEYS.settlements) ?? [],
  });
}

function importedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  return new Set((readArray(IMPORTED_KEY) ?? []).filter((v): v is string => typeof v === 'string'));
}

/** Device trips worth offering for upload: not sample trips, not already uploaded. */
export function deviceTripsToImport(): Trip[] {
  const done = importedIds();
  return readDeviceData().trips.filter((t) => !SAMPLE_TRIP_IDS.has(t.id) && !done.has(t.id));
}

export function markImported(tripIds: string[]): void {
  const done = importedIds();
  tripIds.forEach((id) => done.add(id));
  window.localStorage.setItem(IMPORTED_KEY, JSON.stringify([...done]));
}

export function isSampleTrip(tripId: string): boolean {
  return SAMPLE_TRIP_IDS.has(tripId);
}

/**
 * Copy of the chosen trips (with their expenses, settlements and travelers)
 * under fresh ids, so the same device data can never collide in the cloud.
 * `me` stays `me`.
 */
export function prepareImport(source: AppData, tripIds: string[], existingFriends: Friend[]): AppData {
  const ids = new Map<string, string>();
  const remap = (id: string) => {
    if (id === ME_ID) return id;
    let next = ids.get(id);
    if (!next) {
      next = generateId();
      ids.set(id, next);
    }
    return next;
  };

  const chosen = new Set(tripIds);
  const trips = source.trips.filter((t) => chosen.has(t.id));
  const expenses = source.expenses.filter((e) => chosen.has(e.tripId));
  const settlements = source.settlements.filter((s) => chosen.has(s.tripId));

  const personIds = new Set<string>();
  for (const trip of trips) {
    getTripParticipantIds(
      trip,
      expenses.filter((e) => e.tripId === trip.id),
      settlements.filter((s) => s.tripId === trip.id),
    ).forEach((id) => personIds.add(id));
  }

  const friends: Friend[] = source.friends
    .filter((f) => f.id !== ME_ID && personIds.has(f.id))
    // Re-imports of a friend already in the account keep their existing id.
    .map((f) => {
      const match = existingFriends.find(
        (e) => e.id !== ME_ID && e.name === f.name && (e.email || '') === (f.email || ''),
      );
      if (match) {
        ids.set(f.id, match.id);
        return null;
      }
      return { ...f, id: remap(f.id) };
    })
    .filter((f): f is Friend => f !== null);

  return {
    trips: trips.map((t) => ({ ...t, id: remap(t.id), travelers: t.travelers.map(remap) })),
    expenses: expenses.map((e) => {
      const next = {
        ...e,
        id: remap(e.id),
        tripId: remap(e.tripId),
        paidBy: remap(e.paidBy),
        splitBetween: e.splitBetween.map((s) => ({ ...s, friendId: remap(s.friendId) })),
      };
      if (e.splitInputs) {
        next.splitInputs = Object.fromEntries(Object.entries(e.splitInputs).map(([k, v]) => [remap(k), v]));
      }
      return next;
    }),
    settlements: settlements.map((s) => ({
      ...s,
      id: remap(s.id),
      tripId: remap(s.tripId),
      from: remap(s.from),
      to: remap(s.to),
    })),
    friends,
  };
}
