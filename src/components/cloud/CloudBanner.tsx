'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CloudOff, X } from 'lucide-react';
import { useApp, useCloud } from '@/components/providers/AppProvider';
import { ImportDeviceTrips } from '@/components/cloud/ImportDeviceTrips';
import { isSampleTrip } from '@/lib/cloud/import';

/** Nudges toward signing in (signed out) or uploading device trips (signed in). */
export function CloudBanner() {
  const cloud = useCloud();
  const { trips, hydrated } = useApp();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);

  if (!cloud.configured || !cloud.authReady || dismissed || pathname === '/account' || pathname === '/join') return null;

  if (cloud.user) {
    if (cloud.deviceTrips.length === 0) return null;
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <ImportDeviceTrips compact />
      </div>
    );
  }

  const ownTrips = hydrated ? trips.filter((t) => !isSampleTrip(t.id)).length : 0;
  return (
    <div className="bg-[#FBF8F2] border-b border-[#EDE4D3]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3 text-sm text-gray-700">
        <CloudOff className="w-4 h-4 text-[#8A7A5C] shrink-0" aria-hidden="true" />
        <p className="flex-1">
          {ownTrips > 0 ? 'Your trips are saved in this browser only.' : 'Trips are saved in this browser only.'}{' '}
          <Link href="/account" className="font-medium text-[#5A7A60] underline underline-offset-2 hover:text-[#3F5A45]">
            Sign in
          </Link>{' '}
          to use them on any device and plan with friends.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-gray-400 hover:text-gray-600 rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C9A82]"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
