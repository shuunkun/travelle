'use client'

import React, { useMemo, useState } from 'react';
import { Expense, ExpenseCategory, Friend, SplitMode, Trip } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Avatar } from '@/components/ui/Avatar';
import { computeSplit, roundMoney, validateSplit } from '@/lib/split';
import { EXPENSE_CATEGORIES, formatCurrency, formatDate, isDateKey, todayKey } from '@/lib/utils';
import { activityOptionLabel, listActivities } from '@/lib/activities';

export interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip;
  /** People who can pay / be part of the split. */
  members: Friend[];
  /** When provided, the modal edits this expense instead of creating one. */
  expense?: Expense;
  /** Prefilled values when creating (e.g. "Add cost" from an itinerary activity). Ignored when editing. */
  defaults?: Partial<Pick<Expense, 'description' | 'amount' | 'date' | 'category' | 'activityId'>>;
  onSave: (input: Omit<Expense, 'id'>) => void;
}

const SPLIT_MODES: { value: SplitMode; label: string; hint: string }[] = [
  { value: 'equal', label: 'Equally', hint: 'Split evenly between the selected people.' },
  { value: 'exact', label: 'Exact amounts', hint: 'Enter what each person owes. Must add up to the total.' },
  { value: 'percent', label: 'Percentages', hint: 'Enter a percentage for each person. Must total 100%.' },
  { value: 'shares', label: 'Shares', hint: 'Weight each person, e.g. 2 shares for a couple.' },
];

const ExpenseModal: React.FC<ExpenseModalProps> = (props) => {
  const { isOpen, onClose, expense } = props;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={expense ? 'Edit expense' : 'Add expense'}
      description={expense ? undefined : 'Record who paid and how to split it.'}
      size="lg"
    >
      {/* Keyed so the form state resets whenever a different expense is opened. */}
      <ExpenseForm key={expense?.id ?? `new-${props.defaults?.activityId ?? ''}`} {...props} />
    </Modal>
  );
};

type FieldErrors = Partial<Record<'description' | 'amount' | 'date' | 'paidBy' | 'split', string>>;

