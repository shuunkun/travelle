import { AppData, Expense, Friend, Settlement, Trip } from './types';
import { computeBalances, pairwiseBalance, simplifyDebts, Transfer, PersonBalance } from './settlements';
import { fromCents, toCents } from './split';

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

export function getTripSpent(expenses: Expense[]): number {
  return fromCents(expenses.reduce((sum, e) => sum + toCents(e.amount), 0));
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
  const balances = computeBalances(expenses, settlements, participantIds);
  return {
    expenses,
    settlements,
    spent: getTripSpent(expenses),
    balances,
    transfers: simplifyDebts(balances),
  };
}

/** Net amount `me` is owed (positive) or owes (negative) across every trip. */
export function getOverallNetForMe(data: AppData, me: string = ME_ID): number {
  const balance = computeBalances(data.expenses, data.settlements, [me]).find((b) => b.friendId === me);
  return balance?.net ?? 0;
}

export function getBalanceWithFriend(data: AppData, friendId: string, me: string = ME_ID): number {
  return pairwiseBalance(data.expenses, data.settlements, me, friendId);
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
