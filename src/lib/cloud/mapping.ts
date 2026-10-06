import { AppData, Expense, Friend, Settlement, Trip } from '../types';
import { ME_ID, getTripParticipantIds } from '../selectors';
import { normalizeData, normalizeFriend } from '../store';
import { PRESET_COLORS } from '../utils';

/**
 * The app works with a single "me" (`ME_ID`) and a global friends list. In the
 * cloud every trip carries its own `people`, and each account is mapped to one
 * of them via `trip_members.person_id`. These pure functions translate
 * between the two shapes.
 */

export interface TripRow {
  id: string;
  owner_id: string;
  owner_person_id: string;
  data: unknown;
}
export interface MemberRow {
  trip_id: string;
  user_id: string;
  person_id: string;
}
export interface ChildRow {
  id: string;
  trip_id: string;
  data: unknown;
}

export interface CloudSnapshot {
  trips: TripRow[];
  members: MemberRow[];
  expenses: ChildRow[];
  settlements: ChildRow[];
  /** `user_data.friends`, or null if this account has never saved any. */
  friends: unknown[] | null;
}

export interface TripAccess {
  /** The traveler on this trip that is the signed-in user. */
  personId: string;
  isOwner: boolean;
  /** Travelers who have joined with an account (cloud person ids). */
  linkedPersonIds: string[];
}

export interface UserIdentity {
  id: string;
  email: string;
}

