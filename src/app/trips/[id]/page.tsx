'use client';

import { use, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, Calendar, Pencil, Trash2, ArrowLeft, Compass, Share2, LogOut } from 'lucide-react';
import { useApp, useCloud, useTrip } from '@/components/providers/AppProvider';
import { ShareTripModal } from '@/components/cloud/ShareTripModal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { TripForm, TripSubmitValues, useTripForm } from '@/components/trips/TripForm';
import { OverviewTab } from '@/components/trips/OverviewTab';
import { ItineraryTab } from '@/components/trips/ItineraryTab';
import { ExpensesTab } from '@/components/trips/ExpensesTab';
import { SettleTab } from '@/components/trips/SettleTab';
import { formatDateRange, getCoverStyle, getTripStatus, todayKey, pluralize } from '@/lib/utils';
import { getTripFinancials, getTripMembers, getTripParticipantIds } from '@/lib/selectors';
import { Friend, Trip } from '@/lib/types';

type TabKey = 'overview' | 'itinerary' | 'expenses' | 'settle';

const STATUS_LABEL = { upcoming: 'Upcoming', ongoing: 'Happening now', past: 'Past trip' } as const;

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const app = useApp();
  const { hydrated, friends, expenses, settlements, updateTrip, deleteTrip } = app;
  const trip = useTrip(id);

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const cloud = useCloud();
  // Captured once per mount; good enough for "today" badges.
  const [today] = useState(() => todayKey());
  // Pending "show me this activity" request; ItineraryTab scrolls to it and
  // highlights it until it reports back via onFocusHandled.
  const [focusActivityId, setFocusActivityId] = useState<string | null>(null);
  const [editActivityId, setEditActivityId] = useState<string | null>(null);
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null);

  const goToActivity = useCallback((activityId: string) => {
    setFocusActivityId(activityId);
    setActiveTab('itinerary');
  }, []);
  const handleFocusHandled = useCallback(() => setFocusActivityId(null), []);

  const goToEditActivity = useCallback((activityId: string) => {
    setEditActivityId(activityId);
    setActiveTab('itinerary');
  }, []);
  const handleEditActivityHandled = useCallback(() => setEditActivityId(null), []);

  const goToEditExpense = useCallback((expenseId: string) => {
    setEditExpenseId(expenseId);
    setActiveTab('expenses');
  }, []);
  const handleEditExpenseHandled = useCallback(() => setEditExpenseId(null), []);

  const financials = useMemo(
    () => (trip ? getTripFinancials({ trips: app.trips, expenses, friends, settlements }, trip) : null),
    [trip, app.trips, expenses, friends, settlements],
  );

  const members = useMemo(() => (trip ? getTripMembers(trip, friends) : []), [trip, friends]);

  // Everyone referenced by this trip's data, with placeholders for people no
  // longer in the friends list so names/avatars still render.
  const people = useMemo<Friend[]>(() => {
    if (!trip || !financials) return [];
    const ids = getTripParticipantIds(trip, financials.expenses, financials.settlements);
    return ids.map(
      (pid) => friends.find((f) => f.id === pid) ?? { id: pid, name: 'Former traveler', email: '', color: '#9ca3af' },
    );
  }, [trip, financials, friends]);

  if (!hydrated) {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading trip…</span>
        <Skeleton className="h-64 rounded-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-6">
          <Skeleton className="h-8 w-80" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Skeleton className="h-48 lg:col-span-2" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (!trip || !financials) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <EmptyState
          icon={<Compass className="w-6 h-6" aria-hidden="true" />}
          title="Trip not found"
          description="This trip may have been deleted, or the link is wrong."
          action={
            <Link href="/trips">
              <Button variant="outline">Back to trips</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const status = getTripStatus(trip.startDate, trip.endDate, today);
  const isGuest = cloud.tripAccess(trip.id)?.isOwner === false;

  const handleEdit = (values: TripSubmitValues) => {
    updateTrip(trip.id, values);
    setEditOpen(false);
  };

  const handleDelete = () => {
    deleteTrip(trip.id);
    setDeleteOpen(false);
    router.push('/trips');
  };

  const tabs = [
    { value: 'overview' as const, label: 'Overview' },
    { value: 'itinerary' as const, label: 'Itinerary', count: trip.itinerary.reduce((s, d) => s + d.activities.length, 0) },
    { value: 'expenses' as const, label: 'Expenses', count: financials.expenses.length },
    { value: 'settle' as const, label: 'Settle up', count: financials.transfers.length },
  ];

  return (
    <div className="pb-16">
      {/* Hero */}
      <div className="h-64 relative" style={getCoverStyle(trip.coverImage)}>
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-x-0 bottom-0 top-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-between py-6 text-white">
          <div className="flex items-center justify-between">
            <Link href="/trips" className="inline-flex items-center text-white/80 hover:text-white text-sm">
              <ArrowLeft className="w-4 h-4 mr-1" aria-hidden="true" /> All trips
            </Link>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="text-white hover:bg-white/15 hover:text-white" onClick={() => setEditOpen(true)}>
                <Pencil className="w-4 h-4 mr-1.5" aria-hidden="true" /> Edit
              </Button>
              <Button size="sm" variant="ghost" className="text-white hover:bg-white/15 hover:text-white" onClick={() => setShareOpen(true)}>
                <Share2 className="w-4 h-4 mr-1.5" aria-hidden="true" /> Share
              </Button>
              <Button size="sm" variant="ghost" className="text-white hover:bg-white/15 hover:text-white" onClick={() => setDeleteOpen(true)}>
                {isGuest ? (
                  <>
                    <LogOut className="w-4 h-4 mr-1.5" aria-hidden="true" /> Leave
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-1.5" aria-hidden="true" /> Delete
                  </>
                )}
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="text-left rounded-xl -mx-2 px-2 py-2 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 group/hero"
            title="Edit trip details"
          >
            <Badge className="bg-white/90 text-gray-800 mb-3">
              {STATUS_LABEL[status]}
              <span className="ml-2 hidden sm:inline font-normal text-gray-400 opacity-0 transition-opacity group-hover/hero:opacity-100">
                · click to edit
              </span>
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-light mb-2 drop-shadow-sm">{trip.name}</h1>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm font-medium text-white/90">
              <div className="flex items-center">
                <MapPin className="w-4 h-4 mr-2" aria-hidden="true" />
                {trip.destination}
              </div>
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-2" aria-hidden="true" />
                {formatDateRange(trip.startDate, trip.endDate)}
              </div>
              <span className="text-white/70">{pluralize(members.length, 'traveler')}</span>
            </div>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} aria-label="Trip sections" className="mb-8" />

        {activeTab === 'overview' && (
          <OverviewTab
            trip={trip}
            members={members}
            financials={financials}
            onGoTo={setActiveTab}
            onGoToActivity={goToActivity}
            onEditTrip={() => setEditOpen(true)}
            onEditActivity={goToEditActivity}
            onEditExpense={goToEditExpense}
          />
        )}
        {activeTab === 'itinerary' && (
          <ItineraryTab
            trip={trip}
            today={today}
            focusActivityId={focusActivityId}
            onFocusHandled={handleFocusHandled}
            editActivityId={editActivityId}
            onEditHandled={handleEditActivityHandled}
          />
        )}
        {activeTab === 'expenses' && (
          <ExpensesTab
            trip={trip}
            expenses={financials.expenses}
            members={members}
            people={people}
            onGoToActivity={goToActivity}
            editExpenseId={editExpenseId}
            onEditHandled={handleEditExpenseHandled}
          />
        )}
        {activeTab === 'settle' && (
          <SettleTab
            trip={trip}
            balances={financials.balances}
            transfers={financials.transfers}
            settlements={financials.settlements}
            people={people}
          />
        )}
      </div>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit trip" size="lg">
        {editOpen && <EditTripForm trip={trip} friends={friends} onSubmit={handleEdit} onCancel={() => setEditOpen(false)} />}
      </Modal>

      <ShareTripModal trip={trip} members={members} isOpen={shareOpen} onClose={() => setShareOpen(false)} />

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={isGuest ? 'Leave trip' : 'Delete trip'}
        confirmLabel={isGuest ? 'Leave trip' : 'Delete trip'}
        message={
          isGuest ? (
            <>
              Leave <strong>{trip.name}</strong>? It will disappear from your account, but stays for everyone else.
            </>
          ) : (
            <>
              Delete <strong>{trip.name}</strong>? Its itinerary, {pluralize(financials.expenses.length, 'expense')} and{' '}
              {pluralize(financials.settlements.length, 'recorded payment')} will be removed permanently
              {cloud.tripAccess(trip.id) ? ' for everyone on the trip' : ''}.
            </>
          )
        }
      />
    </div>
  );
}

/** Separate component so the form state is created fresh each time the modal opens. */
function EditTripForm({
  trip,
  friends,
  onSubmit,
  onCancel,
}: {
  trip: Trip;
  friends: Friend[];
  onSubmit: (values: TripSubmitValues) => void;
  onCancel: () => void;
}) {
  const form = useTripForm(trip, friends);
  return <TripForm form={form} friends={friends} submitLabel="Save changes" onSubmit={onSubmit} onCancel={onCancel} compact />;
}
