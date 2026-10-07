'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { Activity, AppData, Expense, Friend, Settlement, Trip } from '@/lib/types';
import { getSampleData, isStorageKey, loadData, saveData } from '@/lib/store';
import { ME_ID, getFriendUsage } from '@/lib/selectors';
import * as tripHelpers from '@/lib/trip-helpers';
import { generateId } from '@/lib/utils';
import { getSupabase, isCloudConfigured } from '@/lib/cloud/client';
import { CloudSync, SyncStatus } from '@/lib/cloud/sync';
import { TripAccess, UserIdentity, defaultDisplayName } from '@/lib/cloud/mapping';
import { deviceTripsToImport, markImported, prepareImport, readDeviceData } from '@/lib/cloud/import';

// ---------------------------------------------------------------------------
// State + reducer
// ---------------------------------------------------------------------------

interface AppState extends AppData {
  hydrated: boolean;
}

type Action =
  | { type: 'HYDRATE'; data: AppData }
  | { type: 'UNLOAD' }
  | { type: 'MERGE'; data: AppData }
  | { type: 'ADD_TRIP'; trip: Trip }
  | { type: 'UPDATE_TRIP'; id: string; updater: (trip: Trip) => Trip }
  | { type: 'DELETE_TRIP'; id: string }
  | { type: 'DELETE_ACTIVITY'; tripId: string; date: string; activityId: string }
  | { type: 'RESTORE_ACTIVITY'; tripId: string; date: string; activity: Activity; index: number; expenseIds: string[] }
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
    case 'UNLOAD':
      return EMPTY;
    case 'MERGE': {
      const known = new Set(state.friends.map((f) => f.id));
      return {
        ...state,
        trips: [...state.trips, ...action.data.trips],
        expenses: [...state.expenses, ...action.data.expenses],
        settlements: [...state.settlements, ...action.data.settlements],
        friends: [...state.friends, ...action.data.friends.filter((f) => !known.has(f.id))],
      };
    }
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
    case 'DELETE_ACTIVITY':
      // Remove the activity but keep its expenses, just unlinked.
      return {
        ...state,
        trips: state.trips.map((t) =>
          t.id === action.tripId ? tripHelpers.removeActivity(t, action.date, action.activityId) : t,
        ),
        expenses: state.expenses.map((e) => {
          if (e.activityId !== action.activityId) return e;
          const rest = { ...e };
          delete rest.activityId;
          return rest;
        }),
      };
    case 'RESTORE_ACTIVITY': {
      const relink = new Set(action.expenseIds);
      return {
        ...state,
        trips: state.trips.map((t) =>
          t.id === action.tripId ? tripHelpers.insertActivityAt(t, action.date, action.activity, action.index) : t,
        ),
        expenses: state.expenses.map((e) => (relink.has(e.id) ? { ...e, activityId: action.activity.id } : e)),
      };
    }
    case 'ADD_EXPENSE':
      if (state.expenses.some((e) => e.id === action.expense.id)) return state;
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
      if (state.settlements.some((s) => s.id === action.settlement.id)) return state;
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

/** Returned by deletes that can be undone; `undo` puts the item back where it was. */
export interface Undoable {
  undo: () => void;
}

const NOOP_UNDO: Undoable = { undo: () => {} };

export interface AppActions {
  addTrip: (input: NewTripInput) => Trip;
  updateTrip: (id: string, patch: Partial<Omit<Trip, 'id'>>) => void;
  deleteTrip: (id: string) => void;

  addActivity: (tripId: string, date: string, input: Omit<Activity, 'id'>) => void;
  updateActivity: (tripId: string, date: string, activityId: string, patch: Partial<Omit<Activity, 'id'>>) => void;
  deleteActivity: (tripId: string, date: string, activityId: string) => Undoable;
  moveActivity: (tripId: string, date: string, activityId: string, direction: -1 | 1) => void;
  moveActivityToDay: (tripId: string, fromDate: string, toDate: string, activityId: string) => void;

  addChecklistItem: (tripId: string, text: string) => void;
  toggleChecklistItem: (tripId: string, itemId: string) => void;
  renameChecklistItem: (tripId: string, itemId: string, text: string) => void;
  deleteChecklistItem: (tripId: string, itemId: string) => Undoable;
  clearCompletedChecklist: (tripId: string) => void;

