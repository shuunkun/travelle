'use client'

import React, { useState } from 'react';
import { MapPin, Clock, Plus, Pencil, Trash2, ChevronUp, ChevronDown, CalendarDays } from 'lucide-react';
import { Activity, Trip } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ActivityModal } from './ActivityModal';
import { useApp } from '@/components/providers/AppProvider';
import { formatDate, formatWeekday, getCategoryIcon, getCategoryLabel, pluralize } from '@/lib/utils';
import { isDayInRange } from '@/lib/trip-helpers';

export interface ItineraryTabProps {
  trip: Trip;
  today: string;
}

function formatTime(time: string): string {
  if (!time) return 'Anytime';
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

const ItineraryTab: React.FC<ItineraryTabProps> = ({ trip, today }) => {
  const { addActivity, updateActivity, deleteActivity, moveActivity, moveActivityToDay } = useApp();
  const [modal, setModal] = useState<{ date: string; activity?: Activity } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ date: string; activity: Activity } | null>(null);

  const totalActivities = trip.itinerary.reduce((sum, d) => sum + d.activities.length, 0);
  const firstInRangeIndex = trip.itinerary.findIndex((d) => isDayInRange(trip, d.date));

  const handleSave = (targetDate: string, input: Omit<Activity, 'id'>) => {
    if (!modal) return;
    if (modal.activity) {
      if (targetDate !== modal.date) {
        // Move then update so the activity keeps its id.
        moveActivityToDay(trip.id, modal.date, targetDate, modal.activity.id);
        updateActivity(trip.id, targetDate, modal.activity.id, input);
      } else {
        updateActivity(trip.id, modal.date, modal.activity.id, input);
      }
    } else {
      addActivity(trip.id, targetDate, input);
    }
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {pluralize(trip.itinerary.length, 'day')} · {pluralize(totalActivities, 'activity', 'activities')}
        </p>
        <Button size="sm" onClick={() => setModal({ date: trip.itinerary[0].date })} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
          Add activity
        </Button>
      </div>

      {trip.itinerary.map((day, dayIndex) => {
        const inRange = isDayInRange(trip, day.date);
        const isToday = day.date === today;
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

            <div className="p-5 sm:p-6">
              {day.activities.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-3">Nothing planned yet.</p>
              ) : (
                <ol className="space-y-5">
                  {day.activities.map((activity, index) => (
                    <li key={activity.id} className="flex relative">
                      {index !== day.activities.length - 1 && (
                        <div className="absolute left-[15px] top-9 bottom-[-20px] w-0.5 bg-gray-100" aria-hidden="true" />
                      )}
                      <div className="flex flex-col items-center mr-4 shrink-0">
                        <div className="w-8 h-8 rounded-full bg-[#E8F0EA] flex items-center justify-center text-sm" title={getCategoryLabel(activity.category)}>
                          <span aria-hidden="true">{getCategoryIcon(activity.category)}</span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 bg-white p-4 rounded-xl border border-gray-100 shadow-sm group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center text-xs font-medium text-[#7C9A82] mb-1">
                              <Clock className="w-3 h-3 mr-1" aria-hidden="true" /> {formatTime(activity.time)}
                            </div>
                            <h4 className="text-base font-medium text-gray-900 break-words">{activity.title}</h4>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0 opacity-60 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              disabled={index === 0}
                              onClick={() => moveActivity(trip.id, day.date, activity.id, -1)}
                              aria-label={`Move ${activity.title} up`}
                            >
                              <ChevronUp size={15} aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              disabled={index === day.activities.length - 1}
                              onClick={() => moveActivity(trip.id, day.date, activity.id, 1)}
                              aria-label={`Move ${activity.title} down`}
                            >
                              <ChevronDown size={15} aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => setModal({ date: day.date, activity })}
                              aria-label={`Edit ${activity.title}`}
                            >
                              <Pencil size={14} aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 hover:text-red-500"
                              onClick={() => setPendingDelete({ date: day.date, activity })}
                              aria-label={`Delete ${activity.title}`}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                        {activity.location && (
                          <div className="text-sm text-gray-500 flex items-start mt-1.5">
                            <MapPin className="w-3.5 h-3.5 mr-1 mt-0.5 shrink-0" aria-hidden="true" />
                            <span className="break-words">{activity.location}</span>
                          </div>
                        )}
                        {activity.notes && (
                          <p className="text-sm text-gray-600 bg-gray-50 p-2.5 rounded-md mt-2 whitespace-pre-wrap break-words">{activity.notes}</p>
                        )}
                      </div>
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

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteActivity(trip.id, pendingDelete.date, pendingDelete.activity.id);
          setPendingDelete(null);
        }}
        title="Delete activity"
        confirmLabel="Delete"
        message={
          <>
            Remove <strong>{pendingDelete?.activity.title}</strong> from {pendingDelete ? formatDate(pendingDelete.date) : ''}?
          </>
        }
      />
    </div>
  );
};

export default ItineraryTab;
export { ItineraryTab };
