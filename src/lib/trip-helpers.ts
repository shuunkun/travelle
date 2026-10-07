import { Activity, ChecklistItem, ItineraryDay, Trip } from './types';
import { compareDateKeys, eachDayInRange, generateId } from './utils';

/**
 * Make sure the itinerary has one entry for every day of the trip, in order.
 * Days outside the range are kept only if they still contain activities so
 * that shortening a trip never silently deletes plans.
 */
export function syncItineraryToRange(trip: Trip): Trip {
  const byDate = new Map<string, ItineraryDay>();
  for (const day of trip.itinerary ?? []) {
    const existing = byDate.get(day.date);
    byDate.set(day.date, {
      date: day.date,
      activities: [...(existing?.activities ?? []), ...(day.activities ?? [])],
    });
  }

  const inRange = new Set(eachDayInRange(trip.startDate, trip.endDate));
  for (const date of inRange) {
    if (!byDate.has(date)) byDate.set(date, { date, activities: [] });
  }

  const itinerary = Array.from(byDate.values())
    .filter((day) => inRange.has(day.date) || day.activities.length > 0)
    .sort((a, b) => compareDateKeys(a.date, b.date));

  return { ...trip, itinerary };
}

export function isDayInRange(trip: Trip, date: string): boolean {
  return compareDateKeys(date, trip.startDate) >= 0 && compareDateKeys(date, trip.endDate) <= 0;
}

function timeSortKey(time: string): string {
  // "09:30" sorts before "14:00"; empty time sorts last.
  return time ? time : '99:99';
}

function updateDay(trip: Trip, date: string, fn: (day: ItineraryDay) => ItineraryDay): Trip {
  const hasDay = trip.itinerary.some((d) => d.date === date);
  const itinerary = hasDay
    ? trip.itinerary.map((d) => (d.date === date ? fn(d) : d))
    : [...trip.itinerary, fn({ date, activities: [] })].sort((a, b) => compareDateKeys(a.date, b.date));
  return { ...trip, itinerary };
}

function insertSortedByTime(trip: Trip, date: string, activity: Activity): Trip {
  return updateDay(trip, date, (day) => {
    const activities = [...day.activities];
    const key = timeSortKey(activity.time);
    let index = activities.length;
    if (activity.time) {
      const found = activities.findIndex((a) => timeSortKey(a.time) > key);
      if (found !== -1) index = found;
    }
    activities.splice(index, 0, activity);
    return { ...day, activities };
  });
}

/** Insert an activity, keeping the day sorted by time when a time is set. */
export function addActivity(trip: Trip, date: string, input: Omit<Activity, 'id'>): Trip {
  return insertSortedByTime(trip, date, { ...input, id: generateId() });
}

export function updateActivity(
  trip: Trip,
  date: string,
  activityId: string,
  patch: Partial<Omit<Activity, 'id'>>,
): Trip {
  return updateDay(trip, date, (day) => ({
    ...day,
    activities: day.activities.map((a) => (a.id === activityId ? { ...a, ...patch } : a)),
  }));
}

/** Put an activity back exactly where it was (used by undo). */
export function insertActivityAt(trip: Trip, date: string, activity: Activity, index: number): Trip {
  return updateDay(trip, date, (day) => {
    if (day.activities.some((a) => a.id === activity.id)) return day;
    const activities = [...day.activities];
    activities.splice(Math.min(Math.max(index, 0), activities.length), 0, activity);
    return { ...day, activities };
  });
}

export function removeActivity(trip: Trip, date: string, activityId: string): Trip {
  return updateDay(trip, date, (day) => ({
    ...day,
    activities: day.activities.filter((a) => a.id !== activityId),
  }));
}

/** Move an activity up (-1) or down (+1) within its day. */
export function moveActivity(trip: Trip, date: string, activityId: string, direction: -1 | 1): Trip {
  return updateDay(trip, date, (day) => {
    const index = day.activities.findIndex((a) => a.id === activityId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= day.activities.length) return day;
    const activities = [...day.activities];
    [activities[index], activities[target]] = [activities[target], activities[index]];
    return { ...day, activities };
  });
}

/** Move an activity to a different day (appended, then re-sorted by time). */
export function moveActivityToDay(trip: Trip, fromDate: string, toDate: string, activityId: string): Trip {
  if (fromDate === toDate) return trip;
  const sourceDay = trip.itinerary.find((d) => d.date === fromDate);
  const activity = sourceDay?.activities.find((a) => a.id === activityId);
  if (!activity) return trip;
  return insertSortedByTime(removeActivity(trip, fromDate, activityId), toDate, activity);
}

export function countActivities(trip: Trip): number {
  return trip.itinerary.reduce((sum, day) => sum + day.activities.length, 0);
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

export function addChecklistItem(trip: Trip, text: string): Trip {
  const item: ChecklistItem = { id: generateId(), text: text.trim(), done: false };
  return { ...trip, checklist: [...(trip.checklist ?? []), item] };
}

export function toggleChecklistItem(trip: Trip, itemId: string): Trip {
  return {
    ...trip,
    checklist: (trip.checklist ?? []).map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item,
    ),
  };
}

export function renameChecklistItem(trip: Trip, itemId: string, text: string): Trip {
  const trimmed = text.trim();
  if (!trimmed) return trip;
  return {
    ...trip,
    checklist: (trip.checklist ?? []).map((item) => (item.id === itemId ? { ...item, text: trimmed } : item)),
  };
}

export function insertChecklistItemAt(trip: Trip, item: ChecklistItem, index: number): Trip {
  const checklist = [...(trip.checklist ?? [])];
  if (checklist.some((i) => i.id === item.id)) return trip;
  checklist.splice(Math.min(Math.max(index, 0), checklist.length), 0, item);
  return { ...trip, checklist };
}

export function removeChecklistItem(trip: Trip, itemId: string): Trip {
  return { ...trip, checklist: (trip.checklist ?? []).filter((item) => item.id !== itemId) };
}

export function clearCompletedChecklist(trip: Trip): Trip {
  return { ...trip, checklist: (trip.checklist ?? []).filter((item) => !item.done) };
}
