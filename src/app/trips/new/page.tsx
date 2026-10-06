'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Calendar, Users, Wallet, Sparkles, PenLine } from 'lucide-react';
import { SmartImport } from '@/components/trips/SmartImport';
import { useApp } from '@/components/providers/AppProvider';
import { TripForm, TripSubmitValues, useTripForm } from '@/components/trips/TripForm';
import { Card } from '@/components/ui/Card';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { Friend } from '@/lib/types';
import { formatCurrency, formatDateRange, getCoverStyle, getDaysBetween, pluralize } from '@/lib/utils';

export default function NewTripPage() {
  const { hydrated, friends } = useApp();
  if (!hydrated) return <PageSkeleton cards={1} />;
  // Mount the form only once friends are known so the default travelers
  // (you) can be pre-selected.
  return <NewTripForm friends={friends} />;
}

function NewTripForm({ friends }: { friends: Friend[] }) {
  const router = useRouter();
  const { addTrip } = useApp();
  const form = useTripForm(undefined, friends);
  const { values } = form;
  const [mode, setMode] = useState<'paste' | 'form'>('paste');

  const handleSubmit = (submitted: TripSubmitValues) => {
    const trip = addTrip(submitted);
    router.push(`/trips/${trip.id}`);
  };

  const days = values.startDate && values.endDate ? getDaysBetween(values.startDate, values.endDate) : 0;
  const budget = values.budget.trim() === '' ? 0 : Number(values.budget);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <Link href="/trips" className="inline-flex items-center text-gray-500 hover:text-gray-900 mb-4 text-sm">
          <ArrowLeft className="w-4 h-4 mr-1" aria-hidden="true" /> Back to trips
        </Link>
        <h1 className="text-3xl font-light text-gray-900">Plan a new trip</h1>
        <p className="text-gray-500 mt-1">
          {mode === 'paste'
            ? 'Paste notes, an itinerary or booking emails and we’ll build the trip for you.'
            : 'We’ll create a day-by-day itinerary from your dates.'}
        </p>
        <div className="mt-5 inline-flex rounded-lg border border-gray-200 bg-white p-1" role="group" aria-label="How to start">
          {(
            [
              { value: 'paste', label: 'Paste notes', icon: Sparkles },
              { value: 'form', label: 'Fill in a form', icon: PenLine },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === value ? 'bg-[#7C9A82] text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'paste' ? (
        <div className="max-w-3xl">
          <Card>
            <SmartImport mode="new" onDone={(id) => router.push(`/trips/${id}`)} />
          </Card>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <TripForm form={form} friends={friends} onSubmit={handleSubmit} onCancel={() => router.push('/trips')} submitLabel="Create trip" />
        </div>

        <div>
          <div className="sticky top-24">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Preview</h3>
            <Card className="overflow-hidden p-0">
              <div className="h-40 relative" style={getCoverStyle(values.coverImage)}>
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <h3 className="text-xl font-medium truncate">{values.name || 'Trip name'}</h3>
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-center text-gray-600 text-sm mb-3">
                  <MapPin className="w-4 h-4 mr-2 text-[#7C9A82]" aria-hidden="true" />
                  <span className="truncate">{values.destination || 'Destination'}</span>
                </div>
                <div className="flex items-center text-gray-600 text-sm mb-3">
                  <Calendar className="w-4 h-4 mr-2 text-[#7C9A82]" aria-hidden="true" />
                  <span>
                    {values.startDate && values.endDate ? formatDateRange(values.startDate, values.endDate) : 'Dates'}
                    {days > 0 && <span className="text-gray-400"> · {pluralize(days, 'day')}</span>}
                  </span>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center">
                    <Users className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    {pluralize(values.travelers.length, 'traveler')}
                  </div>
                  <div className="flex items-center">
                    <Wallet className="w-4 h-4 mr-1.5" aria-hidden="true" />
                    {Number.isFinite(budget) ? formatCurrency(budget) : '—'}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
