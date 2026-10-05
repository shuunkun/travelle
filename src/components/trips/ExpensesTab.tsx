'use client'

import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Receipt, Filter, Plane, BedDouble, Link2 } from 'lucide-react';
import { Expense, Friend, Trip } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ExpenseModal } from '@/components/expenses/ExpenseModal';
import { useApp } from '@/components/providers/AppProvider';
import {
  EXPENSE_CATEGORIES,
  compareDateKeys,
  formatCurrency,
  formatDate,
  getCategoryIcon,
  getCategoryLabel,
  pluralize,
  unlessInteractive,
} from '@/lib/utils';
import { getTripSpent } from '@/lib/selectors';
import { listActivities } from '@/lib/activities';

export interface ExpensesTabProps {
  trip: Trip;
  expenses: Expense[];
  members: Friend[];
  /** Everyone referenced by the trip's data, for the person filter + names. */
  people: Friend[];
  /** Jump to an activity in the itinerary (the page switches tabs and focuses it). */
  onGoToActivity?: (activityId: string) => void;
  /** Open this expense's editor (e.g. clicking a recent expense on Overview). */
  editExpenseId?: string | null;
  onEditHandled?: () => void;
}

type LinkFilter = 'all' | 'linked' | 'unlinked';

const LINK_FILTERS: { value: LinkFilter; label: string }[] = [
  { value: 'all', label: 'All expenses' },
  { value: 'linked', label: 'Linked to activity' },
  { value: 'unlinked', label: 'Unlinked' },
];

