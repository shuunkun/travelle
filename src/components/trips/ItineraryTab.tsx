'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BedDouble, CalendarDays, LogOut, Plus, Receipt, Sparkles } from 'lucide-react';
import { SmartImport } from './SmartImport';
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
  /** When set, open this activity's editor (e.g. clicking a booking on Overview). */
  editActivityId?: string | null;
  onEditHandled?: () => void;
}

const ItineraryTab: React.FC<ItineraryTabProps> = ({
  trip,
  today,
  focusActivityId,
  onFocusHandled,
  editActivityId,
  onEditHandled,
}) => {
  const {
    friends,
    expenses,
    addActivity,
    updateActivity,
    deleteActivity,
    moveActivity,
    moveActivityToDay,
    addExpense,
    updateExpense,
    linkExpenseToActivity,
  } = useApp();

  const [localModal, setLocalModal] = useState<{ date: string; activity?: Activity } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ date: string; activity: Activity } | null>(null);
  const [costTarget, setCostTarget] = useState<{ date: string; activity: Activity } | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [linkTarget, setLinkTarget] = useState<Activity | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  const requestedEdit = (() => {
    if (!editActivityId) return null;
    for (const day of trip.itinerary) {
      const activity = day.activities.find((a) => a.id === editActivityId);
      if (activity) return { date: day.date, activity };
    }
    return null;
  })();

  const modal = localModal ?? requestedEdit;

  const closeModal = () => {
    setLocalModal(null);
    if (requestedEdit) onEditHandled?.();
  };

  const tripExpenses = useMemo(() => getTripExpenses(expenses, trip.id), [expenses, trip.id]);
  const members = useMemo(() => getTripMembers(trip, friends), [trip, friends]);
  const linkedCount = useMemo(() => tripExpenses.filter((e) => e.activityId).length, [tripExpenses]);

  const totalActivities = trip.itinerary.reduce((sum, d) => sum + d.activities.length, 0);
  const firstInRangeIndex = trip.itinerary.findIndex((d) => isDayInRange(trip, d.date));

  const activeHighlightId = focusActivityId ?? null;

  // Which day is nearest the top of the viewport, for the day strip.
  const [activeDate, setActiveDate] = useState<string | null>(null);
  useEffect(() => {
    if (trip.itinerary.length < 2) return;
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-day]'));
    if (!cards.length) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const date = (entry.target as HTMLElement).dataset.day!;
          if (entry.isIntersecting) visible.set(date, entry.boundingClientRect.top);
          else visible.delete(date);
        }
        if (!visible.size) return;
        // The visible day whose top is highest on screen.
        const [top] = [...visible.entries()].sort((a, b) => a[1] - b[1]);
        setActiveDate(top[0]);
      },
      { rootMargin: '-140px 0px -45% 0px', threshold: 0 },
    );
    cards.forEach((c) => observer.observe(c));
    return () => observer.disconnect();
  }, [trip.itinerary]);

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
          {linkedCount > 0 && <span className="hidden sm:inline"> · {pluralize(linkedCount, 'linked expense')}</span>}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setPasteOpen(true)} aria-label="Paste plans">
            <Sparkles className="w-4 h-4 sm:mr-2" aria-hidden="true" />
            <span className="hidden sm:inline">Paste plans</span>
          </Button>
          <Button size="sm" onClick={() => setLocalModal({ date: trip.itinerary[0].date })} aria-label="Add activity">
            <Plus className="w-4 h-4 sm:mr-2" aria-hidden="true" />
            <span className="hidden sm:inline">Add activity</span>
          </Button>
        </div>
      </div>

      {trip.itinerary.length > 1 && (
        <DayStrip trip={trip} today={today} activeDate={activeDate} firstInRangeIndex={firstInRangeIndex} />
      )}

      <Modal
        isOpen={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Paste plans"
        description="Bookings, notes or a day-by-day plan. Review what we found before adding."
        size="lg"
      >
        {pasteOpen && <SmartImport mode="existing" trip={trip} onDone={() => setPasteOpen(false)} onCancel={() => setPasteOpen(false)} />}
      </Modal>

      {trip.itinerary.map((day, dayIndex) => {
        const inRange = isDayInRange(trip, day.date);
        const isToday = day.date === today;
        const stays = hotelStaysForDate(trip, day.date);
        return (
          <Card key={day.date} id={dayElementId(day.date)} data-day={day.date} className="overflow-hidden p-0 scroll-mt-36 sm:scroll-mt-40">
            <div className="bg-gray-50 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-3">
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
              <Button variant="outline" size="sm" onClick={() => setLocalModal({ date: day.date })}>
                <Plus className="w-4 h-4 mr-1" aria-hidden="true" /> Add
              </Button>
            </div>

            <div className="p-3 sm:p-6 space-y-4">
              {stays.length > 0 && (
                <ul className="space-y-2" aria-label="Where you're staying">
                  {stays.map((stay) => {
                    const hotel = stay.activity.details.hotelName || stay.activity.title;
                    return (
                      <li key={stay.activity.id}>
                        <button
                          type="button"
                          onClick={() => setLocalModal({ date: activityHomeDate(stay.activity, day.date), activity: stay.activity })}
                          className="w-full flex items-center gap-2.5 rounded-lg bg-purple-50/70 border border-purple-100 px-3 py-2 text-left text-sm text-purple-800 hover:bg-purple-50 hover:border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-300"
                          title="Edit this stay"
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
                <button
                  type="button"
                  onClick={() => setLocalModal({ date: day.date })}
                  className="w-full text-gray-400 text-sm text-center py-3 rounded-lg border border-dashed border-transparent hover:border-gray-200 hover:bg-gray-50 hover:text-[#7C9A82] transition-colors"
                >
                  {stays.length > 0 ? 'Add something else…' : 'Nothing planned yet — click to add'}
                </button>
              ) : (
                <ol className="space-y-5">
                  {day.activities.map((activity, index) => (
                    <li key={activity.id} className="flex relative">
                      {index !== day.activities.length - 1 && (
                        <div className="absolute left-[15px] top-9 bottom-[-20px] w-0.5 bg-gray-100" aria-hidden="true" />
                      )}
                      <div className="flex flex-col items-center mr-3 sm:mr-4 shrink-0">
                        <ActivityMarker activity={activity} />
                      </div>
                      <ActivityCard
                        activity={activity}
                        index={index}
                        count={day.activities.length}
                        linkedExpenses={expensesForActivity(tripExpenses, activity.id)}
                        highlighted={activeHighlightId === activity.id}
                        onEdit={() => setLocalModal({ date: day.date, activity })}
                        onDelete={() => setPendingDelete({ date: day.date, activity })}
                        onMove={(direction) => moveActivity(trip.id, day.date, activity.id, direction)}
                        onAddCost={() => openAddCost(day.date, activity)}
                        onLinkExpense={() => setLinkTarget(activity)}
                        onUnlinkExpense={(expenseId) => linkExpenseToActivity(expenseId, undefined)}
                        onEditExpense={(expense) => setEditingExpense(expense)}
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
          onClose={closeModal}
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

      {editingExpense && (
        <ExpenseModal
          isOpen
          onClose={() => setEditingExpense(null)}
          trip={trip}
          members={members}
          expense={editingExpense}
          onSave={(input) => updateExpense(editingExpense.id, input)}
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

const dayElementId = (date: string) => `day-${date}`;

/** Sticky row of day chips; click one to jump to that day. */
function DayStrip({
  trip,
  today,
  activeDate,
  firstInRangeIndex,
}: {
  trip: Trip;
  today: string;
  activeDate: string | null;
  firstInRangeIndex: number;
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the active chip in view as the page scrolls.
  useEffect(() => {
    if (!activeDate || !stripRef.current) return;
    const chip = stripRef.current.querySelector<HTMLElement>(`[data-chip="${CSS.escape(activeDate)}"]`);
    chip?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeDate]);

  const jump = (date: string) => {
    document.getElementById(dayElementId(date))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="sticky top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 bg-[#fafafa]/95 backdrop-blur-sm">
      <div ref={stripRef} role="list" aria-label="Jump to a day" className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
        {trip.itinerary.map((day, index) => {
          const inRange = isDayInRange(trip, day.date);
          const isToday = day.date === today;
          const active = day.date === activeDate;
          const hasPlans = day.activities.length > 0 || hotelStaysForDate(trip, day.date).length > 0;
          const dayNumber = inRange ? index - firstInRangeIndex + 1 : null;
          return (
            <button
              key={day.date}
              type="button"
              role="listitem"
              data-chip={day.date}
              onClick={() => jump(day.date)}
              aria-label={`${dayNumber ? `Day ${dayNumber}, ` : ''}${formatWeekday(day.date)} ${formatDate(day.date)}${isToday ? ', today' : ''}`}
              aria-current={active ? 'true' : undefined}
              className={`shrink-0 flex flex-col items-center rounded-lg border px-2.5 py-1 min-w-12 text-xs leading-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C9A82] ${
                active
                  ? 'border-[#7C9A82] bg-[#7C9A82] text-white'
                  : isToday
                    ? 'border-[#7C9A82] bg-[#E8F0EA] text-[#3F5A45] hover:bg-[#dde9e0]'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className={`uppercase tracking-wide ${active ? 'text-white/80' : 'text-gray-400'} ${isToday && !active ? 'text-[#5A7A60]' : ''}`}>
                {isToday ? 'Today' : formatDate(day.date, { weekday: 'short' })}
              </span>
              <span className="font-semibold text-sm">{formatDate(day.date, { month: 'short', day: 'numeric' })}</span>
              <span
                aria-hidden="true"
                className={`mt-0.5 h-1 w-1 rounded-full ${hasPlans ? (active ? 'bg-white' : 'bg-[#7C9A82]') : 'bg-transparent'}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ItineraryTab;
export { ItineraryTab };
