'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Map } from 'lucide-react';
import { useApp } from '@/components/providers/AppProvider';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { TripCard } from '@/components/trips/TripCard';
import { compareDateKeys, getTripStatus, todayKey } from '@/lib/utils';
import { getTripExpenses, getTripSpent } from '@/lib/selectors';

type Filter = 'all' | 'upcoming' | 'past';

export default function TripsPage() {
  const { hydrated, trips, expenses, friends } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [today] = useState(() => todayKey());

  const withStatus = useMemo(
    () => trips.map((trip) => ({ trip, status: getTripStatus(trip.startDate, trip.endDate, today) })),
    [trips, today],
  );

  const counts = {
    all: trips.length,
    upcoming: withStatus.filter((t) => t.status !== 'past').length,
    past: withStatus.filter((t) => t.status === 'past').length,
  };

  const filtered = useMemo(() => {
    const list = withStatus.filter(({ status }) => {
      if (filter === 'upcoming') return status !== 'past';
      if (filter === 'past') return status === 'past';
      return true;
    });
    return list
      .sort((a, b) => {
        const rank = { ongoing: 0, upcoming: 1, past: 2 };
        if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
        return a.status === 'past'
          ? compareDateKeys(b.trip.endDate, a.trip.endDate)
          : compareDateKeys(a.trip.startDate, b.trip.startDate);
      })
      .map((x) => x.trip);
  }, [withStatus, filter]);

  if (!hydrated) return <PageSkeleton />;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-light text-gray-900">Your trips</h1>
        <Link href="/trips/new">
          <Button icon={<Plus className="w-4 h-4" aria-hidden="true" />}>New trip</Button>
        </Link>
      </div>

      <Tabs
        tabs={[
          { value: 'all', label: 'All', count: counts.all },
          { value: 'upcoming', label: 'Upcoming', count: counts.upcoming },
          { value: 'past', label: 'Past', count: counts.past },
        ]}
        value={filter}
        onChange={setFilter}
        aria-label="Filter trips"
        className="mb-8"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Map className="w-6 h-6" aria-hidden="true" />}
          title={filter === 'all' ? 'No trips yet' : `No ${filter} trips`}
          description={
            filter === 'all'
              ? "You haven't planned any trips yet. Start with a destination and some dates."
              : filter === 'upcoming'
                ? 'Nothing coming up. Time to plan the next adventure?'
                : 'Trips you have finished will show up here.'
          }
          action={
            <Link href="/trips/new">
              <Button variant="outline">Create a trip</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              friends={friends}
              spent={getTripSpent(getTripExpenses(expenses, trip.id))}
              today={today}
            />
          ))}
        </div>
      )}
    </div>
  );
}