const ExpenseForm: React.FC<ExpenseModalProps> = ({ onClose, trip, members, expense, defaults, onSave }) => {
  // People list: trip members plus anyone referenced by the expense being
  // edited (e.g. someone later removed from the trip) so edits never lose them.
  const people = useMemo(() => {
    const list = [...members];
    if (expense) {
      const ids = new Set([expense.paidBy, ...expense.splitBetween.map((s) => s.friendId)]);
      ids.forEach((id) => {
        if (!list.some((p) => p.id === id)) list.push({ id, name: 'Former traveler', email: '', color: '#9ca3af' });
      });
    }
    return list;
  }, [members, expense]);

  const seed = expense ? undefined : defaults;
  const [description, setDescription] = useState(expense?.description ?? seed?.description ?? '');
  const [amount, setAmount] = useState(
    expense ? String(expense.amount) : seed?.amount !== undefined ? String(seed.amount) : '',
  );
  const [date, setDate] = useState(expense?.date ?? seed?.date ?? todayKey());
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? people[0]?.id ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? seed?.category ?? 'other');
  const [activityId, setActivityId] = useState<string>(expense?.activityId ?? seed?.activityId ?? '');

  // Activities this expense can be linked to, labelled by day.
  const activityOptions = useMemo(() => {
    const options = listActivities(trip).map((entry) => ({
      value: entry.activity.id,
      label: activityOptionLabel(entry, (d) => formatDate(d, { month: 'short', day: 'numeric' })),
    }));
    // Keep a stale link selectable so editing never silently drops it.
    if (activityId && !options.some((o) => o.value === activityId)) {
      options.push({ value: activityId, label: 'Linked activity (no longer in itinerary)' });
    }
    return [{ value: '', label: 'None' }, ...options];
  }, [trip, activityId]);
  const [mode, setMode] = useState<SplitMode>(expense?.splitMode ?? 'equal');
  const [participants, setParticipants] = useState<string[]>(
    expense ? expense.splitBetween.map((s) => s.friendId) : people.map((p) => p.id),
  );
  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    if (!expense) return {};
    const source: Record<string, number> = expense.splitInputs ?? {};
    if (expense.splitMode === 'exact' || !expense.splitMode) {
      // Exact (or legacy) amounts can be restored from the entries themselves.
      expense.splitBetween.forEach((s) => {
        if (source[s.friendId] === undefined) source[s.friendId] = s.amount;
      });
    }
    return Object.fromEntries(Object.entries(source).map(([k, v]) => [k, String(v)]));
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [attempted, setAttempted] = useState(false);

  const total = Number(amount);
  const numericInputs = useMemo(
    () => Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.trim() === '' ? 0 : Number(v)])),
    [inputs],
  );

  const splitValidation = useMemo(
    () => validateSplit(mode, total, participants, numericInputs),
    [mode, total, participants, numericInputs],
  );

  const preview = useMemo(() => {
    if (!Number.isFinite(total) || total <= 0 || participants.length === 0) return [];
    return computeSplit(mode, total, participants, numericInputs);
  }, [mode, total, participants, numericInputs]);

  const previewTotal = roundMoney(preview.reduce((sum, p) => sum + p.amount, 0));

  const toggleParticipant = (id: string) => {
    setParticipants((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const setInput = (id: string, value: string) => {
    setInputs((prev) => ({ ...prev, [id]: value }));
  };

  const distributeEvenly = () => {
    if (participants.length === 0) return;
    if (mode === 'percent') {
      const base = Math.floor((100 / participants.length) * 100) / 100;
      const next: Record<string, string> = {};
      let remaining = 100;
      participants.forEach((id, i) => {
        const value = i === participants.length - 1 ? roundMoney(remaining) : base;
        next[id] = String(value);
        remaining = roundMoney(remaining - value);
      });
      setInputs(next);
    } else if (mode === 'shares') {
      setInputs(Object.fromEntries(participants.map((id) => [id, '1'])));
    } else if (mode === 'exact' && Number.isFinite(total) && total > 0) {
      const entries = computeSplit('equal', total, participants, {});
      setInputs(Object.fromEntries(entries.map((e) => [e.friendId, String(e.amount)])));
    }
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!description.trim()) next.description = 'What was this for?';
    if (!Number.isFinite(total) || total <= 0) next.amount = 'Enter an amount greater than zero.';
    if (!date || !isDateKey(date)) next.date = 'Pick a valid date.';
    if (!paidBy) next.paidBy = 'Who paid?';
    if (!next.amount && !splitValidation.valid) next.split = splitValidation.message;
    return next;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const splitBetween = computeSplit(mode, total, participants, numericInputs);
    const splitInputs =
      mode === 'equal'
        ? undefined
        : Object.fromEntries(participants.map((id) => [id, numericInputs[id] ?? 0]));

    onSave({
      tripId: trip.id,
      description: description.trim(),
      amount: roundMoney(total),
      currency: expense?.currency ?? 'USD',
      paidBy,
      splitBetween,
      date,
      category,
      splitMode: mode,
      splitInputs,
      activityId: activityId || undefined,
    });
    onClose();
  };

  const liveErrors = attempted ? validate() : errors;
  const currentMode = SPLIT_MODES.find((m) => m.value === mode)!;
  const inputSuffix = mode === 'percent' ? '%' : mode === 'shares' ? 'sh' : undefined;
  const inputPrefix = mode === 'exact' ? '$' : undefined;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Input
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. Dinner at Tokyo Tower"
        error={liveErrors.description}
        required
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Amount"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          prefix="$"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          error={liveErrors.amount}
          required
        />
        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={liveErrors.date}
          required
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Paid by"
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value)}
          options={people.map((p) => ({ value: p.id, label: p.name }))}
          placeholder={people.length === 0 ? 'No travelers on this trip' : undefined}
          error={liveErrors.paidBy}
        />
        <Select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          options={EXPENSE_CATEGORIES}
        />
      </div>
      {activityOptions.length > 1 && (
        <Select
          label="Linked activity (optional)"
          value={activityId}
          onChange={(e) => setActivityId(e.target.value)}
          options={activityOptions}
        />
      )}

      <fieldset className="pt-4 border-t border-gray-100">
        <legend className="text-sm font-medium text-gray-700 mb-2">Split</legend>
        <div className="flex flex-wrap gap-2 mb-2" role="radiogroup" aria-label="Split method">
          {SPLIT_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onClick={() => setMode(m.value)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                mode === m.value
                  ? 'bg-[#7C9A82] border-[#7C9A82] text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-[#7C9A82] hover:text-[#5A7A60]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-xs text-gray-500">{currentMode.hint}</p>
          {mode !== 'equal' && (
            <button type="button" onClick={distributeEvenly} className="text-xs text-[#7C9A82] hover:underline whitespace-nowrap">
              Fill evenly
            </button>
          )}
        </div>

        {people.length === 0 ? (
          <p className="text-sm text-gray-500">Add travelers to this trip before recording expenses.</p>
        ) : (
          <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100">
            {people.map((person) => {
              const included = participants.includes(person.id);
              const share = preview.find((p) => p.friendId === person.id);
              return (
                <li key={person.id} className="flex items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    id={`split-${person.id}`}
                    checked={included}
                    onChange={() => toggleParticipant(person.id)}
                    className="rounded border-gray-300 accent-[#7C9A82] h-4 w-4"
                  />
                  <label htmlFor={`split-${person.id}`} className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                    <Avatar name={person.name} color={person.color} size="sm" />
                    <span className={`text-sm truncate ${included ? 'text-gray-800' : 'text-gray-400'}`}>
                      {person.name}
                      {person.id === paidBy && <span className="ml-1 text-xs text-gray-400">(paid)</span>}
                    </span>
                  </label>
                  {mode !== 'equal' && included && (
                    <div className="w-28">
                      <Input
                        aria-label={`${person.name} ${currentMode.label.toLowerCase()}`}
                        type="number"
                        min={0}
                        step={mode === 'shares' ? 1 : 0.01}
                        inputMode="decimal"
                        prefix={inputPrefix}
                        suffix={inputSuffix}
                        value={inputs[person.id] ?? ''}
                        onChange={(e) => setInput(person.id, e.target.value)}
                        className="py-1.5"
                      />
                    </div>
                  )}
                  <span className={`w-20 text-right text-sm tabular-nums ${included ? 'font-medium text-gray-900' : 'text-gray-300'}`}>
                    {included && share ? formatCurrency(share.amount) : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={liveErrors.split ? 'text-[#C47C7C]' : 'text-gray-400'}>
            {liveErrors.split ??
              (participants.length > 0
                ? `${participants.length} of ${people.length} people · split totals ${formatCurrency(previewTotal)}`
                : 'Select at least one person')}
          </span>
        </div>
      </fieldset>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={people.length === 0}>
          {expense ? 'Save changes' : 'Add expense'}
        </Button>
      </div>
    </form>
  );
};

export default ExpenseModal;
export { ExpenseModal };
