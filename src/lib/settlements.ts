import { Expense, Settlement } from './types';
import { fromCents, toCents } from './split';

export interface PersonBalance {
  friendId: string;
  /** Total this person paid out of pocket for shared expenses. */
  paid: number;
  /** This person's share of all expenses. */
  owed: number;
  /** Payments this person has made to others to settle debts. */
  settledOut: number;
  /** Payments this person has received from others. */
  settledIn: number;
  /** Positive: others owe this person. Negative: this person owes others. */
  net: number;
  netCents: number;
}

/**
 * Per-person balances for a set of expenses and recorded settlements.
 * `memberIds` controls ordering and guarantees a row even for people with no
 * activity; anyone else who appears in the data is appended so money never
 * silently disappears (e.g. a traveler removed from the trip after paying).
 */
export function computeBalances(
  expenses: Expense[],
  settlements: Settlement[],
  memberIds: string[] = [],
): PersonBalance[] {
  const cents = new Map<string, { paid: number; owed: number; out: number; in: number }>();
  const ensure = (id: string) => {
    let row = cents.get(id);
    if (!row) {
      row = { paid: 0, owed: 0, out: 0, in: 0 };
      cents.set(id, row);
    }
    return row;
  };

  memberIds.forEach(ensure);

  for (const expense of expenses) {
    ensure(expense.paidBy).paid += toCents(expense.amount);
    for (const entry of expense.splitBetween) {
      ensure(entry.friendId).owed += toCents(entry.amount);
    }
  }

  for (const s of settlements) {
    const amount = toCents(s.amount);
    ensure(s.from).out += amount;
    ensure(s.to).in += amount;
  }

  return Array.from(cents.entries()).map(([friendId, row]) => {
    const netCents = row.paid - row.owed + row.out - row.in;
    return {
      friendId,
      paid: fromCents(row.paid),
      owed: fromCents(row.owed),
      settledOut: fromCents(row.out),
      settledIn: fromCents(row.in),
      net: fromCents(netCents),
      netCents,
    };
  });
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * Reduce a set of net balances to a small number of transfers.
 *
 * 1. Pair off debtors and creditors whose amounts match exactly (one transfer
 *    clears both).
 * 2. Greedily match the largest remaining debtor with the largest remaining
 *    creditor. This yields at most (people - 1) transfers.
 *
 * All math is done in integer cents so no residual dust is left behind.
 */
export function simplifyDebts(balances: PersonBalance[]): Transfer[] {
  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ id: b.friendId, cents: -b.netCents }));
  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ id: b.friendId, cents: b.netCents }));

  const transfers: Transfer[] = [];

  // Pass 1: exact matches.
  for (const debtor of debtors) {
    if (debtor.cents === 0) continue;
    const match = creditors.find((c) => c.cents === debtor.cents);
    if (match) {
      transfers.push({ from: debtor.id, to: match.id, amount: fromCents(debtor.cents) });
      debtor.cents = 0;
      match.cents = 0;
    }
  }

  // Pass 2: greedy largest-first.
  const remainingDebtors = debtors.filter((d) => d.cents > 0).sort((a, b) => b.cents - a.cents);
  const remainingCreditors = creditors.filter((c) => c.cents > 0).sort((a, b) => b.cents - a.cents);

  let i = 0;
  let j = 0;
  while (i < remainingDebtors.length && j < remainingCreditors.length) {
    const debtor = remainingDebtors[i];
    const creditor = remainingCreditors[j];
    const amount = Math.min(debtor.cents, creditor.cents);

    if (amount > 0) {
      transfers.push({ from: debtor.id, to: creditor.id, amount: fromCents(amount) });
    }

    debtor.cents -= amount;
    creditor.cents -= amount;
    if (debtor.cents === 0) i += 1;
    if (creditor.cents === 0) j += 1;
  }

  return transfers;
}

/**
 * Direct balance between two people across the given expenses/settlements.
 * Positive means `other` owes `me`; negative means `me` owes `other`.
 */
export function pairwiseBalance(
  expenses: Expense[],
  settlements: Settlement[],
  me: string,
  other: string,
): number {
  let owedToMe = 0;
  let owedToOther = 0;

  for (const expense of expenses) {
    if (expense.paidBy === me) {
      const share = expense.splitBetween.find((s) => s.friendId === other);
      if (share) owedToMe += toCents(share.amount);
    } else if (expense.paidBy === other) {
      const share = expense.splitBetween.find((s) => s.friendId === me);
      if (share) owedToOther += toCents(share.amount);
    }
  }

  for (const s of settlements) {
    if (s.from === other && s.to === me) owedToMe -= toCents(s.amount);
    else if (s.from === me && s.to === other) owedToOther -= toCents(s.amount);
  }

  return fromCents(owedToMe - owedToOther);
}

export function totalOutstanding(transfers: Transfer[]): number {
  return fromCents(transfers.reduce((sum, t) => sum + toCents(t.amount), 0));
}
