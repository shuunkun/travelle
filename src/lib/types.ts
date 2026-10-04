export type ActivityCategory = 'transport' | 'food' | 'activity' | 'accommodation' | 'other';

export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'accommodation'
  | 'activity'
  | 'shopping'
  | 'other';

export type SplitMode = 'equal' | 'exact' | 'percent' | 'shares';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  /** ISO date key (YYYY-MM-DD), interpreted as a local calendar date. */
  startDate: string;
  /** ISO date key (YYYY-MM-DD), interpreted as a local calendar date. */
  endDate: string;
  /** Either an image URL or a CSS gradient string. */
  coverImage: string;
  description: string;
  travelers: string[]; // friend IDs
  itinerary: ItineraryDay[];
  budget: number;
  checklist: ChecklistItem[];
}

export interface ItineraryDay {
  date: string;
  activities: Activity[];
}

/**
 * What sort of thing an activity is. `generic` is a plain itinerary entry;
 * `flight` and `hotel` carry structured `details`. Extend this union (and
 * `ActivityDetails`) to add more typed activities.
 */
export type ActivityKind = 'generic' | 'flight' | 'hotel';

export interface FlightDetails {
  type: 'flight';
  airline: string;
  flightNumber: string;
  /** IATA code, upper-cased (e.g. "SYD"). */
  departureAirport: string;
  arrivalAirport: string;
  /** Local date-time, "YYYY-MM-DDTHH:mm" (no timezone). */
  departureDateTime: string;
  arrivalDateTime: string;
  bookingReference?: string;
  seat?: string;
  terminal?: string;
  gate?: string;
}

export interface HotelDetails {
  type: 'hotel';
  hotelName: string;
  address: string;
  /** ISO date key (YYYY-MM-DD). */
  checkInDate: string;
  checkOutDate: string;
  /** "HH:mm"; defaults to 15:00 when absent. */
  checkInTime?: string;
  /** "HH:mm"; defaults to 11:00 when absent. */
  checkOutTime?: string;
  bookingReference?: string;
  roomType?: string;
}

export type ActivityDetails = FlightDetails | HotelDetails;

export interface Activity {
  id: string;
  /** "HH:mm" or "" — for flights/hotels this is derived from `details`. */
  time: string;
  title: string;
  location: string;
  notes: string;
  /** Used for colouring and filters. Flights are `transport`, hotels `accommodation`. */
  category: ActivityCategory;
  kind: ActivityKind;
  /** Present (and matching `kind`) for flights and hotels; absent for generic activities. */
  details?: ActivityDetails;
  /** Planned cost, in the trip's currency. Compare against linked expenses. */
  estimatedCost?: number;
}

export type FlightActivity = Activity & { kind: 'flight'; details: FlightDetails };
export type HotelActivity = Activity & { kind: 'hotel'; details: HotelDetails };

export interface Expense {
  id: string;
  tripId: string;
  description: string;
  amount: number;
  currency: string;
  paidBy: string;
  splitBetween: SplitEntry[];
  date: string;
  category: ExpenseCategory;
  /** How the split was entered, so the editor can restore the same mode. */
  splitMode?: SplitMode;
  /** Raw user inputs for percent/shares/exact modes, keyed by friend id. */
  splitInputs?: Record<string, number>;
  /** Itinerary activity this expense pays for, if any. Many expenses may link to one activity. */
  activityId?: string;
}

export interface SplitEntry {
  friendId: string;
  amount: number;
}

export interface Friend {
  id: string;
  name: string;
  email: string;
  color: string;
}

/** A recorded payment from one traveler to another that settles (part of) a debt. */
export interface Settlement {
  id: string;
  tripId: string;
  from: string;
  to: string;
  amount: number;
  date: string;
  note?: string;
}

/** Everything the app persists. */
export interface AppData {
  trips: Trip[];
  expenses: Expense[];
  friends: Friend[];
  settlements: Settlement[];
}