  addExpense: (input: Omit<Expense, 'id'>) => Expense;
  updateExpense: (id: string, patch: Partial<Omit<Expense, 'id'>>) => void;
  deleteExpense: (id: string) => Undoable;
  /** Link an expense to an itinerary activity, or pass `undefined` to unlink. */
  linkExpenseToActivity: (expenseId: string, activityId: string | undefined) => void;

  addFriend: (input: Omit<Friend, 'id'>) => Friend;
  updateFriend: (id: string, patch: Partial<Omit<Friend, 'id'>>) => void;
  /** Refuses to delete a friend still referenced by trips/expenses/settlements. */
  deleteFriend: (id: string) => DeleteFriendResult;

  addSettlement: (input: Omit<Settlement, 'id'>) => Settlement;
  deleteSettlement: (id: string) => Undoable;

  resetToSampleData: () => void;
}

export interface AppContextValue extends AppData, AppActions {
  /** False until localStorage has been read on the client. */
  hydrated: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

// ---------------------------------------------------------------------------
// Cloud (accounts + sync)
// ---------------------------------------------------------------------------

/** `local`: data lives only in this browser (signed out or cloud not configured). */
export type CloudStatus = 'local' | SyncStatus;

export interface InvitePreview {
  tripId: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  people: Friend[];
  claimedPersonIds: string[];
  alreadyMember: boolean;
}

export interface CloudContextValue {
  configured: boolean;
  /** False until the saved session (if any) has been read. */
  authReady: boolean;
  user: UserIdentity | null;
  status: CloudStatus;
  error?: string;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  /**
   * Creates the account and signs in. `needsConfirmation` means Supabase is
   * still set to confirm emails, so no session was issued.
   */
  signUp: (email: string, password: string) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  sendPasswordReset: (email: string, redirectPath?: string) => Promise<{ error?: string }>;
  updatePassword: (password: string) => Promise<{ error?: string }>;
  /** True after arriving from a password-reset link, until a new password is saved. */
  passwordRecovery: boolean;
  signOut: () => Promise<void>;
  /** Sharing info for a cloud trip (undefined in local mode or before it's saved). */
  tripAccess: (tripId: string) => TripAccess | undefined;
  createInvite: (tripId: string) => Promise<{ code?: string; error?: string }>;
  previewInvite: (code: string) => Promise<{ preview?: InvitePreview; error?: string }>;
  joinTrip: (
    code: string,
    personId: string | null,
    newPerson?: Omit<Friend, 'id'>,
  ) => Promise<{ tripId?: string; error?: string }>;
  /** Trips saved on this device (while signed out) that aren't in the account yet. */
  deviceTrips: Trip[];
  importDeviceTrips: (tripIds: string[]) => void;
}

const CloudContext = createContext<CloudContextValue | null>(null);

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return 'Something went wrong';
}

const NOT_CONFIGURED = 'Cloud sync is not set up for this site yet.';

