import { AppData, Expense, Friend, Settlement, Trip } from './types';
import { computeBalances, pairwiseBalance, simplifyDebts, Transfer, PersonBalance } from './settlements';
import { fromCents } from './split';
import { homeAmountCents, toHomeExpense } from './currency';

export {
  expensesForActivity,
  activityActualCost,
  activityForExpense,
  unlinkedExpenses,
  getPlannedVsActual,
  findActivity,
  listActivities,
  listBookings,
} from './activities';
export type { PlannedVsActual, LocatedActivity } from './activities';

export const ME_ID = 'me';

export function getTrip(data: AppData, tripId: string): Trip | undefined {
  return data.trips.find((t) => t.id === tripId);
}

export function getTripExpenses(expenses: Expense[], tripId: string): Expense[] {
  return expenses.filter((e) => e.tripId === tripId);
}

export function getTripSettlements(settlements: Settlement[], tripId: string): Settlement[] {
  return settlements.filter((s) => s.tripId === tripId);
}

/** Total spent in the trip's currency (foreign expenses converted at their saved rate). */
export function getTripSpent(expenses: Expense[]): number {
  return fromCents(expenses.reduce((sum, e) => sum + homeAmountCents(e), 0));
}

/** Expenses expressed in their trip's currency, for balance maths. */
export function toHomeExpenses(expenses: Expense[]): Expense[] {
  return expenses.map(toHomeExpense);
}

/** Friends who are travelers on this trip, in trip order. */
export function getTripMembers(trip: Trip, friends: Friend[]): Friend[] {
  return trip.travelers
    .map((id) => friends.find((f) => f.id === id))
    .filter((f): f is Friend => Boolean(f));
}

/**
 * Travelers plus anyone referenced by the trip's expenses/settlements, so
 * balances never lose a person who was removed from the trip after paying.
 */
export function getTripParticipantIds(trip: Trip, expenses: Expense[], settlements: Settlement[]): string[] {
  const ids = new Set<string>(trip.travelers);
  for (const e of expenses) {
    ids.add(e.paidBy);
    e.splitBetween.forEach((s) => ids.add(s.friendId));
  }
  for (const s of settlements) {
    ids.add(s.from);
    ids.add(s.to);
  }
  return Array.from(ids);
}

export interface TripFinancials {
  expenses: Expense[];
  settlements: Settlement[];
  spent: number;
  balances: PersonBalance[];
  transfers: Transfer[];
}

export function getTripFinancials(data: AppData, trip: Trip): TripFinancials {
  const expenses = getTripExpenses(data.expenses, trip.id);
  const settlements = getTripSettlements(data.settlements, trip.id);
  const participantIds = getTripParticipantIds(trip, expenses, settlements);
  const balances = computeBalances(toHomeExpenses(expenses), settlements, participantIds);
  return {
    expenses,
    settlements,
    spent: getTripSpent(expenses),
    balances,
    transfers: simplifyDebts(balances),
  };
}

/** Trip currency for each trip id; unknown trips fall back to USD. */
function currencyByTrip(data: AppData): Map<string, string> {
  return new Map(data.trips.map((t) => [t.id, t.currency]));
}

export interface CurrencyNet {
  currency: string;
  /** Positive = owed to me, negative = I owe. */
  net: number;
}

/**
 * Net amount `me` is owed (positive) or owes (negative) across every trip,
 * per currency, since trips in different currencies can't be added together.
 * Zero balances are left out.
 */
export function getOverallNetForMe(data: AppData, me: string = ME_ID): CurrencyNet[] {
  const byCurrency = currencyByTrip(data);
  const groups = new Map<string, { expenses: Expense[]; settlements: Settlement[] }>();
  const groupFor = (tripId: string) => {
    const currency = byCurrency.get(tripId) ?? 'USD';
    let g = groups.get(currency);
    if (!g) {
      g = { expenses: [], settlements: [] };
      groups.set(currency, g);
    }
    return g;
  };
  data.expenses.forEach((e) => groupFor(e.tripId).expenses.push(e));
  data.settlements.forEach((s) => groupFor(s.tripId).settlements.push(s));
  return Array.from(groups.entries())
    .map(([currency, g]) => {
      const balance = computeBalances(toHomeExpenses(g.expenses), g.settlements, [me]).find((b) => b.friendId === me);
      return { currency, net: balance?.net ?? 0 };
    })
    .filter((x) => Math.abs(x.net) >= 0.005);
}

/** What `friendId` owes me (positive) or I owe them (negative), per currency. */
export function getBalanceWithFriend(data: AppData, friendId: string, me: string = ME_ID): CurrencyNet[] {
  const currencies = Array.from(new Set(data.trips.map((t) => t.currency)));
  return currencies
    .map((currency) => {
      const tripIds = new Set(data.trips.filter((t) => t.currency === currency).map((t) => t.id));
      const expenses = toHomeExpenses(data.expenses.filter((e) => tripIds.has(e.tripId)));
      const settlements = data.settlements.filter((s) => tripIds.has(s.tripId));
      return { currency, net: pairwiseBalance(expenses, settlements, me, friendId) };
    })
    .filter((x) => Math.abs(x.net) >= 0.005);
}

export interface FriendUsage {
  trips: Trip[];
  expenses: Expense[];
  settlements: Settlement[];
  isReferenced: boolean;
}

export function getFriendUsage(data: AppData, friendId: string): FriendUsage {
  const trips = data.trips.filter((t) => t.travelers.includes(friendId));
  const expenses = data.expenses.filter(
    (e) => e.paidBy === friendId || e.splitBetween.some((s) => s.friendId === friendId),
  );
  const settlements = data.settlements.filter((s) => s.from === friendId || s.to === friendId);
  return {
    trips,
    expenses,
    settlements,
    isReferenced: trips.length > 0 || expenses.length > 0 || settlements.length > 0,
  };
}
