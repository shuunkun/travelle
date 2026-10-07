import React from 'react';
import { Expense } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { homeAmount, isForeign } from '@/lib/currency';

interface ExpenseAmountProps {
  expense: Pick<Expense, 'amount' | 'currency' | 'exchangeRate' | 'splitBetween'>;
  /** The trip's home currency. */
  tripCurrency: string;
  className?: string;
  /** Classes for the "≈ home" line shown under foreign amounts. */
  subClassName?: string;
}

/**
 * An expense amount in the currency it was paid in, with the converted
 * home-currency value underneath when the two differ.
 */
export function ExpenseAmount({ expense, tripCurrency, className = '', subClassName = '' }: ExpenseAmountProps) {
  const foreign = isForeign(expense, tripCurrency);
  return (
    <span className={`inline-flex flex-col items-end leading-tight ${className}`}>
      <span className="tabular-nums">{formatCurrency(expense.amount, expense.currency)}</span>
      {foreign && (
        <span className={`text-[11px] font-normal text-gray-400 tabular-nums whitespace-nowrap ${subClassName}`}>
          ≈ {formatCurrency(homeAmount(expense), tripCurrency)}
        </span>
      )}
    </span>
  );
}
