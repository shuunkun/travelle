'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { Activity, AppData, Expense, Friend, Settlement, Trip } from '@/lib/types';
import { getSampleData, isStorageKey, loadData, saveData } from '@/lib/store';
import { getFriendUsage } from '@/lib/selectors';
import * as tripHelpers from '@/lib/trip-helpers';
import { generateId } from '@/lib/utils';

// ---------------------------------------------------------------------------
// State + reducer
// ---------------------------------------------------------------------------

interface AppState extends AppData {
  hydrated: boolean;
}

type Action =
  | { type: 'HYDRATE'; data: AppData }
  | { type: 'ADD_TRIP'; trip: Trip }
  | { type: 'UPDATE_TRIP'; id: string; updater: (trip: Trip) => Trip }
  | { type: 'DELETE_TRIP'; id: string }
  | { type: 'ADD_EXPENSE'; expense: Expense }
  | { type: 'UPDATE_EXPENSE'; id: string; patch: Partial<Omit<Expense, 'id'>> }
  | { type: 'DELETE_EXPENSE'; id: string }
  | { type: 'ADD_FRIEND'; friend: Friend }
  | { type: 'UPDATE_FRIEND'; id: string; patch: Partial<Omit<Friend, 'id'>> }
  | { type: 'DELETE_FRIEND'; id: string }
  | { type: 'ADD_SETTLEMENT'; settlement: Settlement }
  | { type: 'DELETE_SETTLEMENT'; id: string };

const EMPTY: AppState = { trips: [], expenses: [], friends: [], settlements: [], hydrated: false };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'HYDRATE':
      return { ...action.data, hydrated: true };
    case 'ADD_TRIP':
      return { ...state, trips: [...state.trips, action.trip] };
    case 'UPDATE_TRIP':
      return { ...state, trips: state.trips.map((t) => (t.id === action.id ? action.updater(t) : t)) };
    case 'DELETE_TRIP':
      return {
        ...state,
        trips: state.trips.filter((t) => t.id !== action.id),
        expenses: state.expenses.filter((e) => e.tripId !== action.id),
        settlements: state.settlements.filter((s) => s.tripId !== action.id),
      };
    case 'ADD_EXPENSE':
      return { ...state, expenses: [...state.expenses, action.expense] };
    case 'UPDATE_EXPENSE':
      return {
        ...state,
        expenses: state.expenses.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
      };
    case 'DELETE_EXPENSE':
      return { ...state, expenses: state.expenses.filter((e) => e.id !== action.id) };
    case 'ADD_FRIEND':
      return { ...state, friends: [...state.friends, action.friend] };
    case 'UPDATE_FRIEND':
      return {
        ...state,
        friends: state.friends.map((f) => (f.id === action.id ? { ...f, ...action.patch } : f)),
      };
    case 'DELETE_FRIEND':
      return { ...state, friends: state.friends.filter((f) => f.id !== action.id) };
    case 'ADD_SETTLEMENT':
      return { ...state, settlements: [...state.settlements, action.settlement] };
    case 'DELETE_SETTLEMENT':
      return { ...state, settlements: state.settlements.filter((s) => s.id !== action.id) };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type NewTripInput = Omit<Trip, 'id' | 'itinerary' | 'checklist'> &
  Partial<Pick<Trip, 'itinerary' | 'checklist'>>;

export interface DeleteFriendResult {
  ok: boolean;
  reason?: string;
}

export interface AppActions {
  addTrip: (input: NewTripInput) => Trip;
  updateTrip: (id: string, patch: Partial<Omit<Trip, 'id'>>) => void;
  deleteTrip: (id: string) => void;

  addActivity: (tripId: string, date: string, input: Omit<Activity, 'id'>) => void;
  updateActivity: (tripId: string, date: string, activityId: string, patch: Partial<Omit<Activity, 'id'>>) => void;
  deleteActivity: (tripId: string, date: string, activityId: string) => void;
  moveActivity: (tripId: string, date: string, activityId: string, direction: -1 | 1) => void;
  moveActivityToDay: (tripId: string, fromDate: string, toDate: string, activityId: string) => void;

  addChecklistItem: (tripId: string, text: string) => void;
  toggleChecklistItem: (tripId: string, itemId: string) => void;
  deleteChecklistItem: (tripId: string, itemId: string) => void;
  clearCompletedChecklist: (tripId: string) => void;

  addExpense: (input: Omit<Expense, 'id'>) => Expense;
  updateExpense: (id: string, patch: Partial<Omit<Expense, 'id'>>) => void;
  deleteExpense: (id: string) => void;

  addFriend: (input: Omit<Friend, 'id'>) => Friend;
  updateFriend: (id: string, patch: Partial<Omit<Friend, 'id'>>) => void;
  /** Refuses to delete a friend still referenced by trips/expenses/settlements. */
  deleteFriend: (id: string) => DeleteFriendResult;

  addSettlement: (input: Omit<Settlement, 'id'>) => Settlement;
  deleteSettlement: (id: string) => void;

  resetToSampleData: () => void;
}

