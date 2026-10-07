'use client'

import React from 'react';
import Link from 'next/link';
import { MapPin, Calendar, Users, Wallet, ChevronRight } from 'lucide-react';
import { Friend, Trip } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { AvatarGroup } from '@/components/ui/Avatar';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatCurrency, formatDateRange, getCoverStyle, getTripStatus, pluralize } from '@/lib/utils';
import { getTripMembers } from '@/lib/selectors';

export interface TripCardProps {
  trip: Trip;
  friends: Friend[];
  spent: number;
  /** Today's date key, passed in so cards stay pure. */
  today: string;
}

const STATUS_LABEL = { upcoming: 'Upcoming', ongoing: 'Happening now', past: 'Past' } as const;
const STATUS_VARIANT = { upcoming: 'success', ongoing: 'warning', past: 'default' } as const;

const TripCard: React.FC<TripCardProps> = ({ trip, friends, spent, today }) => {
  const members = getTripMembers(trip, friends);
  const status = getTripStatus(trip.startDate, trip.endDate, today);
  const budgetPct = trip.budget > 0 ? (spent / trip.budget) * 100 : 0;

  return (
    <Link href={`/trips/${trip.id}`} className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C9A82] rounded-xl">
      <Card className="h-full hover:shadow-md transition-shadow overflow-hidden flex flex-col p-0">
        <div className="h-40 relative" style={getCoverStyle(trip.coverImage)}>
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
          <div className="absolute top-3 right-3">
            <Badge variant={STATUS_VARIANT[status]} className="bg-white/90 backdrop-blur-sm">
              {STATUS_LABEL[status]}
            </Badge>
          </div>
          <div className="absolute bottom-4 left-4 right-4 text-white">
            <h3 className="text-xl font-medium truncate drop-shadow-sm">{trip.name}</h3>
            <div className="flex items-center text-white/90 text-sm gap-1">
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="truncate">{trip.destination}</span>
            </div>
          </div>
        </div>

        <div className="p-5 flex-1 flex flex-col">
          <div className="flex items-center text-gray-600 text-sm mb-4">
            <Calendar className="w-4 h-4 mr-2 text-[#7C9A82]" aria-hidden="true" />
            <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
          </div>

          <div className="mt-auto">
            {trip.budget > 0 ? (
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-500">Budget</span>
                  <span className={`font-medium ${budgetPct > 100 ? 'text-[#C47C7C]' : 'text-gray-700'}`}>
                    {formatCurrency(spent, trip.currency)} / {formatCurrency(trip.budget, trip.currency)}
                  </span>
                </div>
                <ProgressBar value={budgetPct} label={`${trip.name} budget used`} />
              </div>
            ) : (
              <div className="mb-4 flex justify-between text-xs">
                <span className="text-gray-500">Spent</span>
                <span className="font-medium text-gray-700">{formatCurrency(spent, trip.currency)}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-gray-50">
              {members.length > 0 ? (
                <AvatarGroup people={members} />
              ) : (
                <div className="flex items-center text-sm text-gray-500">
                  <Users className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  {pluralize(trip.travelers.length, 'traveler')}
                </div>
              )}
              <div className="flex items-center gap-3">
                {trip.budget <= 0 && (
                  <span className="flex items-center text-xs text-gray-400">
                    <Wallet className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> No budget
                  </span>
                )}
                <span className="text-[#7C9A82] bg-[#E8F0EA] p-1.5 rounded-full group-hover:bg-[#7C9A82] group-hover:text-white transition-colors">
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
};

export default TripCard;
export { TripCard };
