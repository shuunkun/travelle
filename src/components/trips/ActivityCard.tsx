'use client'

import React from 'react';
import {
  BedDouble,
  ChevronDown,
  ChevronUp,
  Clock,
  Link2,
  MapPin,
  Pencil,
  Plane,
  Plus,
  Receipt,
  Ticket,
  Trash2,
  X,
} from 'lucide-react';
import { Activity, Expense } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate, getCategoryIcon, getCategoryLabel, pluralize, unlessInteractive } from '@/lib/utils';
import {
  activityActualCost,
  flightArrivalDate,
  flightArrivalDayOffset,
  flightArrivalTime,
  flightDepartureDate,
  flightDepartureTime,
  formatTime12,
  hotelCheckInTime,
  hotelCheckOutTime,
  hotelNights,
  isFlightActivity,
  isHotelActivity,
} from '@/lib/activities';

export interface ActivityCardProps {
  activity: Activity;
  /** Position within the day, for move up/down. */
  index: number;
  count: number;
  linkedExpenses: Expense[];
  highlighted?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onAddCost: () => void;
  onLinkExpense: () => void;
  onUnlinkExpense: (expenseId: string) => void;
  onEditExpense?: (expense: Expense) => void;
}

const shortDate = (date: string) => formatDate(date, { month: 'short', day: 'numeric' });

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-700">{value}</span>
    </span>
  );
}

