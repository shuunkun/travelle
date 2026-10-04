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

export interface Activity {
  id: string;
  time: string;
  title: string;
  location: string;
  notes: string;
  category: ActivityCategory;
}

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
