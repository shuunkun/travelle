import { SplitEntry, SplitMode } from './types';

/**
 * Money helpers. All allocation math is done in integer cents so that splits
 * always sum exactly to the original total.
 */
export const toCents = (amount: number): number => Math.round(amount * 100);
export const fromCents = (cents: number): number => cents / 100;
export const roundMoney = (amount: number): number => Math.round(amount * 100) / 100;

/**
 * Distribute `totalCents` across `weights` using the largest-remainder method.
 * The returned amounts always sum to `totalCents`. Ties on remainder are broken
 * by position, so the result is deterministic.
 */
export function allocateCents(totalCents: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const totalWeight = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (totalWeight <= 0) return weights.map(() => 0);

  const sign = totalCents < 0 ? -1 : 1;
  const absTotal = Math.abs(totalCents);

  const raw = weights.map((w) => (absTotal * Math.max(0, w)) / totalWeight);
  const result = raw.map((r) => Math.floor(r));
  let remainder = absTotal - result.reduce((sum, v) => sum + v, 0);

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), weight: weights[i] }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; remainder > 0 && order.length > 0; k = (k + 1) % order.length) {
    result[order[k].i] += 1;
    remainder -= 1;
  }

  return result.map((v) => v * sign);
}

export function splitEqual(total: number, participantIds: string[]): SplitEntry[] {
  const cents = allocateCents(toCents(total), participantIds.map(() => 1));
  return participantIds.map((friendId, i) => ({ friendId, amount: fromCents(cents[i]) }));
}

export function splitByWeights(
  total: number,
  participantIds: string[],
  weights: Record<string, number>,
): SplitEntry[] {
  const cents = allocateCents(
    toCents(total),
    participantIds.map((id) => Math.max(0, weights[id] ?? 0)),
  );
  return participantIds.map((friendId, i) => ({ friendId, amount: fromCents(cents[i]) }));
}

export function splitExact(participantIds: string[], amounts: Record<string, number>): SplitEntry[] {
  return participantIds.map((friendId) => ({
    friendId,
    amount: roundMoney(amounts[friendId] ?? 0),
  }));
}

export interface SplitValidation {
  valid: boolean;
  message?: string;
}

/**
 * Validate the user inputs for a given split mode before computing entries.
 */
export function validateSplit(
  mode: SplitMode,
  total: number,
  participantIds: string[],
  inputs: Record<string, number>,
): SplitValidation {
  if (!Number.isFinite(total) || total <= 0) {
    return { valid: false, message: 'Enter an amount greater than zero.' };
  }
  if (participantIds.length === 0) {
    return { valid: false, message: 'Select at least one person to split with.' };
  }

  switch (mode) {
    case 'equal':
      return { valid: true };
    case 'exact': {
      const sumCents = participantIds.reduce((sum, id) => sum + toCents(inputs[id] ?? 0), 0);
      const diff = sumCents - toCents(total);
      if (diff !== 0) {
        const abs = fromCents(Math.abs(diff)).toFixed(2);
        return {
          valid: false,
          message: diff > 0 ? `Amounts exceed the total by ${abs}.` : `Amounts are ${abs} short of the total.`,
        };
      }
      return { valid: true };
    }
    case 'percent': {
      const sum = participantIds.reduce((s, id) => s + (inputs[id] ?? 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        return { valid: false, message: `Percentages add up to ${roundMoney(sum)}%, they must total 100%.` };
      }
      return { valid: true };
    }
    case 'shares': {
      const sum = participantIds.reduce((s, id) => s + Math.max(0, inputs[id] ?? 0), 0);
      if (sum <= 0) {
        return { valid: false, message: 'Enter at least one share greater than zero.' };
      }
      return { valid: true };
    }
    default:
      return { valid: false, message: 'Unknown split mode.' };
  }
}

/**
 * Compute split entries for a mode. Callers should run `validateSplit` first;
 * this function still returns a well-formed result (summing to the total) for
 * equal/percent/shares even if inputs are odd, and the raw entries for exact.
 */
export function computeSplit(
  mode: SplitMode,
  total: number,
  participantIds: string[],
  inputs: Record<string, number>,
): SplitEntry[] {
  switch (mode) {
    case 'equal':
      return splitEqual(total, participantIds);
    case 'percent':
    case 'shares':
      return splitByWeights(total, participantIds, inputs);
    case 'exact':
      return splitExact(participantIds, inputs);
    default:
      return splitEqual(total, participantIds);
  }
}

export function splitTotal(entries: SplitEntry[]): number {
  return fromCents(entries.reduce((sum, e) => sum + toCents(e.amount), 0));
}
