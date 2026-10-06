'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { useCloud } from '@/components/providers/AppProvider';
import { Button } from '@/components/ui/Button';
import { formatDateRange, pluralize } from '@/lib/utils';

/** Offers to copy trips saved in this browser (while signed out) into the account. */
export function ImportDeviceTrips({ compact = false }: { compact?: boolean }) {
  const cloud = useCloud();
  const [deselected, setDeselected] = useState<Set<string>>(() => new Set());

  if (!cloud.user || cloud.deviceTrips.length === 0) return null;
  const chosen = cloud.deviceTrips.filter((t) => !deselected.has(t.id)).map((t) => t.id);

  const toggle = (id: string) =>
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="rounded-xl border border-[#D4C5A9] bg-[#FBF8F2] p-4">
      <div className="flex items-start gap-3">
        <Upload className="w-5 h-5 text-[#8A7A5C] shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900">
            {pluralize(cloud.deviceTrips.length, 'trip')} on this device {cloud.deviceTrips.length === 1 ? "isn't" : "aren't"}{' '}
            in your account yet
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            Upload {cloud.deviceTrips.length === 1 ? 'it' : 'them'} to see {cloud.deviceTrips.length === 1 ? 'it' : 'them'} on every
            device and share with friends.
          </p>
          {!compact && (
            <ul className="mt-3 space-y-1.5">
              {cloud.deviceTrips.map((trip) => (
                <li key={trip.id}>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-[#7C9A82] focus:ring-[#7C9A82]"
                      checked={!deselected.has(trip.id)}
                      onChange={() => toggle(trip.id)}
                    />
                    <span className="font-medium">{trip.name}</span>
                    <span className="text-gray-400">{formatDateRange(trip.startDate, trip.endDate)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" className="mt-3" disabled={chosen.length === 0} onClick={() => cloud.importDeviceTrips(chosen)}>
            Upload {pluralize(chosen.length, 'trip')}
          </Button>
        </div>
      </div>
    </div>
  );
}
