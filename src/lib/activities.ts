import {
  Activity,
  ActivityCategory,
  ActivityKind,
  Expense,
  FlightActivity,
  FlightDetails,
  HotelActivity,
  HotelDetails,
  ItineraryDay,
  Trip,
} from './types';
import { compareDateKeys, getDaysBetween, isDateKey } from './utils';
import { isDayInRange } from './trip-helpers';

/**
 * Pure helpers for typed ("dynamic") activities — flights and hotels — plus
 * the glue that links activities to expenses. Nothing here touches React or
 * storage.
 */

export const DEFAULT_CHECK_IN_TIME = '15:00';
export const DEFAULT_CHECK_OUT_TIME = '11:00';

export const ACTIVITY_KINDS: { value: ActivityKind; label: string }[] = [
  { value: 'generic', label: 'Activity' },
  { value: 'flight', label: 'Flight' },
  { value: 'hotel', label: 'Hotel' },
];

export function getKindLabel(kind: ActivityKind): string {
  return ACTIVITY_KINDS.find((k) => k.value === kind)?.label ?? 'Activity';
}

/** Category a kind implies; `undefined` for generic (user picks). */
export function categoryForKind(kind: ActivityKind): ActivityCategory | undefined {
  if (kind === 'flight') return 'transport';
  if (kind === 'hotel') return 'accommodation';
  return undefined;
}

export function isFlightActivity(activity: Activity): activity is FlightActivity {
  return activity.kind === 'flight' && activity.details?.type === 'flight';
}

export function isHotelActivity(activity: Activity): activity is HotelActivity {
  return activity.kind === 'hotel' && activity.details?.type === 'hotel';
}

export function isBooking(activity: Activity): activity is FlightActivity | HotelActivity {
  return isFlightActivity(activity) || isHotelActivity(activity);
}

// ---------------------------------------------------------------------------
// Local date-times ("YYYY-MM-DDTHH:mm")
// ---------------------------------------------------------------------------

const DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

export function splitDateTime(value: string): { date: string; time: string } {
  const match = DATE_TIME_RE.exec(value ?? '');
  if (!match) return { date: '', time: '' };
  return { date: match[1], time: match[2] };
}

export function joinDateTime(date: string, time: string): string {
  if (!date) return '';
  return `${date}T${time || '00:00'}`;
}

export function isLocalDateTime(value: string): boolean {
  const { date, time } = splitDateTime(value);
  if (!isDateKey(date)) return false;
  const [h, m] = time.split(':').map(Number);
  return h >= 0 && h < 24 && m >= 0 && m < 60;
}

