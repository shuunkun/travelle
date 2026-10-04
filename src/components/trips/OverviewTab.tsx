'use client'

import React from 'react';
import { BedDouble, CalendarDays, ChevronRight, Plane, Receipt, Users, Wallet } from 'lucide-react';
import { Expense, Friend, Trip } from '@/lib/types';
import { TripFinancials } from '@/lib/selectors';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ChecklistCard } from './ChecklistCard';
import { compareDateKeys, formatCurrency, formatSignedCurrency, getCategoryIcon, getDaysBetween, pluralize, formatDate } from '@/lib/utils';
import { ME_ID } from '@/lib/selectors';
import {
  LocatedActivity,
  activityActualCost,
  flightArrivalDayOffset,
  flightArrivalTime,
  flightDepartureDate,
  flightDepartureTime,
  formatTime12,
  getPlannedVsActual,
  hotelNights,
  isFlightActivity,
  isHotelActivity,
  listBookings,
} from '@/lib/activities';

export interface OverviewTabProps {
  trip: Trip;
  members: Friend[];
  financials: TripFinancials;
  onGoTo: (tab: 'itinerary' | 'expenses' | 'settle') => void;
  /** Jump to a specific activity in the itinerary. */
  onGoToActivity?: (activityId: string) => void;
}

const shortDate = (date: string) => formatDate(date, { month: 'short', day: 'numeric' });

/** One compact row in the Bookings list: a flight or hotel with its cost status. */
function BookingRow({
  entry,
  expenses,
  onSelect,
}: {
  entry: LocatedActivity;
  expenses: Expense[];
  onSelect?: (activityId: string) => void;
}) {
  const { activity } = entry;
  const actual = activityActualCost(expenses, activity.id);
  const linked = expenses.some((e) => e.activityId === activity.id);
  const planned = activity.estimatedCost;

  let icon: React.ReactNode = null;
  let summary: React.ReactNode = null;
  if (isFlightActivity(activity)) {
    const d = activity.details;
    const offset = flightArrivalDayOffset(d);
    icon = (
      <span className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
        <Plane className="w-4 h-4" aria-hidden="true" />
      </span>
    );
    summary = (
      <>
        {shortDate(flightDepartureDate(d))} · {formatTime12(flightDepartureTime(d))} → {formatTime12(flightArrivalTime(d))}
        {offset > 0 && <span className="text-[#C47C7C]"> +{offset}</span>}
      </>
    );
  } else if (isHotelActivity(activity)) {
    const d = activity.details;
    const nights = hotelNights(d);
    icon = (
      <span className="w-9 h-9 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
        <BedDouble className="w-4 h-4" aria-hidden="true" />
      </span>
    );
    summary = (
      <>
        {shortDate(d.checkInDate)} – {shortDate(d.checkOutDate)}
        {nights > 0 && <> · {pluralize(nights, 'night')}</>}
      </>
    );
  }

  const cost =
    linked ? (
      <span className={`text-sm font-medium tabular-nums ${planned !== undefined && actual > planned + 0.004 ? 'text-[#C47C7C]' : 'text-gray-900'}`}>
        {formatCurrency(actual)}
      </span>
    ) : planned !== undefined ? (
      <span className="text-sm tabular-nums text-gray-500">
        {formatCurrency(planned)} <span className="text-xs text-gray-400">planned</span>
      </span>
    ) : (
      <span className="text-xs text-gray-400">No cost yet</span>
    );

  const inner = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900 truncate">{activity.title}</span>
        <span className="block text-xs text-gray-500 truncate">
          {entry.dayNumber > 0 && <>Day {entry.dayNumber} · </>}
          {summary}
        </span>
      </span>
      <span className="shrink-0 text-right">{cost}</span>
      {onSelect && <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" aria-hidden="true" />}
    </>
  );

  if (!onSelect) {
    return <div className="flex items-center gap-3 px-3 py-2.5">{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(activity.id)}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 focus:outline-none focus-visible:bg-[#E8F0EA] rounded-lg"
      title="Show in itinerary"
    >
      {inner}
    </button>
  );
}

const OverviewTab: React.FC<OverviewTabProps> = ({ trip, members, financials, onGoTo, onGoToActivity }) => {
  const { expenses, spent, balances, transfers } = financials;
  const days = getDaysBetween(trip.startDate, trip.endDate);
  const activities = trip.itinerary.reduce((sum, d) => sum + d.activities.length, 0);
  const remaining = trip.budget - spent;
  const budgetPct = trip.budget > 0 ? (spent / trip.budget) * 100 : 0;
  const myBalance = balances.find((b) => b.friendId === ME_ID);
  const recent = [...expenses].sort((a, b) => compareDateKeys(b.date, a.date)).slice(0, 4);
  const bookings = listBookings(trip);
  const plan = getPlannedVsActual(trip, expenses);
  const hasPlan = plan.planned > 0 || plan.actual > 0;
  const planPct = plan.planned > 0 ? (plan.actual / plan.planned) * 100 : 0;
  const overPlan = plan.planned > 0 && plan.actual > plan.planned + 0.004;

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

        {bookings.length > 0 && (
          <section aria-labelledby="overview-bookings">
            <div className="flex items-baseline justify-between mb-4">
              <h2 id="overview-bookings" className="text-xl font-medium text-gray-900">
                Bookings
              </h2>
              <button type="button" onClick={() => onGoTo('itinerary')} className="text-sm text-[#7C9A82] hover:underline">
                Itinerary
              </button>
            </div>
            <Card className="p-1.5">
              <ul className="divide-y divide-gray-50">
                {bookings.map((entry) => (
                  <li key={entry.activity.id}>
                    <BookingRow entry={entry} expenses={expenses} onSelect={onGoToActivity} />
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}

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
          {hasPlan && (
            <div className="mt-4 pt-4 border-t border-gray-50">
              <div className="flex items-baseline justify-between text-sm mb-1.5">
                <span className="text-gray-500">Planned vs actual</span>
                <span className="font-medium tabular-nums text-gray-900">
                  {formatCurrency(plan.actual)}
                  <span className="text-gray-400 font-normal"> / {plan.planned > 0 ? formatCurrency(plan.planned) : '—'}</span>
                </span>
              </div>
              {plan.planned > 0 && <ProgressBar value={planPct} size="sm" label="Planned spend used" className="mb-1.5" />}
              <p className={`text-xs ${overPlan ? 'text-[#C47C7C] font-medium' : 'text-gray-400'}`}>
                {plan.planned > 0
                  ? overPlan
                    ? `${formatCurrency(plan.actual - plan.planned)} over plan`
                    : `${formatCurrency(plan.planned - plan.actual)} under plan`
                  : 'No estimates yet'}
                {' · '}
                {pluralize(plan.linkedExpenses, 'linked expense')} across {pluralize(plan.costedActivities, 'activity', 'activities')}
              </p>
            </div>
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
