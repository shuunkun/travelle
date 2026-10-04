'use client'

import React from 'react';
import { CalendarDays, Receipt, Users, Wallet } from 'lucide-react';
import { Friend, Trip } from '@/lib/types';
import { TripFinancials } from '@/lib/selectors';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ChecklistCard } from './ChecklistCard';
import { compareDateKeys, formatCurrency, formatSignedCurrency, getCategoryIcon, getDaysBetween, pluralize, formatDate } from '@/lib/utils';
import { ME_ID } from '@/lib/selectors';

export interface OverviewTabProps {
  trip: Trip;
  members: Friend[];
  financials: TripFinancials;
  onGoTo: (tab: 'itinerary' | 'expenses' | 'settle') => void;
}

const OverviewTab: React.FC<OverviewTabProps> = ({ trip, members, financials, onGoTo }) => {
  const { expenses, spent, balances, transfers } = financials;
  const days = getDaysBetween(trip.startDate, trip.endDate);
  const activities = trip.itinerary.reduce((sum, d) => sum + d.activities.length, 0);
  const remaining = trip.budget - spent;
  const budgetPct = trip.budget > 0 ? (spent / trip.budget) * 100 : 0;
  const myBalance = balances.find((b) => b.friendId === ME_ID);
  const recent = [...expenses].sort((a, b) => compareDateKeys(b.date, a.date)).slice(0, 4);

  const stats = [
    { icon: CalendarDays, label: pluralize(days, 'day'), sub: `${activities} planned` },
    { icon: Users, label: pluralize(members.length, 'traveler'), sub: 'on this trip' },
    { icon: Receipt, label: pluralize(expenses.length, 'expense'), sub: formatCurrency(spent) },
    {
      icon: Wallet,
      label: transfers.length === 0 ? 'Settled' : pluralize(transfers.length, 'payment'),
      sub: transfers.length === 0 ? 'nothing owed' : 'to settle up',
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s) => (
            <Card key={s.label + s.sub} className="p-4">
              <s.icon className="w-5 h-5 text-[#7C9A82] mb-2" aria-hidden="true" />
              <p className="text-sm font-semibold text-gray-900">{s.label}</p>
              <p className="text-xs text-gray-500">{s.sub}</p>
            </Card>
          ))}
        </div>

        {trip.description && (
          <section>
            <h2 className="text-xl font-medium text-gray-900 mb-3">About</h2>
            <p className="text-gray-600 whitespace-pre-wrap leading-relaxed">{trip.description}</p>
          </section>
        )}

        <section>
          <h2 className="text-xl font-medium text-gray-900 mb-4">Travelers</h2>
          {members.length === 0 ? (
            <p className="text-sm text-gray-500">No travelers yet. Edit the trip to add friends.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {members.map((friend) => {
                const balance = balances.find((b) => b.friendId === friend.id);
                const net = balance?.net ?? 0;
                return (
                  <div key={friend.id} className="flex items-center gap-3 bg-white p-3 pr-4 rounded-xl border border-gray-100 shadow-sm">
                    <Avatar name={friend.name} color={friend.color} />
                    <div className="text-sm">
                      <p className="font-medium text-gray-900">
                        {friend.name}
                        {friend.id === ME_ID && <span className="ml-1 text-xs text-gray-400">(you)</span>}
                      </p>
                      <p className={`text-xs ${net > 0.004 ? 'text-teal-600' : net < -0.004 ? 'text-[#C47C7C]' : 'text-gray-400'}`}>
                        {net > 0.004 ? `is owed ${formatCurrency(net)}` : net < -0.004 ? `owes ${formatCurrency(-net)}` : 'settled up'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <ChecklistCard trip={trip} />
      </div>

      <div className="space-y-6">
        <Card className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Budget</h3>
          {trip.budget > 0 ? (
            <>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-semibold text-gray-900">{formatCurrency(spent)}</span>
                <span className="text-sm text-gray-500">of {formatCurrency(trip.budget)}</span>
              </div>
              <ProgressBar value={budgetPct} size="md" label="Budget used" className="mb-3" />
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{Math.round(budgetPct)}% used</span>
                <span className={`font-medium ${remaining < 0 ? 'text-[#C47C7C]' : 'text-teal-600'}`}>
                  {remaining < 0 ? `${formatCurrency(-remaining)} over` : `${formatCurrency(remaining)} left`}
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold text-gray-900 mb-1">{formatCurrency(spent)}</p>
              <p className="text-sm text-gray-500">spent so far. No budget set.</p>
            </>
          )}
          {myBalance && (myBalance.net > 0.004 || myBalance.net < -0.004) && (
            <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between text-sm">
              <span className="text-gray-500">Your balance</span>
              <button type="button" onClick={() => onGoTo('settle')} className={`font-medium hover:underline ${myBalance.net > 0 ? 'text-teal-600' : 'text-[#C47C7C]'}`}>
                {formatSignedCurrency(myBalance.net)}
              </button>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">Recent expenses</h3>
            <button type="button" onClick={() => onGoTo('expenses')} className="text-sm text-[#7C9A82] hover:underline">
              View all
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No expenses yet.</p>
          ) : (
            <ul className="space-y-3">
              {recent.map((exp) => (
                <li key={exp.id} className="flex justify-between items-center gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl" aria-hidden="true">{getCategoryIcon(exp.category)}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{exp.description}</p>
                      <p className="text-xs text-gray-400">{formatDate(exp.date)}</p>
                    </div>
                  </div>
                  <span className="text-sm font-medium tabular-nums whitespace-nowrap">{formatCurrency(exp.amount, exp.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-medium text-gray-900">Up next</h3>
            <button type="button" onClick={() => onGoTo('itinerary')} className="text-sm text-[#7C9A82] hover:underline">
              Itinerary
            </button>
          </div>
          {(() => {
            const nextDay = trip.itinerary.find((d) => d.activities.length > 0);
            if (!nextDay) return <p className="text-sm text-gray-500">Nothing planned yet.</p>;
            return (
              <div>
                <p className="text-xs text-gray-400 mb-2">{formatDate(nextDay.date)}</p>
                <ul className="space-y-1.5">
                  {nextDay.activities.slice(0, 3).map((a) => (
                    <li key={a.id} className="text-sm text-gray-700 flex items-center gap-2">
                      <span aria-hidden="true">{getCategoryIcon(a.category)}</span>
                      <span className="truncate">{a.title}</span>
                      {a.time && <span className="ml-auto text-xs text-gray-400">{a.time}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </Card>
      </div>
    </div>
  );
};

export default OverviewTab;
export { OverviewTab };