export function formatTime12(time: string): string {
  if (!time) return 'Anytime';
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// ---------------------------------------------------------------------------
// Flights
// ---------------------------------------------------------------------------

export function flightDepartureDate(details: FlightDetails): string {
  return splitDateTime(details.departureDateTime).date;
}

export function flightDepartureTime(details: FlightDetails): string {
  return splitDateTime(details.departureDateTime).time;
}

export function flightArrivalDate(details: FlightDetails): string {
  return splitDateTime(details.arrivalDateTime).date;
}

export function flightArrivalTime(details: FlightDetails): string {
  return splitDateTime(details.arrivalDateTime).time;
}

/** Calendar days between departure and arrival (0 = same day, 1 = "+1"). */
export function flightArrivalDayOffset(details: FlightDetails): number {
  const dep = flightDepartureDate(details);
  const arr = flightArrivalDate(details);
  if (!dep || !arr) return 0;
  if (compareDateKeys(arr, dep) <= 0) return 0;
  return getDaysBetween(dep, arr) - 1;
}

export function buildFlightTitle(details: Pick<FlightDetails, 'flightNumber' | 'departureAirport' | 'arrivalAirport' | 'airline'>): string {
  const number = details.flightNumber.trim() || details.airline.trim();
  const route = [details.departureAirport.trim(), details.arrivalAirport.trim()].filter(Boolean).join(' → ');
  return [number, route].filter(Boolean).join(' ') || 'Flight';
}

export function validateFlightDetails(details: FlightDetails): Partial<Record<keyof FlightDetails, string>> {
  const errors: Partial<Record<keyof FlightDetails, string>> = {};
  if (!details.flightNumber.trim() && !details.airline.trim()) {
    errors.flightNumber = 'Enter a flight number or airline.';
  }
  if (!details.departureAirport.trim()) errors.departureAirport = 'Where does it leave from?';
  if (!details.arrivalAirport.trim()) errors.arrivalAirport = 'Where does it land?';
  if (!isLocalDateTime(details.departureDateTime)) errors.departureDateTime = 'Enter a departure date and time.';
  if (!isLocalDateTime(details.arrivalDateTime)) errors.arrivalDateTime = 'Enter an arrival date and time.';
  if (
    !errors.departureDateTime &&
    !errors.arrivalDateTime &&
    details.arrivalDateTime <= details.departureDateTime
  ) {
    errors.arrivalDateTime = 'Arrival must be after departure.';
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------

export function hotelCheckInTime(details: HotelDetails): string {
  return details.checkInTime || DEFAULT_CHECK_IN_TIME;
}

export function hotelCheckOutTime(details: HotelDetails): string {
  return details.checkOutTime || DEFAULT_CHECK_OUT_TIME;
}

export function hotelNights(details: Pick<HotelDetails, 'checkInDate' | 'checkOutDate'>): number {
  if (!details.checkInDate || !details.checkOutDate) return 0;
  if (compareDateKeys(details.checkOutDate, details.checkInDate) <= 0) return 0;
  return getDaysBetween(details.checkInDate, details.checkOutDate) - 1;
}

export function buildHotelTitle(details: Pick<HotelDetails, 'hotelName'>): string {
  const name = details.hotelName.trim();
  return name ? `Stay at ${name}` : 'Hotel stay';
}

export function validateHotelDetails(details: HotelDetails): Partial<Record<keyof HotelDetails, string>> {
  const errors: Partial<Record<keyof HotelDetails, string>> = {};
  if (!details.hotelName.trim()) errors.hotelName = 'Enter the hotel name.';
  if (!isDateKey(details.checkInDate)) errors.checkInDate = 'Pick a check-in date.';
  if (!isDateKey(details.checkOutDate)) errors.checkOutDate = 'Pick a check-out date.';
  if (
    !errors.checkInDate &&
    !errors.checkOutDate &&
    compareDateKeys(details.checkOutDate, details.checkInDate) <= 0
  ) {
    errors.checkOutDate = 'Check-out must be after check-in.';
  }
  return errors;
}

export interface HotelStay {
  activity: HotelActivity;
  /** Where the stay's own card lives (the check-in day). */
  checkInDate: string;
  /** True when `date` is the check-out day. */
  isCheckOut: boolean;
  /** 1-based night number that ends on `date` (e.g. day after check-in = night 1). */
  nightNumber: number;
  totalNights: number;
}

/**
 * Hotel stays that cover `date` *without* their card being on that day — i.e.
 * every day after check-in up to and including check-out. The itinerary uses
 * this to show a "Staying at …" banner instead of duplicating the activity.
 */
export function hotelStaysForDate(trip: Trip, date: string): HotelStay[] {
  const stays: HotelStay[] = [];
  for (const day of trip.itinerary) {
    for (const activity of day.activities) {
      if (!isHotelActivity(activity)) continue;
      const { checkInDate, checkOutDate } = activity.details;
      if (compareDateKeys(date, checkInDate) <= 0 || compareDateKeys(date, checkOutDate) > 0) continue;
      stays.push({
        activity,
        checkInDate,
        isCheckOut: date === checkOutDate,
        nightNumber: getDaysBetween(checkInDate, date) - 1,
        totalNights: hotelNights(activity.details),
      });
    }
  }
  return stays;
}

// ---------------------------------------------------------------------------
// Placement: which itinerary day an activity belongs to
// ---------------------------------------------------------------------------

/** The day an activity should live on; `fallback` for generic activities. */
export function activityHomeDate(activity: Pick<Activity, 'kind' | 'details'>, fallback: string): string {
  if (activity.details?.type === 'flight') return flightDepartureDate(activity.details) || fallback;
  if (activity.details?.type === 'hotel') return activity.details.checkInDate || fallback;
  return fallback;
}

/** The sortable `time` an activity should carry, derived from details when typed. */
export function activityDerivedTime(activity: Pick<Activity, 'kind' | 'details' | 'time'>): string {
  if (activity.details?.type === 'flight') return flightDepartureTime(activity.details);
  if (activity.details?.type === 'hotel') return hotelCheckInTime(activity.details);
  return activity.time;
}

// ---------------------------------------------------------------------------
// Lookups across the itinerary
// ---------------------------------------------------------------------------

export interface LocatedActivity {
  activity: Activity;
  day: ItineraryDay;
  /** 1-based day number within the trip range; 0 when outside the range. */
  dayNumber: number;
}

/** Every activity in itinerary order, with its day and day number. */
export function listActivities(trip: Trip): LocatedActivity[] {
  const out: LocatedActivity[] = [];
  let dayNumber = 0;
  for (const day of trip.itinerary) {
    const inRange = isDayInRange(trip, day.date);
    if (inRange) dayNumber += 1;
    for (const activity of day.activities) {
      out.push({ activity, day, dayNumber: inRange ? dayNumber : 0 });
    }
  }
  return out;
}

export function findActivity(trip: Trip, activityId: string): LocatedActivity | undefined {
  return listActivities(trip).find((entry) => entry.activity.id === activityId);
}

/** Flights and hotels, in itinerary order. */
export function listBookings(trip: Trip): LocatedActivity[] {
  return listActivities(trip).filter((entry) => isBooking(entry.activity));
}

// ---------------------------------------------------------------------------
// Expense links
// ---------------------------------------------------------------------------

export function expensesForActivity(expenses: Expense[], activityId: string): Expense[] {
  return expenses.filter((e) => e.activityId === activityId);
}

/** Sum of expenses linked to this activity (in cents to avoid float drift). */
export function activityActualCost(expenses: Expense[], activityId: string): number {
  const cents = expensesForActivity(expenses, activityId).reduce(
    (sum, e) => sum + Math.round(e.amount * 100),
    0,
  );
  return cents / 100;
}

export function activityForExpense(trip: Trip, expense: Pick<Expense, 'activityId'>): LocatedActivity | undefined {
  if (!expense.activityId) return undefined;
  return findActivity(trip, expense.activityId);
}

export function unlinkedExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => !e.activityId);
}

export interface PlannedVsActual {
  /** Sum of `estimatedCost` across activities. */
  planned: number;
  /** Sum of expenses linked to any activity in the trip. */
  actual: number;
  /** Activities with an estimate or at least one linked expense. */
  costedActivities: number;
  linkedExpenses: number;
}

export function getPlannedVsActual(trip: Trip, expenses: Expense[]): PlannedVsActual {
  const activityIds = new Set<string>();
  let plannedCents = 0;
  let costedActivities = 0;
  const linkedByActivity = new Map<string, number>();
  for (const e of expenses) {
    if (e.activityId) linkedByActivity.set(e.activityId, (linkedByActivity.get(e.activityId) ?? 0) + 1);
  }
  for (const { activity } of listActivities(trip)) {
    activityIds.add(activity.id);
    const hasEstimate = typeof activity.estimatedCost === 'number' && activity.estimatedCost > 0;
    if (hasEstimate) plannedCents += Math.round((activity.estimatedCost as number) * 100);
    if (hasEstimate || linkedByActivity.has(activity.id)) costedActivities += 1;
  }
  let actualCents = 0;
  let linkedExpenses = 0;
  for (const e of expenses) {
    if (e.activityId && activityIds.has(e.activityId)) {
      actualCents += Math.round(e.amount * 100);
      linkedExpenses += 1;
    }
  }
  return { planned: plannedCents / 100, actual: actualCents / 100, costedActivities, linkedExpenses };
}

/** Options for a "Linked activity" select: "Day 2 · Oct 3 — QF1 SYD → LHR". */
export function activityOptionLabel(entry: LocatedActivity, formatDay: (date: string) => string): string {
  const prefix = entry.dayNumber > 0 ? `Day ${entry.dayNumber} · ` : '';
  return `${prefix}${formatDay(entry.day.date)} — ${entry.activity.title}`;
}