export interface AppContextValue extends AppData, AppActions {
  /** False until localStorage has been read on the client. */
  hydrated: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY);
  // Latest state for imperative reads inside actions (kept in an effect so we
  // never write to a ref during render).
  const stateRef = React.useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Load after mount so server and first client render are identical.
  useEffect(() => {
    dispatch({ type: 'HYDRATE', data: loadData() });

    // Keep multiple tabs in sync.
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key === null || isStorageKey(event.key)) {
        dispatch({ type: 'HYDRATE', data: loadData() });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Persist whenever data changes (after hydration).
  useEffect(() => {
    if (!state.hydrated) return;
    saveData(state);
  }, [state]);

  const updateTripWith = useCallback((id: string, updater: (trip: Trip) => Trip) => {
    dispatch({ type: 'UPDATE_TRIP', id, updater });
  }, []);

  const actions = useMemo<AppActions>(
    () => ({
      addTrip: (input) => {
        const trip = tripHelpers.syncItineraryToRange({
          ...input,
          id: generateId(),
          itinerary: input.itinerary ?? [],
          checklist: input.checklist ?? [],
        });
        dispatch({ type: 'ADD_TRIP', trip });
        return trip;
      },
      updateTrip: (id, patch) => {
        updateTripWith(id, (trip) => {
          const next = { ...trip, ...patch };
          const datesChanged = patch.startDate !== undefined || patch.endDate !== undefined;
          return datesChanged ? tripHelpers.syncItineraryToRange(next) : next;
        });
      },
      deleteTrip: (id) => dispatch({ type: 'DELETE_TRIP', id }),

      addActivity: (tripId, date, input) =>
        updateTripWith(tripId, (trip) => tripHelpers.addActivity(trip, date, input)),
      updateActivity: (tripId, date, activityId, patch) =>
        updateTripWith(tripId, (trip) => tripHelpers.updateActivity(trip, date, activityId, patch)),
      deleteActivity: (tripId, date, activityId) =>
        updateTripWith(tripId, (trip) => tripHelpers.removeActivity(trip, date, activityId)),
      moveActivity: (tripId, date, activityId, direction) =>
        updateTripWith(tripId, (trip) => tripHelpers.moveActivity(trip, date, activityId, direction)),
      moveActivityToDay: (tripId, fromDate, toDate, activityId) =>
        updateTripWith(tripId, (trip) => tripHelpers.moveActivityToDay(trip, fromDate, toDate, activityId)),

      addChecklistItem: (tripId, text) => {
        if (!text.trim()) return;
        updateTripWith(tripId, (trip) => tripHelpers.addChecklistItem(trip, text));
      },
      toggleChecklistItem: (tripId, itemId) =>
        updateTripWith(tripId, (trip) => tripHelpers.toggleChecklistItem(trip, itemId)),
      deleteChecklistItem: (tripId, itemId) =>
        updateTripWith(tripId, (trip) => tripHelpers.removeChecklistItem(trip, itemId)),
      clearCompletedChecklist: (tripId) =>
        updateTripWith(tripId, (trip) => tripHelpers.clearCompletedChecklist(trip)),

      addExpense: (input) => {
        const expense: Expense = { ...input, id: generateId() };
        dispatch({ type: 'ADD_EXPENSE', expense });
        return expense;
      },
      updateExpense: (id, patch) => dispatch({ type: 'UPDATE_EXPENSE', id, patch }),
      deleteExpense: (id) => dispatch({ type: 'DELETE_EXPENSE', id }),

      addFriend: (input) => {
        const friend: Friend = { ...input, id: generateId() };
        dispatch({ type: 'ADD_FRIEND', friend });
        return friend;
      },
      updateFriend: (id, patch) => dispatch({ type: 'UPDATE_FRIEND', id, patch }),
      deleteFriend: (id) => {
        const usage = getFriendUsage(stateRef.current, id);
        if (usage.isReferenced) {
          const parts: string[] = [];
          if (usage.trips.length) parts.push(`${usage.trips.length} trip${usage.trips.length === 1 ? '' : 's'}`);
          if (usage.expenses.length)
            parts.push(`${usage.expenses.length} expense${usage.expenses.length === 1 ? '' : 's'}`);
          if (usage.settlements.length)
            parts.push(`${usage.settlements.length} settlement${usage.settlements.length === 1 ? '' : 's'}`);
          return {
            ok: false,
            reason: `This friend is still part of ${parts.join(', ')}. Remove them from those first.`,
          };
        }
        dispatch({ type: 'DELETE_FRIEND', id });
        return { ok: true };
      },

      addSettlement: (input) => {
        const settlement: Settlement = { ...input, id: generateId() };
        dispatch({ type: 'ADD_SETTLEMENT', settlement });
        return settlement;
      },
      deleteSettlement: (id) => dispatch({ type: 'DELETE_SETTLEMENT', id }),

      resetToSampleData: () => dispatch({ type: 'HYDRATE', data: getSampleData() }),
    }),
    [updateTripWith],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      trips: state.trips,
      expenses: state.expenses,
      friends: state.friends,
      settlements: state.settlements,
      hydrated: state.hydrated,
      ...actions,
    }),
    [state, actions],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}

/** Convenience: the trip with this id, or undefined (also while not hydrated). */
export function useTrip(tripId: string): Trip | undefined {
  const { trips } = useApp();
  return trips.find((t) => t.id === tripId);
}