export interface OutgoingRows {
  trips: Map<string, { owner_person_id: string; data: unknown }>;
  expenses: Map<string, { trip_id: string; data: unknown }>;
  settlements: Map<string, { trip_id: string; data: unknown }>;
  friends: unknown[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function swapExpenseIds(expense: Expense, swap: (id: string) => string): Expense {
  const next: Expense = {
    ...expense,
    paidBy: swap(expense.paidBy),
    splitBetween: expense.splitBetween.map((s) => ({ ...s, friendId: swap(s.friendId) })),
  };
  if (expense.splitInputs) {
    next.splitInputs = Object.fromEntries(Object.entries(expense.splitInputs).map(([k, v]) => [swap(k), v]));
  }
  return next;
}

function swapSettlementIds(settlement: Settlement, swap: (id: string) => string): Settlement {
  return { ...settlement, from: swap(settlement.from), to: swap(settlement.to) };
}

export function defaultDisplayName(email: string): string {
  const local = email.split('@')[0] ?? '';
  const name = local.replace(/[._-]+/g, ' ').trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Traveler';
}

/** Cloud rows → the app's local shape, plus per-trip access info. */
export function cloudToLocal(
  snapshot: CloudSnapshot,
  user: UserIdentity,
): { data: AppData; access: Map<string, TripAccess> } {
  const access = new Map<string, TripAccess>();
  const linked = new Map<string, string[]>();
  for (const m of snapshot.members) {
    const list = linked.get(m.trip_id) ?? [];
    list.push(m.person_id);
    linked.set(m.trip_id, list);
  }
  for (const m of snapshot.members) {
    if (m.user_id !== user.id) continue;
    const trip = snapshot.trips.find((t) => t.id === m.trip_id);
    access.set(m.trip_id, {
      personId: m.person_id,
      isOwner: trip?.owner_id === user.id,
      linkedPersonIds: linked.get(m.trip_id) ?? [],
    });
  }

  const swapperFor = (tripId: string) => {
    const mine = access.get(tripId)?.personId;
    return (id: string) => (id === mine ? ME_ID : id);
  };

  const trips: unknown[] = [];
  const tripPeople: Friend[] = [];
  for (const row of snapshot.trips) {
    if (!access.has(row.id) || !isRecord(row.data)) continue;
    const swap = swapperFor(row.id);
    const mine = access.get(row.id)!.personId;
    const travelers = Array.isArray(row.data.travelers) ? row.data.travelers : [];
    trips.push({
      ...row.data,
      id: row.id,
      travelers: travelers.map((t) => (typeof t === 'string' ? swap(t) : t)),
    });
    const people = Array.isArray(row.data.people) ? row.data.people : [];
    for (const p of people) {
      const friend = normalizeFriend(p);
      if (friend && friend.id !== mine) tripPeople.push(friend);
    }
  }

  const children = (rows: ChildRow[]) =>
    rows
      .filter((r) => access.has(r.trip_id) && isRecord(r.data))
      .map((r) => ({ ...(r.data as object), id: r.id, tripId: r.trip_id }));

  // Normalise first (expects local shape), then swap the user's person id to ME_ID.
  const base = normalizeData({
    trips,
    expenses: children(snapshot.expenses),
    settlements: children(snapshot.settlements),
    friends: [],
  });

  const friends: Friend[] = [];
  const seen = new Set<string>();
  const addFriend = (f: Friend) => {
    if (seen.has(f.id)) return;
    seen.add(f.id);
    friends.push(f);
  };
  for (const raw of snapshot.friends ?? []) {
    const f = normalizeFriend(raw);
    if (f) addFriend(f);
  }
  if (!seen.has(ME_ID)) {
    friends.unshift({ id: ME_ID, name: defaultDisplayName(user.email), email: user.email, color: PRESET_COLORS[0] });
    seen.add(ME_ID);
  }
  tripPeople.forEach(addFriend);

  return {
    data: {
      trips: base.trips,
      expenses: base.expenses.map((e) => swapExpenseIds(e, swapperFor(e.tripId))),
      settlements: base.settlements.map((s) => swapSettlementIds(s, swapperFor(s.tripId))),
      friends,
    },
    access,
  };
}

/**
 * Local state → the rows the cloud should contain. `personIdFor` returns the
 * user's cloud person id for a trip (creating one for brand-new trips).
 */
export function localToCloud(data: AppData, user: UserIdentity, personIdFor: (tripId: string) => string): OutgoingRows {
  const out: OutgoingRows = { trips: new Map(), expenses: new Map(), settlements: new Map(), friends: data.friends };
  const me = data.friends.find((f) => f.id === ME_ID);
  const myName = me && me.name.trim() && me.name !== 'You' ? me.name : defaultDisplayName(user.email);

  for (const trip of data.trips) {
    const personId = personIdFor(trip.id);
    const swap = (id: string) => (id === ME_ID ? personId : id);
    const expenses = data.expenses.filter((e) => e.tripId === trip.id);
    const settlements = data.settlements.filter((s) => s.tripId === trip.id);

    const people: Friend[] = [];
    for (const id of getTripParticipantIds(trip, expenses, settlements)) {
      if (id === ME_ID) {
        people.push({ id: personId, name: myName, email: me?.email || user.email, color: me?.color ?? PRESET_COLORS[0] });
        continue;
      }
      const friend = data.friends.find((f) => f.id === id);
      if (friend) people.push(friend);
    }

    const doc: Omit<Trip, 'id'> & { people: Friend[] } = {
      name: trip.name,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      coverImage: trip.coverImage,
      description: trip.description,
      travelers: trip.travelers.map(swap),
      itinerary: trip.itinerary,
      budget: trip.budget,
      checklist: trip.checklist,
      people,
    };
    out.trips.set(trip.id, { owner_person_id: personId, data: doc });

    for (const e of expenses) {
      const rest: Partial<Expense> = { ...swapExpenseIds(e, swap) };
      delete rest.id;
      delete rest.tripId;
      out.expenses.set(e.id, { trip_id: trip.id, data: rest });
    }
    for (const s of settlements) {
      const rest: Partial<Settlement> = { ...swapSettlementIds(s, swap) };
      delete rest.id;
      delete rest.tripId;
      out.settlements.set(s.id, { trip_id: trip.id, data: rest });
    }
  }
  return out;
}