/** Supabase auth errors in plain words. */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'There is already an account with this email. Sign in instead.';
  if (m.includes('password should be')) return 'Use a password of at least 6 characters.';
  if (m.includes('not authorized') || m.includes('rate limit') || m.includes('over_email_send_rate_limit')) {
    return "We couldn't send that email. If you've forgotten your password, create a new account and rejoin your trips from their invite links.";
  }
  if (m.includes('email not confirmed')) return 'This account still needs its email confirmed.';
  return message;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY);
  // Latest state for imperative reads inside actions (kept in an effect so we
  // never write to a ref during render).
  const stateRef = React.useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const supabase = getSupabase();
  const [authReady, setAuthReady] = useState(!isCloudConfigured);
  const [user, setUser] = useState<UserIdentity | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ status: SyncStatus; error?: string }>({ status: 'loading' });
  const [access, setAccess] = useState<Map<string, TripAccess>>(() => new Map());
  const [deviceTrips, setDeviceTrips] = useState<Trip[]>([]);
  const syncRef = React.useRef<CloudSync | null>(null);
  const userId = user?.id;
  const userEmail = user?.email;

  // Session tracking.
  useEffect(() => {
    if (!supabase) return;
    const apply = (session: { user: { id: string; email?: string } } | null) => {
      setUser((prev) => {
        const next = session ? { id: session.user.id, email: session.user.email ?? '' } : null;
        return prev?.id === next?.id && prev?.email === next?.email ? prev : next;
      });
      setAuthReady(true);
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
      apply(session);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  // Local mode: load after mount so server and first client render are identical.
  useEffect(() => {
    if (!authReady || userId) return;
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
  }, [authReady, userId]);

  // Cloud mode: the account's data replaces the device's.
  useEffect(() => {
    if (!supabase || !userId) return;
    dispatch({ type: 'UNLOAD' });
    const sync = new CloudSync(
      supabase,
      { id: userId, email: userEmail ?? '' },
      {
        onRemoteData: (data, nextAccess) => {
          dispatch({ type: 'HYDRATE', data });
          setAccess(new Map(nextAccess));
          setDeviceTrips(deviceTripsToImport());
        },
        onStatus: (status, error) => setSyncStatus({ status, error }),
      },
    );
    syncRef.current = sync;
    sync.start();
    return () => {
      sync.dispose();
      syncRef.current = null;
    };
  }, [supabase, userId, userEmail]);

  // Persist whenever data changes (after hydration).
  useEffect(() => {
    if (!state.hydrated) return;
    if (userId) syncRef.current?.notifyLocalChange(state);
    else saveData(state);
  }, [state, userId]);

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
      deleteActivity: (tripId, date, activityId) => {
        const trip = stateRef.current.trips.find((t) => t.id === tripId);
        const day = trip?.itinerary.find((d) => d.date === date);
        const index = day?.activities.findIndex((a) => a.id === activityId) ?? -1;
        const activity = index >= 0 ? day!.activities[index] : undefined;
        const expenseIds = stateRef.current.expenses.filter((e) => e.activityId === activityId).map((e) => e.id);
        dispatch({ type: 'DELETE_ACTIVITY', tripId, date, activityId });
        if (!activity) return NOOP_UNDO;
        return { undo: () => dispatch({ type: 'RESTORE_ACTIVITY', tripId, date, activity, index, expenseIds }) };
      },
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
      renameChecklistItem: (tripId, itemId, text) =>
        updateTripWith(tripId, (trip) => tripHelpers.renameChecklistItem(trip, itemId, text)),
      deleteChecklistItem: (tripId, itemId) => {
        const trip = stateRef.current.trips.find((t) => t.id === tripId);
        const index = trip?.checklist.findIndex((i) => i.id === itemId) ?? -1;
        const item = index >= 0 ? trip!.checklist[index] : undefined;
        updateTripWith(tripId, (t) => tripHelpers.removeChecklistItem(t, itemId));
        if (!item) return NOOP_UNDO;
        return { undo: () => updateTripWith(tripId, (t) => tripHelpers.insertChecklistItemAt(t, item, index)) };
      },
      clearCompletedChecklist: (tripId) =>
        updateTripWith(tripId, (trip) => tripHelpers.clearCompletedChecklist(trip)),

      addExpense: (input) => {
        const expense: Expense = { ...input, id: generateId() };
        dispatch({ type: 'ADD_EXPENSE', expense });
        return expense;
      },
      updateExpense: (id, patch) => dispatch({ type: 'UPDATE_EXPENSE', id, patch }),
      deleteExpense: (id) => {
        const expense = stateRef.current.expenses.find((e) => e.id === id);
        dispatch({ type: 'DELETE_EXPENSE', id });
        if (!expense) return NOOP_UNDO;
        return { undo: () => dispatch({ type: 'ADD_EXPENSE', expense }) };
      },
      linkExpenseToActivity: (expenseId, activityId) =>
        dispatch({ type: 'UPDATE_EXPENSE', id: expenseId, patch: { activityId } }),

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
      deleteSettlement: (id) => {
        const settlement = stateRef.current.settlements.find((s) => s.id === id);
        dispatch({ type: 'DELETE_SETTLEMENT', id });
        if (!settlement) return NOOP_UNDO;
        return { undo: () => dispatch({ type: 'ADD_SETTLEMENT', settlement }) };
      },

      resetToSampleData: () => {
        if (syncRef.current) {
          // Never wipe an account; add fresh copies of the samples instead.
          const sample = getSampleData();
          const copy = prepareImport(sample, sample.trips.map((t) => t.id), stateRef.current.friends);
          dispatch({ type: 'MERGE', data: copy });
          return;
        }
        dispatch({ type: 'HYDRATE', data: getSampleData() });
      },
    }),
    [updateTripWith],
  );

  const cloud = useMemo<CloudContextValue>(() => {
    const status: CloudStatus = userId ? syncStatus.status : 'local';
    return {
      configured: isCloudConfigured,
      authReady,
      user,
      status,
      error: userId ? syncStatus.error : undefined,
      signIn: async (email, password) => {
        if (!supabase) return { error: NOT_CONFIGURED };
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return error ? { error: friendlyAuthError(error.message) } : {};
      },
      signUp: async (email, password) => {
        if (!supabase) return { error: NOT_CONFIGURED };
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) return { error: friendlyAuthError(error.message) };
        // With "Confirm email" off, Supabase returns a session straight away.
        if (!data.session) return { needsConfirmation: true };
        return {};
      },
      sendPasswordReset: async (email, redirectPath = '/account') => {
        if (!supabase) return { error: NOT_CONFIGURED };
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}${redirectPath}`,
        });
        return error ? { error: friendlyAuthError(error.message) } : {};
      },
      updatePassword: async (password) => {
        if (!supabase) return { error: NOT_CONFIGURED };
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return { error: friendlyAuthError(error.message) };
        setPasswordRecovery(false);
        return {};
      },
      passwordRecovery,
      signOut: async () => {
        await supabase?.auth.signOut();
      },
      tripAccess: (tripId) => access.get(tripId) ?? syncRef.current?.getAccess(tripId),
      createInvite: async (tripId) => {
        if (!supabase || !userId) return { error: 'Sign in to invite people.' };
        if (!syncRef.current?.getAccess(tripId)) return { error: 'This trip is still being saved. Try again in a moment.' };
        const existing = await supabase.from('trip_invites').select('code').eq('trip_id', tripId).limit(1);
        if (existing.error) return { error: existing.error.message };
        if (existing.data?.[0]) return { code: existing.data[0].code as string };
        const { data, error } = await supabase.from('trip_invites').insert({ trip_id: tripId }).select('code').single();
        if (error) return { error: error.message };
        return { code: data.code as string };
      },
      previewInvite: async (code) => {
        if (!supabase) return { error: 'Cloud sync is not set up for this site yet.' };
        const { data, error } = await supabase.rpc('invite_preview', { p_code: code });
        if (error) return { error: error.message };
        if (!data) return { error: 'This invite link is invalid or has been revoked.' };
        return { preview: data as InvitePreview };
      },
      joinTrip: async (code, personId, newPerson) => {
        if (!supabase) return { error: 'Cloud sync is not set up for this site yet.' };
        try {
          const { data, error } = await supabase.rpc('join_trip', {
            p_code: code,
            p_person_id: personId,
            p_new_person: newPerson ? { id: generateId(), ...newPerson } : null,
          });
          if (error) return { error: error.message };
          syncRef.current?.scheduleRefresh();
          return { tripId: data as string };
        } catch (error) {
          return { error: errorText(error) };
        }
      },
      deviceTrips,
      importDeviceTrips: (tripIds) => {
        if (!syncRef.current || tripIds.length === 0) return;
        const device = readDeviceData();
        const copy = prepareImport(device, tripIds, stateRef.current.friends);
        dispatch({ type: 'MERGE', data: copy });
        // A fresh account only knows your email; keep the name you used on this device.
        const deviceMe = device.friends.find((f) => f.id === ME_ID);
        const accountMe = stateRef.current.friends.find((f) => f.id === ME_ID);
        if (deviceMe && deviceMe.name !== 'You' && accountMe?.name === defaultDisplayName(userEmail ?? '')) {
          dispatch({ type: 'UPDATE_FRIEND', id: ME_ID, patch: { name: deviceMe.name, color: deviceMe.color } });
        }
        markImported(tripIds);
        setDeviceTrips(deviceTripsToImport());
      },
    };
  }, [supabase, authReady, user, userId, userEmail, syncStatus, access, deviceTrips, passwordRecovery]);

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

  return (
    <CloudContext.Provider value={cloud}>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </CloudContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}

export function useCloud(): CloudContextValue {
  const ctx = useContext(CloudContext);
  if (!ctx) throw new Error('useCloud must be used within <AppProvider>');
  return ctx;
}

/** Convenience: the trip with this id, or undefined (also while not hydrated). */
export function useTrip(tripId: string): Trip | undefined {
  const { trips } = useApp();
  return trips.find((t) => t.id === tripId);
}
