'use client'

import React, { useEffect, useMemo, useState } from 'react';
import { BedDouble, CalendarDays, LogOut, Plus, Receipt } from 'lucide-react';
import { Activity, Expense, Trip } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ExpenseModal } from '@/components/expenses/ExpenseModal';
import { ActivityModal } from './ActivityModal';
import { ActivityCard, ActivityMarker } from './ActivityCard';
import { useApp } from '@/components/providers/AppProvider';
import {
  compareDateKeys,
  formatCurrency,
  formatDate,
  formatWeekday,
  getCategoryIcon,
  pluralize,
} from '@/lib/utils';
import { isDayInRange } from '@/lib/trip-helpers';
import { getTripExpenses, getTripMembers } from '@/lib/selectors';
import {
  activityHomeDate,
  expensesForActivity,
  formatTime12,
  hotelCheckOutTime,
  hotelStaysForDate,
  unlinkedExpenses,
} from '@/lib/activities';

export interface ItineraryTabProps {
  trip: Trip;
  today: string;
  /** When set, scroll to and briefly highlight this activity (e.g. coming from an expense chip). */
  focusActivityId?: string | null;
  /** Called once the focus request has been handled so the parent can clear it. */
  onFocusHandled?: () => void;
}

const ItineraryTab: React.FC<ItineraryTabProps> = ({ trip, today, focusActivityId, onFocusHandled }) => {
  const {
    friends,
    expenses,
    addActivity,
    updateActivity,
    deleteActivity,
    moveActivity,
    moveActivityToDay,
    addExpense,
    linkExpenseToActivity,
  } = useApp();

  const [modal, setModal] = useState<{ date: string; activity?: Activity } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ date: string; activity: Activity } | null>(null);
  const [costTarget, setCostTarget] = useState<{ date: string; activity: Activity } | null>(null);
  const [linkTarget, setLinkTarget] = useState<Activity | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const tripExpenses = useMemo(() => getTripExpenses(expenses, trip.id), [expenses, trip.id]);
  const members = useMemo(() => getTripMembers(trip, friends), [trip, friends]);
  const linkedCount = useMemo(() => tripExpenses.filter((e) => e.activityId).length, [tripExpenses]);

  const totalActivities = trip.itinerary.reduce((sum, d) => sum + d.activities.length, 0);
  const firstInRangeIndex = trip.itinerary.findIndex((d) => isDayInRange(trip, d.date));

  // A focus request from the parent (e.g. an expense chip) highlights the
  // activity for as long as the request is pending; the parent clears it via
  // `onFocusHandled`. Local highlights (stay banners) use `highlightedId`.
  const activeHighlightId = highlightedId ?? focusActivityId ?? null;

  // Scroll to a requested activity once it's in the DOM (no state writes here —
  // the highlight is derived from the prop above).
  useEffect(() => {
    if (!focusActivityId) return;
    const el = document.querySelector<HTMLElement>(`[data-activity-id="${CSS.escape(focusActivityId)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => onFocusHandled?.(), 2500);
    return () => window.clearTimeout(timer);
  }, [focusActivityId, onFocusHandled]);

  const focusActivity = (activityId: string) => {
    const el = document.querySelector<HTMLElement>(`[data-activity-id="${CSS.escape(activityId)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
    setHighlightedId(activityId);
    window.setTimeout(() => setHighlightedId((cur) => (cur === activityId ? null : cur)), 2500);
  };

  const handleSave = (targetDate: string, input: Omit<Activity, 'id'>) => {
    if (!modal) return;
    if (modal.activity) {
      if (targetDate !== modal.date) {
        // Move then update so the activity keeps its id (and its expense links).
        moveActivityToDay(trip.id, modal.date, targetDate, modal.activity.id);
        updateActivity(trip.id, targetDate, modal.activity.id, input);
      } else {
        updateActivity(trip.id, modal.date, modal.activity.id, input);
      }
    } else {
      addActivity(trip.id, targetDate, input);
    }
  };

  const openAddCost = (date: string, activity: Activity) => setCostTarget({ date, activity });

  const handleAddCost = (input: Omit<Expense, 'id'>) => {
    addExpense(input);
  };

  if (trip.itinerary.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="w-6 h-6" aria-hidden="true" />}
        title="No days to plan yet"
        description="Set the trip's start and end dates and we'll create a day-by-day itinerary for you."
      />
    );
  }

  const availableToLink = linkTarget ? unlinkedExpenses(tripExpenses) : [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {pluralize(trip.itinerary.length, 'day')} · {pluralize(totalActivities, 'activity', 'activities')}
          {linkedCount > 0 && <> · {pluralize(linkedCount, 'linked expense')}</>}
        </p>
        <Button size="sm" onClick={() => setModal({ date: trip.itinerary[0].date })} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
          Add activity
        </Button>
      </div>

      {trip.itinerary.map((day, dayIndex) => {
        const inRange = isDayInRange(trip, day.date);
        const isToday = day.date === today;
        const stays = hotelStaysForDate(trip, day.date);
        return (
          <Card key={day.date} className="overflow-hidden p-0">
            <div className="bg-gray-50 px-5 sm:px-6 py-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-medium text-gray-900">
                    {inRange ? `Day ${dayIndex - firstInRangeIndex + 1}` : 'Outside trip dates'}
                  </h3>
                  {isToday && <Badge variant="success">Today</Badge>}
                </div>
                <p className="text-sm text-gray-500">
                  {formatWeekday(day.date)}, {formatDate(day.date)}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setModal({ date: day.date })}>
                <Plus className="w-4 h-4 mr-1" aria-hidden="true" /> Add
              </Button>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              {stays.length > 0 && (
                <ul className="space-y-2" aria-label="Where you're staying">
                  {stays.map((stay) => {
                    const hotel = stay.activity.details.hotelName || stay.activity.title;
                    return (
                      <li key={stay.activity.id}>
                        <button
                          type="button"
                          onClick={() => focusActivity(stay.activity.id)}
                          className="w-full flex items-center gap-2.5 rounded-lg bg-purple-50/70 border border-purple-100 px-3 py-2 text-left text-sm text-purple-800 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-300"
                          title="Jump to this booking"
                        >
                          {stay.isCheckOut ? (
                            <LogOut className="w-4 h-4 shrink-0 text-purple-500" aria-hidden="true" />
                          ) : (
                            <BedDouble className="w-4 h-4 shrink-0 text-purple-500" aria-hidden="true" />
                          )}
                          <span className="min-w-0 truncate">
                            {stay.isCheckOut ? (
                              <>
                                <span className="font-medium">Check-out</span> from {hotel}
                                <span className="text-purple-500"> · by {formatTime12(hotelCheckOutTime(stay.activity.details))}</span>
                              </>
                            ) : (
                              <>
                                <span className="font-medium">Staying at</span> {hotel}
                                {stay.totalNights > 0 && (
                                  <span className="text-purple-500"> · night {stay.nightNumber} of {stay.totalNights}</span>
                                )}
                              </>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {day.activities.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-3">
                  {stays.length > 0 ? 'Nothing else planned.' : 'Nothing planned yet.'}
                </p>
              ) : (
                <ol className="space-y-5">
                  {day.activities.map((activity, index) => (
                    <li key={activity.id} className="flex relative">
                      {index !== day.activities.length - 1 && (
                        <div className="absolute left-[15px] top-9 bottom-[-20px] w-0.5 bg-gray-100" aria-hidden="true" />
                      )}
                      <div className="flex flex-col items-center mr-4 shrink-0">
                        <ActivityMarker activity={activity} />
                      </div>
                      <ActivityCard
                        activity={activity}
                        index={index}
                        count={day.activities.length}
                        linkedExpenses={expensesForActivity(tripExpenses, activity.id)}
                        highlighted={activeHighlightId === activity.id}
                        onEdit={() => setModal({ date: day.date, activity })}
                        onDelete={() => setPendingDelete({ date: day.date, activity })}
                        onMove={(direction) => moveActivity(trip.id, day.date, activity.id, direction)}
                        onAddCost={() => openAddCost(day.date, activity)}
                        onLinkExpense={() => setLinkTarget(activity)}
                        onUnlinkExpense={(expenseId) => linkExpenseToActivity(expenseId, undefined)}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>
        );
      })}

      {modal && (
        <ActivityModal
          isOpen
          onClose={() => setModal(null)}
          trip={trip}
          date={modal.date}
          activity={modal.activity}
          onSave={handleSave}
        />
      )}

      {costTarget && (
        <ExpenseModal
          isOpen
          onClose={() => setCostTarget(null)}
          trip={trip}
          members={members}
          defaults={{
            activityId: costTarget.activity.id,
            description: costTarget.activity.title,
            date: activityHomeDate(costTarget.activity, costTarget.date),
            category: costTarget.activity.category,
            amount: costTarget.activity.estimatedCost,
          }}
          onSave={handleAddCost}
        />
      )}

      <Modal
        isOpen={linkTarget !== null}
        onClose={() => setLinkTarget(null)}
        title="Link an existing expense"
        description={linkTarget ? `Attach one of this trip's unlinked expenses to “${linkTarget.title}”.` : undefined}
      >
        {availableToLink.length === 0 ? (
          <EmptyState
            icon={<Receipt className="w-6 h-6" aria-hidden="true" />}
            title="No unlinked expenses"
            description="Every expense on this trip is already linked to an activity. Use “Add cost” to record a new one."
            action={
              linkTarget ? (
                <Button
                  onClick={() => {
                    const target = linkTarget;
                    setLinkTarget(null);
                    const located = trip.itinerary.find((d) => d.activities.some((a) => a.id === target.id));
                    openAddCost(located?.date ?? trip.itinerary[0].date, target);
                  }}
                >
                  Add cost instead
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 max-h-[60vh] overflow-y-auto">
            {[...availableToLink]
              .sort((a, b) => compareDateKeys(b.date, a.date))
              .map((expense) => (
                <li key={expense.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (linkTarget) linkExpenseToActivity(expense.id, linkTarget.id);
                      setLinkTarget(null);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 focus:outline-none focus:bg-[#E8F0EA]"
                  >
                    <span className="text-lg" aria-hidden="true">{getCategoryIcon(expense.category)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 truncate">{expense.description}</span>
                      <span className="block text-xs text-gray-400">{formatDate(expense.date)}</span>
                    </span>
                    <span className="text-sm font-medium tabular-nums text-gray-900">{formatCurrency(expense.amount, expense.currency)}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteActivity(trip.id, pendingDelete.date, pendingDelete.activity.id);
          setPendingDelete(null);
        }}
        title="Delete activity"
        confirmLabel="Delete"
        message={(() => {
          if (!pendingDelete) return null;
          const linked = expensesForActivity(tripExpenses, pendingDelete.activity.id);
          return (
            <>
              Remove <strong>{pendingDelete.activity.title}</strong> from {formatDate(pendingDelete.date)}?
              {linked.length > 0 && (
                <>
                  {' '}
                  {pluralize(linked.length, 'linked expense')} will be kept but unlinked.
                </>
              )}
            </>
          );
        })()}
      />
    </div>
  );
};

export default ItineraryTab;
export { ItineraryTab };
