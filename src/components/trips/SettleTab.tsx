'use client'

import React, { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle, HandCoins, Trash2, Plus } from 'lucide-react';
import { Friend, Settlement, Trip } from '@/lib/types';
import { PersonBalance, Transfer, totalOutstanding } from '@/lib/settlements';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useApp } from '@/components/providers/AppProvider';
import { compareDateKeys, formatCurrency, formatDate, formatSignedCurrency, isDateKey, pluralize, todayKey } from '@/lib/utils';
import { roundMoney } from '@/lib/split';
import { ME_ID } from '@/lib/selectors';

export interface SettleTabProps {
  trip: Trip;
  balances: PersonBalance[];
  transfers: Transfer[];
  settlements: Settlement[];
  people: Friend[];
}

interface PaymentDraft {
  from: string;
  to: string;
  amount: string;
  date: string;
  note: string;
  /** Max sensible amount (the suggested transfer), if any. */
  suggested?: number;
}

const SettleTab: React.FC<SettleTabProps> = ({ trip, balances, transfers, settlements, people }) => {
  const { addSettlement, deleteSettlement } = useApp();
  const [draft, setDraft] = useState<PaymentDraft | null>(null);
  const [draftError, setDraftError] = useState<string | undefined>();
  const [pendingDelete, setPendingDelete] = useState<Settlement | null>(null);

  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const nameOf = (id: string) => personById.get(id)?.name ?? 'Former traveler';
  const avatarOf = (id: string, size: 'xs' | 'sm' | 'md' = 'sm') => {
    const p = personById.get(id);
    return <Avatar name={p?.name ?? '?'} color={p?.color ?? '#9ca3af'} size={size} />;
  };

  const outstanding = totalOutstanding(transfers);
  const maxAbs = Math.max(1, ...balances.map((b) => Math.abs(b.net)));
  const sortedSettlements = useMemo(
    () => [...settlements].sort((a, b) => compareDateKeys(b.date, a.date) || b.id.localeCompare(a.id)),
    [settlements],
  );
  const hasAnyActivity = balances.some((b) => b.paid > 0 || b.owed > 0);

  const openFromTransfer = (t: Transfer) =>
    setDraft({ from: t.from, to: t.to, amount: String(t.amount), date: todayKey(), note: '', suggested: t.amount });

  const openManual = () =>
    setDraft({
      from: people[0]?.id ?? '',
      to: people[1]?.id ?? people[0]?.id ?? '',
      amount: '',
      date: todayKey(),
      note: '',
    });

  const submitDraft = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const amount = Number(draft.amount);
    if (!draft.from || !draft.to) return setDraftError('Pick who paid and who received.');
    if (draft.from === draft.to) return setDraftError('Payer and recipient must be different people.');
    if (!Number.isFinite(amount) || amount <= 0) return setDraftError('Enter an amount greater than zero.');
    if (!isDateKey(draft.date)) return setDraftError('Pick a valid date.');
    addSettlement({
      tripId: trip.id,
      from: draft.from,
      to: draft.to,
      amount: roundMoney(amount),
      date: draft.date,
      note: draft.note.trim() || undefined,
    });
    setDraft(null);
    setDraftError(undefined);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Balances */}
        <Card className="p-6 lg:col-span-3">
          <div className="flex items-baseline justify-between mb-5">
            <h3 className="text-lg font-medium text-gray-900">Balances</h3>
            <span className="text-xs text-gray-400">paid − share ± payments</span>
          </div>
          {!hasAnyActivity ? (
            <p className="text-sm text-gray-500 text-center py-6">Add expenses to see who owes what.</p>
          ) : (
            <ul className="space-y-4">
              {balances.map((b) => {
                const pct = (Math.abs(b.net) / maxAbs) * 100;
                const positive = b.net > 0.004;
                const negative = b.net < -0.004;
                return (
                  <li key={b.friendId}>
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <div className="flex items-center gap-3 min-w-0">
                        {avatarOf(b.friendId)}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{nameOf(b.friendId)}</p>
                          <p className="text-xs text-gray-400">
                            paid {formatCurrency(b.paid)} · share {formatCurrency(b.owed)}
                            {b.settledOut > 0 && ` · sent ${formatCurrency(b.settledOut)}`}
                            {b.settledIn > 0 && ` · received ${formatCurrency(b.settledIn)}`}
                          </p>
                        </div>
                      </div>
                      <div className={`text-sm font-semibold tabular-nums whitespace-nowrap ${positive ? 'text-teal-600' : negative ? 'text-[#C47C7C]' : 'text-gray-400'}`}>
                        {positive || negative ? formatSignedCurrency(b.net) : 'settled'}
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden" aria-hidden="true">
                      <div
                        className={`h-full rounded-full ${positive ? 'bg-teal-400' : negative ? 'bg-[#C47C7C]' : 'bg-gray-200'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Suggested transfers */}
        <Card className="p-6 bg-gray-50 border-transparent lg:col-span-2">
          <div className="flex items-baseline justify-between mb-5">
            <h3 className="text-lg font-medium text-gray-900">How to settle up</h3>
            {transfers.length > 0 && <span className="text-xs text-gray-500">{pluralize(transfers.length, 'payment')}</span>}
          </div>
          {transfers.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-teal-400 mx-auto mb-3" aria-hidden="true" />
              <p className="text-gray-700 font-medium">All settled up!</p>
              <p className="text-sm text-gray-500">No one owes anything on this trip.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-4">
                Fewest payments to clear {formatCurrency(outstanding)} in debts.
              </p>
              <ul className="space-y-3">
                {transfers.map((t) => (
                  <li key={`${t.from}-${t.to}`} className="bg-white p-3.5 rounded-lg shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 text-sm">
                        {avatarOf(t.from, 'xs')}
                        <span className="font-medium text-gray-900 truncate">{nameOf(t.from)}</span>
                        <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
                        {avatarOf(t.to, 'xs')}
                        <span className="font-medium text-gray-900 truncate">{nameOf(t.to)}</span>
                      </div>
                      <span className="font-semibold text-gray-900 tabular-nums whitespace-nowrap">{formatCurrency(t.amount)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">
                      {nameOf(t.from)} {t.from === ME_ID ? 'pay' : 'pays'} {nameOf(t.to)} {formatCurrency(t.amount)}
                    </p>
                    <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => openFromTransfer(t)}>
                      <CheckCircle className="w-4 h-4 mr-1.5" aria-hidden="true" /> Mark as settled
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Button variant="ghost" size="sm" className="mt-4 w-full" onClick={openManual} disabled={people.length < 2}>
            <Plus className="w-4 h-4 mr-1" aria-hidden="true" /> Record a payment manually
          </Button>
        </Card>
      </div>

      {/* Settlement history */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Payments recorded</h3>
          <span className="text-xs text-gray-400">{pluralize(settlements.length, 'payment')}</span>
        </div>
        {sortedSettlements.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500">
            <HandCoins className="w-8 h-8 text-gray-300 mx-auto mb-2" aria-hidden="true" />
            No payments yet. When someone pays someone back, mark it as settled above.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sortedSettlements.map((s) => (
              <li key={s.id} className="py-3 flex items-center justify-between gap-3 group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex -space-x-1.5">
                    {avatarOf(s.from, 'xs')}
                    {avatarOf(s.to, 'xs')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 truncate">
                      <span className="font-medium">{nameOf(s.from)}</span> paid{' '}
                      <span className="font-medium">{nameOf(s.to)}</span>
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {formatDate(s.date)}
                      {s.note ? ` · ${s.note}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 tabular-nums">{formatCurrency(s.amount)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                    onClick={() => setPendingDelete(s)}
                    aria-label={`Undo payment from ${nameOf(s.from)} to ${nameOf(s.to)}`}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Record payment modal */}
      <Modal
        isOpen={draft !== null}
        onClose={() => {
          setDraft(null);
          setDraftError(undefined);
        }}
        title="Record a payment"
        description="This is recorded as a settlement and reduces what the payer owes."
        size="sm"
      >
        {draft && (
          <form onSubmit={submitDraft} noValidate className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="From"
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                options={people.map((p) => ({ value: p.id, label: p.name }))}
              />
              <Select
                label="To"
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                options={people.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>
            <Input
              label="Amount"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              prefix="$"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              hint={draft.suggested !== undefined ? `Suggested: ${formatCurrency(draft.suggested)}. Enter less for a partial payment.` : undefined}
              required
              autoFocus
            />
            <Input label="Date" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required />
            <Input label="Note (optional)" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="e.g. Bank transfer" />
            {draftError && <p className="text-sm text-[#C47C7C]">{draftError}</p>}
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button type="submit">Record payment</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteSettlement(pendingDelete.id);
          setPendingDelete(null);
        }}
        title="Undo payment"
        confirmLabel="Undo"
        message={
          pendingDelete ? (
            <>
              Remove the {formatCurrency(pendingDelete.amount)} payment from <strong>{nameOf(pendingDelete.from)}</strong> to{' '}
              <strong>{nameOf(pendingDelete.to)}</strong>? Their balances will go back to what they were.
            </>
          ) : null
        }
      />
    </div>
  );
};

export default SettleTab;
export { SettleTab };