const ExpensesTab: React.FC<ExpensesTabProps> = ({
  trip,
  expenses,
  members,
  people,
  onGoToActivity,
  editExpenseId,
  onEditHandled,
}) => {
  const { addExpense, updateExpense, deleteExpense } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');

  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const activityById = useMemo(
    () => new Map(listActivities(trip).map((entry) => [entry.activity.id, entry.activity])),
    [trip],
  );
  const hasAnyLinks = useMemo(() => expenses.some((e) => e.activityId), [expenses]);

  const sorted = useMemo(
    () => [...expenses].sort((a, b) => compareDateKeys(b.date, a.date) || b.id.localeCompare(a.id)),
    [expenses],
  );

  const filtered = useMemo(
    () =>
      sorted.filter((e) => {
        if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
        if (personFilter !== 'all') {
          const involved = e.paidBy === personFilter || e.splitBetween.some((s) => s.friendId === personFilter);
          if (!involved) return false;
        }
        if (linkFilter === 'linked' && !e.activityId) return false;
        if (linkFilter === 'unlinked' && e.activityId) return false;
        return true;
      }),
    [sorted, categoryFilter, personFilter, linkFilter],
  );

  const total = getTripSpent(expenses);
  const filteredTotal = getTripSpent(filtered);
  const isFiltered = categoryFilter !== 'all' || personFilter !== 'all' || linkFilter !== 'all';
  const budgetPct = trip.budget > 0 ? (total / trip.budget) * 100 : 0;

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + e.amount));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const openAdd = () => {
    setEditing(undefined);
    setModalOpen(true);
  };
  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setModalOpen(true);
  };

  const requestedEdit = editExpenseId ? expenses.find((e) => e.id === editExpenseId) : undefined;
  const modalExpense = modalOpen ? editing : requestedEdit;
  const modalIsOpen = modalOpen || Boolean(requestedEdit);

  const closeExpenseModal = () => {
    setModalOpen(false);
    if (requestedEdit) onEditHandled?.();
  };

  const renderPayer = (expense: Expense) => {
    const payer = personById.get(expense.paidBy);
    return (
      <div className="flex items-center gap-2 min-w-0">
        {payer ? <Avatar name={payer.name} color={payer.color} size="xs" /> : null}
        <span className="text-sm text-gray-700 truncate">{payer?.name ?? 'Unknown'}</span>
      </div>
    );
  };

  /** Small chip pointing at the itinerary activity this expense pays for. */
  const renderActivityChip = (expense: Expense) => {
    if (!expense.activityId) return null;
    const activity = activityById.get(expense.activityId);
    if (!activity) return null;
    const Icon = activity.kind === 'flight' ? Plane : activity.kind === 'hotel' ? BedDouble : Link2;
    return (
      <button
        type="button"
        onClick={() => onGoToActivity?.(activity.id)}
        className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-[#E8F0EA] px-2 py-0.5 text-[11px] font-medium text-[#5A7A60] hover:bg-[#d9e6dc] focus:outline-none focus:ring-2 focus:ring-[#7C9A82]"
        title="Show in itinerary"
      >
        <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{activity.title}</span>
      </button>
    );
  };

  const renderSplit = (expense: Expense) => (
    <div className="flex -space-x-1.5" title={expense.splitBetween.map((s) => `${personById.get(s.friendId)?.name ?? '?'}: ${formatCurrency(s.amount)}`).join('\n')}>
      {expense.splitBetween.slice(0, 5).map((s) => {
        const person = personById.get(s.friendId);
        return person ? (
          <Avatar key={s.friendId} name={person.name} color={person.color} size="xs" className="ring-2 ring-white" />
        ) : null;
      })}
      {expense.splitBetween.length > 5 && (
        <span className="w-6 h-6 rounded-full bg-gray-100 text-[10px] text-gray-600 flex items-center justify-center ring-2 ring-white">
          +{expense.splitBetween.length - 5}
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 md:col-span-2">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm text-gray-500">Total spent</span>
            <span className="text-2xl font-semibold text-gray-900">{formatCurrency(total)}</span>
          </div>
          {trip.budget > 0 ? (
            <>
              <ProgressBar value={budgetPct} size="md" label="Budget used" />
              <div className="flex justify-between text-xs mt-2">
                <span className={budgetPct > 100 ? 'text-[#C47C7C] font-medium' : 'text-gray-500'}>
                  {budgetPct > 100
                    ? `${formatCurrency(total - trip.budget)} over budget`
                    : `${formatCurrency(trip.budget - total)} remaining`}
                </span>
                <span className="text-gray-500">
                  {Math.round(budgetPct)}% of {formatCurrency(trip.budget)}
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">No budget set. Edit the trip to add one.</p>
          )}
        </Card>
        <Card className="p-5">
          <span className="text-sm text-gray-500 block mb-2">By category</span>
          {categoryTotals.length === 0 ? (
            <p className="text-xs text-gray-400">Nothing yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {categoryTotals.slice(0, 4).map(([cat, amt]) => (
                <li key={cat} className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    <span className="mr-1.5" aria-hidden="true">{getCategoryIcon(cat)}</span>
                    {getCategoryLabel(cat)}
                  </span>
                  <span className="font-medium text-gray-800 tabular-nums">{formatCurrency(amt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Select
              label="Category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[{ value: 'all', label: 'All categories' }, ...EXPENSE_CATEGORIES]}
            />
          </div>
          <div className="w-44">
            <Select
              label="Person"
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              options={[{ value: 'all', label: 'Everyone' }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </div>
          {(hasAnyLinks || linkFilter !== 'all') && (
            <div className="w-44">
              <Select
                label="Activity link"
                value={linkFilter}
                onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
                options={LINK_FILTERS}
              />
            </div>
          )}
          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCategoryFilter('all');
                setPersonFilter('all');
                setLinkFilter('all');
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
        <Button onClick={openAdd} disabled={members.length === 0} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
          Add expense
        </Button>
      </div>

      {members.length === 0 && (
        <p className="text-sm text-[#8c7a59] bg-[#F5F0E8] rounded-lg px-4 py-3">
          This trip has no travelers yet. Edit the trip and add travelers before recording expenses.
        </p>
      )}

      {/* List */}
      {expenses.length === 0 ? (
        <EmptyState
          icon={<Receipt className="w-6 h-6" aria-hidden="true" />}
          title="No expenses yet"
          description="Keep track of what the group spends and we'll work out who owes whom."
          action={
            <Button onClick={openAdd} disabled={members.length === 0}>
              Add your first expense
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Filter className="w-6 h-6" aria-hidden="true" />}
          title="Nothing matches these filters"
          description="Try a different category, person or link filter."
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          {isFiltered && (
            <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-xs text-gray-600 flex justify-between">
              <span>{pluralize(filtered.length, 'expense')} shown</span>
              <span className="font-medium">{formatCurrency(filteredTotal)}</span>
            </div>
          )}

          {/* Desktop table */}
          <table className="hidden md:table min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paid by</th>
                <th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Split</th>
                <th scope="col" className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th scope="col" className="px-3 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((expense) => (
                <tr
                  key={expense.id}
                  className="hover:bg-gray-50 group cursor-pointer"
                  onClick={unlessInteractive(() => openEdit(expense))}
                  title="Click to edit"
                >
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-500">{formatDate(expense.date)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg" aria-hidden="true">{getCategoryIcon(expense.category)}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{expense.description}</p>
                        <p className="text-xs text-gray-400">{getCategoryLabel(expense.category)}</p>
                        {renderActivityChip(expense)}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">{renderPayer(expense)}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">{renderSplit(expense)}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-right text-sm font-medium text-gray-900 tabular-nums">
                    {formatCurrency(expense.amount, expense.currency)}
                  </td>
                  <td className="px-3 py-3.5 whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(expense)} aria-label={`Edit ${expense.description}`}>
                        <Pencil size={15} aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:text-red-500" onClick={() => setPendingDelete(expense)} aria-label={`Delete ${expense.description}`}>
                        <Trash2 size={15} aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-gray-100">
            {filtered.map((expense) => (
              <li
                key={expense.id}
                className="p-4 cursor-pointer hover:bg-gray-50"
                onClick={unlessInteractive(() => openEdit(expense))}
                title="Click to edit"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-xl leading-none mt-0.5" aria-hidden="true">{getCategoryIcon(expense.category)}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{expense.description}</p>
                      <p className="text-xs text-gray-400">
                        {formatDate(expense.date)} · {getCategoryLabel(expense.category)}
                      </p>
                      {renderActivityChip(expense)}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">{formatCurrency(expense.amount, expense.currency)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {renderPayer(expense)}
                    <Badge className="font-normal">paid</Badge>
                    {renderSplit(expense)}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(expense)} aria-label={`Edit ${expense.description}`}>
                      <Pencil size={15} aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:text-red-500" onClick={() => setPendingDelete(expense)} aria-label={`Delete ${expense.description}`}>
                      <Trash2 size={15} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ExpenseModal
        isOpen={modalIsOpen}
        onClose={closeExpenseModal}
        trip={trip}
        members={members}
        expense={modalExpense}
        onSave={(input) => {
          if (modalExpense) updateExpense(modalExpense.id, input);
          else addExpense(input);
        }}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteExpense(pendingDelete.id);
          setPendingDelete(null);
        }}
        title="Delete expense"
        confirmLabel="Delete"
        message={
          <>
            Delete <strong>{pendingDelete?.description}</strong> ({pendingDelete ? formatCurrency(pendingDelete.amount) : ''})?
            Balances will be recalculated. This can&apos;t be undone.
          </>
        }
      />
    </div>
  );
};

export default ExpensesTab;
export { ExpensesTab };