/** Timeline marker for an activity: lucide icon for typed kinds, emoji otherwise. */
export function ActivityMarker({ activity, className = '' }: { activity: Activity; className?: string }) {
  const base = `w-8 h-8 rounded-full flex items-center justify-center text-sm ${className}`;
  if (isFlightActivity(activity)) {
    return (
      <div className={`${base} bg-blue-50 text-blue-600`} title="Flight">
        <Plane className="w-4 h-4" aria-hidden="true" />
      </div>
    );
  }
  if (isHotelActivity(activity)) {
    return (
      <div className={`${base} bg-purple-50 text-purple-600`} title="Hotel">
        <BedDouble className="w-4 h-4" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className={`${base} bg-[#E8F0EA]`} title={getCategoryLabel(activity.category)}>
      <span aria-hidden="true">{getCategoryIcon(activity.category)}</span>
    </div>
  );
}

const ActivityCard: React.FC<ActivityCardProps> = ({
  activity,
  index,
  count,
  linkedExpenses,
  highlighted = false,
  onEdit,
  onDelete,
  onMove,
  onAddCost,
  onLinkExpense,
  onUnlinkExpense,
  onEditExpense,
}) => {
  const planned = activity.estimatedCost;
  const actual = activityActualCost(linkedExpenses, activity.id);
  const hasCostInfo = planned !== undefined || linkedExpenses.length > 0;
  const overPlan = planned !== undefined && actual > planned + 0.004;

  const renderHeaderLine = () => {
    if (isFlightActivity(activity)) {
      const d = activity.details;
      return (
        <div className="flex items-center text-xs font-medium text-blue-600 mb-1">
          <Plane className="w-3 h-3 mr-1" aria-hidden="true" />
          {[d.airline, d.flightNumber].filter(Boolean).join(' · ') || 'Flight'}
        </div>
      );
    }
    if (isHotelActivity(activity)) {
      const nights = hotelNights(activity.details);
      return (
        <div className="flex items-center text-xs font-medium text-purple-600 mb-1">
          <BedDouble className="w-3 h-3 mr-1" aria-hidden="true" />
          {nights > 0 ? pluralize(nights, 'night') : 'Hotel'}
          {activity.details.roomType ? ` · ${activity.details.roomType}` : ''}
        </div>
      );
    }
    return (
      <div className="flex items-center text-xs font-medium text-[#7C9A82] mb-1">
        <Clock className="w-3 h-3 mr-1" aria-hidden="true" /> {formatTime12(activity.time)}
      </div>
    );
  };

  const renderBody = () => {
    if (isFlightActivity(activity)) {
      const d = activity.details;
      const offset = flightArrivalDayOffset(d);
      return (
        <div className="mt-2.5 space-y-2">
          <div className="flex items-center gap-3 text-sm">
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-wide text-gray-900 leading-tight">{d.departureAirport || '—'}</p>
              <p className="text-xs text-gray-500">
                {formatTime12(flightDepartureTime(d))} · {shortDate(flightDepartureDate(d))}
              </p>
            </div>
            <div className="flex-1 flex items-center text-gray-300" aria-hidden="true">
              <span className="h-px flex-1 bg-gray-200" />
              <Plane className="w-3.5 h-3.5 mx-1 text-gray-400" />
              <span className="h-px flex-1 bg-gray-200" />
            </div>
            <div className="min-w-0 text-right">
              <p className="text-lg font-semibold tracking-wide text-gray-900 leading-tight">
                {d.arrivalAirport || '—'}
                {offset > 0 && (
                  <sup className="ml-0.5 text-[10px] font-medium text-[#C47C7C]" title={`Arrives ${offset} day${offset === 1 ? '' : 's'} later`}>
                    +{offset}
                  </sup>
                )}
              </p>
              <p className="text-xs text-gray-500">
                {formatTime12(flightArrivalTime(d))} · {shortDate(flightArrivalDate(d))}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Detail label="Ref" value={d.bookingReference} />
            <Detail label="Seat" value={d.seat} />
            <Detail label="Terminal" value={d.terminal} />
            <Detail label="Gate" value={d.gate} />
          </div>
        </div>
      );
    }
    if (isHotelActivity(activity)) {
      const d = activity.details;
      return (
        <div className="mt-2.5 space-y-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">Check-in</p>
              <p className="font-medium text-gray-900">{shortDate(d.checkInDate)}</p>
              <p className="text-xs text-gray-500">{formatTime12(hotelCheckInTime(d))}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Check-out</p>
              <p className="font-medium text-gray-900">{shortDate(d.checkOutDate)}</p>
              <p className="text-xs text-gray-500">{formatTime12(hotelCheckOutTime(d))}</p>
            </div>
          </div>
          {d.address && (
            <div className="text-sm text-gray-500 flex items-start">
              <MapPin className="w-3.5 h-3.5 mr-1 mt-0.5 shrink-0" aria-hidden="true" />
              <span className="break-words">{d.address}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Detail label="Ref" value={d.bookingReference} />
          </div>
        </div>
      );
    }
    return activity.location ? (
      <div className="text-sm text-gray-500 flex items-start mt-1.5">
        <MapPin className="w-3.5 h-3.5 mr-1 mt-0.5 shrink-0" aria-hidden="true" />
        <span className="break-words">{activity.location}</span>
      </div>
    ) : null;
  };

  const activate = unlessInteractive(onEdit);

  return (
    <div
      data-activity-id={activity.id}
      tabIndex={0}
      role="group"
      aria-label={`${activity.title}. Click to edit.`}
      title="Click to edit"
      onClick={activate}
      onKeyDown={activate}
      className={`flex-1 min-w-0 bg-white p-4 rounded-xl border shadow-sm group outline-none cursor-pointer hover:shadow-md hover:border-gray-200 focus-visible:ring-2 focus-visible:ring-[#7C9A82] focus-visible:ring-offset-2 transition-[box-shadow,border-color] duration-200 ${
        highlighted ? 'border-[#7C9A82] ring-2 ring-[#7C9A82]/50 ring-offset-2' : 'border-gray-100'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {renderHeaderLine()}
          <h4 className="text-base font-medium text-gray-900 break-words">{activity.title}</h4>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 opacity-60 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${activity.title} up`}>
            <ChevronUp size={15} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${activity.title} down`}>
            <ChevronDown size={15} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit} aria-label={`Edit ${activity.title}`}>
            <Pencil size={14} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-red-500" onClick={onDelete} aria-label={`Delete ${activity.title}`}>
            <Trash2 size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {renderBody()}

      {activity.notes && (
        <p className="text-sm text-gray-600 bg-gray-50 p-2.5 rounded-md mt-2 whitespace-pre-wrap break-words">{activity.notes}</p>
      )}

      {/* Costs */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {hasCostInfo ? (
            <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
              <div className="flex items-baseline gap-1">
                <dt className="text-gray-400">Planned</dt>
                <dd className="font-medium text-gray-800 tabular-nums">{planned !== undefined ? formatCurrency(planned) : '—'}</dd>
              </div>
              <div className="flex items-baseline gap-1">
                <dt className="text-gray-400">Actual</dt>
                <dd className={`font-medium tabular-nums ${linkedExpenses.length === 0 ? 'text-gray-400' : overPlan ? 'text-[#C47C7C]' : 'text-teal-600'}`}>
                  {linkedExpenses.length === 0 ? 'none yet' : formatCurrency(actual)}
                </dd>
              </div>
              {planned !== undefined && linkedExpenses.length > 0 && (
                <div className="text-gray-400">
                  {overPlan ? `${formatCurrency(actual - planned)} over plan` : `${formatCurrency(planned - actual)} under plan`}
                </div>
              )}
            </dl>
          ) : (
            <span className="text-xs text-gray-400 inline-flex items-center gap-1">
              <Receipt className="w-3.5 h-3.5" aria-hidden="true" /> No costs yet
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-[#5A7A60] hover:bg-[#E8F0EA]" onClick={onAddCost} icon={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}>
              Add cost
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onLinkExpense} icon={<Link2 className="w-3.5 h-3.5" aria-hidden="true" />}>
              Link expense
            </Button>
          </div>
        </div>
        {linkedExpenses.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Expenses linked to ${activity.title}`}>
            {linkedExpenses.map((expense) => (
              <li key={expense.id} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white pl-2.5 pr-1 py-0.5 text-xs text-gray-700">
                <button
                  type="button"
                  onClick={() => onEditExpense?.(expense)}
                  className="inline-flex min-w-0 items-center gap-1 rounded-full hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#7C9A82]"
                  title="Edit expense"
                >
                  <Ticket className="w-3 h-3 text-gray-400" aria-hidden="true" />
                  <span className="truncate max-w-[12rem]">{expense.description}</span>
                  <span className="font-medium tabular-nums">{formatCurrency(expense.amount, expense.currency)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onUnlinkExpense(expense.id)}
                  className="ml-0.5 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#7C9A82]"
                  aria-label={`Unlink ${expense.description} from ${activity.title}`}
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ActivityCard;
export { ActivityCard };
