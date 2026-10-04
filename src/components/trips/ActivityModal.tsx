'use client'

import React, { useState } from 'react';
import { BedDouble, Plane, Sparkles, type LucideIcon } from 'lucide-react';
import { Activity, ActivityCategory, ActivityKind, FlightDetails, HotelDetails, Trip } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ACTIVITY_CATEGORIES, addDays, compareDateKeys, formatDate, formatWeekday } from '@/lib/utils';
import {
  ACTIVITY_KINDS,
  DEFAULT_CHECK_IN_TIME,
  DEFAULT_CHECK_OUT_TIME,
  buildFlightTitle,
  buildHotelTitle,
  getKindLabel,
  hotelNights,
  joinDateTime,
  splitDateTime,
  validateFlightDetails,
  validateHotelDetails,
} from '@/lib/activities';
import { isDayInRange } from '@/lib/trip-helpers';

export interface ActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip;
  /** Day the activity belongs to (or will be added to). */
  date: string;
  /** When provided, edits this activity. */
  activity?: Activity;
  /**
   * `date` is the day the activity should live on. For flights/hotels it is
   * derived from the details (departure / check-in day).
   */
  onSave: (date: string, input: Omit<Activity, 'id'>) => void;
}

const KIND_ICONS: Record<ActivityKind, LucideIcon> = {
  generic: Sparkles,
  flight: Plane,
  hotel: BedDouble,
};

const ActivityModal: React.FC<ActivityModalProps> = (props) => {
  const { isOpen, onClose, activity, date } = props;
  const kindLabel = activity ? getKindLabel(activity.kind).toLowerCase() : 'activity';
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={activity ? `Edit ${kindLabel}` : 'Add to itinerary'}
      description={date ? `${formatWeekday(date)}, ${formatDate(date)}` : undefined}
      size="lg"
    >
      <ActivityForm key={`${activity?.id ?? 'new'}-${date}`} {...props} />
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

type FlightErrors = Partial<Record<keyof FlightDetails, string>>;
type HotelErrors = Partial<Record<keyof HotelDetails, string>>;

function parseCost(value: string): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
}

const ActivityForm: React.FC<ActivityModalProps> = ({ onClose, trip, date, activity, onSave }) => {
  const isEditing = Boolean(activity);
  const [kind, setKind] = useState<ActivityKind>(activity?.kind ?? 'generic');

  // Shared fields
  const [title, setTitle] = useState(activity?.title ?? '');
  const [notes, setNotes] = useState(activity?.notes ?? '');
  const [estimatedCost, setEstimatedCost] = useState(
    activity?.estimatedCost !== undefined ? String(activity.estimatedCost) : '',
  );

  // Generic
  const [time, setTime] = useState(activity?.kind === 'generic' ? activity.time : '');
  const [location, setLocation] = useState(activity?.kind === 'generic' ? activity.location : '');
  const [category, setCategory] = useState<ActivityCategory>(
    activity?.kind === 'generic' ? activity.category : 'activity',
  );
  const [targetDate, setTargetDate] = useState(date);
  const [titleError, setTitleError] = useState<string | undefined>();

  // Flight
  const existingFlight = activity?.details?.type === 'flight' ? activity.details : undefined;
  const depParts = splitDateTime(existingFlight?.departureDateTime ?? '');
  const arrParts = splitDateTime(existingFlight?.arrivalDateTime ?? '');
  const [airline, setAirline] = useState(existingFlight?.airline ?? '');
  const [flightNumber, setFlightNumber] = useState(existingFlight?.flightNumber ?? '');
  const [fromAirport, setFromAirport] = useState(existingFlight?.departureAirport ?? '');
  const [toAirport, setToAirport] = useState(existingFlight?.arrivalAirport ?? '');
  const [depDate, setDepDate] = useState(depParts.date || date);
  const [depTime, setDepTime] = useState(depParts.time);
  const [arrDate, setArrDate] = useState(arrParts.date || date);
  const [arrTime, setArrTime] = useState(arrParts.time);
  const [flightRef, setFlightRef] = useState(existingFlight?.bookingReference ?? '');
  const [seat, setSeat] = useState(existingFlight?.seat ?? '');
  const [terminal, setTerminal] = useState(existingFlight?.terminal ?? '');
  const [flightErrors, setFlightErrors] = useState<FlightErrors>({});

  // Hotel — default to the clicked day through the end of the trip.
  const existingHotel = activity?.details?.type === 'hotel' ? activity.details : undefined;
  const defaultCheckIn = isDayInRange(trip, date) ? date : trip.startDate || date;
  const defaultCheckOut =
    compareDateKeys(trip.endDate, defaultCheckIn) > 0 ? trip.endDate : addDays(defaultCheckIn, 1);
  const [hotelName, setHotelName] = useState(existingHotel?.hotelName ?? '');
  const [address, setAddress] = useState(existingHotel?.address ?? '');
  const [checkInDate, setCheckInDate] = useState(existingHotel?.checkInDate ?? defaultCheckIn);
  const [checkOutDate, setCheckOutDate] = useState(existingHotel?.checkOutDate ?? defaultCheckOut);
  const [checkInTime, setCheckInTime] = useState(existingHotel?.checkInTime ?? DEFAULT_CHECK_IN_TIME);
  const [checkOutTime, setCheckOutTime] = useState(existingHotel?.checkOutTime ?? DEFAULT_CHECK_OUT_TIME);
  const [hotelRef, setHotelRef] = useState(existingHotel?.bookingReference ?? '');
  const [roomType, setRoomType] = useState(existingHotel?.roomType ?? '');
  const [hotelErrors, setHotelErrors] = useState<HotelErrors>({});

  const dayOptions = trip.itinerary.map((d) => ({
    value: d.date,
    label: `${formatWeekday(d.date)}, ${formatDate(d.date)}`,
  }));

  const optional = (value: string) => (value.trim() ? value.trim() : undefined);

  const buildFlight = (): FlightDetails => ({
    type: 'flight',
    airline: airline.trim(),
    flightNumber: flightNumber.trim().toUpperCase().replace(/\s+/g, ''),
    departureAirport: fromAirport.trim().toUpperCase(),
    arrivalAirport: toAirport.trim().toUpperCase(),
    departureDateTime: joinDateTime(depDate, depTime),
    arrivalDateTime: joinDateTime(arrDate, arrTime),
    bookingReference: optional(flightRef),
    seat: optional(seat),
    terminal: optional(terminal),
  });

  const buildHotel = (): HotelDetails => ({
    type: 'hotel',
    hotelName: hotelName.trim(),
    address: address.trim(),
    checkInDate,
    checkOutDate,
    checkInTime: checkInTime || undefined,
    checkOutTime: checkOutTime || undefined,
    bookingReference: optional(hotelRef),
    roomType: optional(roomType),
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const cost = parseCost(estimatedCost);

    if (kind === 'flight') {
      const details = buildFlight();
      const errors = validateFlightDetails(details);
      setFlightErrors(errors);
      if (Object.keys(errors).length > 0) return;
      onSave(depDate, {
        kind: 'flight',
        title: title.trim() || buildFlightTitle(details),
        time: depTime,
        location: '',
        notes: notes.trim(),
        category: 'transport',
        details,
        estimatedCost: cost,
      });
      onClose();
      return;
    }

    if (kind === 'hotel') {
      const details = buildHotel();
      const errors = validateHotelDetails(details);
      setHotelErrors(errors);
      if (Object.keys(errors).length > 0) return;
      onSave(checkInDate, {
        kind: 'hotel',
        title: title.trim() || buildHotelTitle(details),
        time: checkInTime || DEFAULT_CHECK_IN_TIME,
        location: details.address,
        notes: notes.trim(),
        category: 'accommodation',
        details,
        estimatedCost: cost,
      });
      onClose();
      return;
    }

    if (!title.trim()) {
      setTitleError('Give the activity a title.');
      return;
    }
    onSave(targetDate, {
      kind: 'generic',
      title: title.trim(),
      time,
      location: location.trim(),
      notes: notes.trim(),
      category,
      estimatedCost: cost,
    });
    onClose();
  };

  const clearFlightError = (key: keyof FlightDetails) =>
    setFlightErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  const clearHotelError = (key: keyof HotelDetails) =>
    setHotelErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const titlePlaceholder =
    kind === 'flight'
      ? buildFlightTitle({ airline, flightNumber, departureAirport: fromAirport, arrivalAirport: toAirport })
      : kind === 'hotel'
        ? buildHotelTitle({ hotelName })
        : 'e.g. Louvre Museum';

  const nights = kind === 'hotel' ? hotelNights({ checkInDate, checkOutDate }) : 0;

  const costInput = (
    <Input
      label="Estimated cost (optional)"
      type="number"
      min={0}
      step="0.01"
      inputMode="decimal"
      prefix="$"
      value={estimatedCost}
      onChange={(e) => setEstimatedCost(e.target.value)}
      placeholder="0.00"
      hint="Planned spend — compare it against linked expenses later."
    />
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {!isEditing && (
        <div role="radiogroup" aria-label="Type" className="grid grid-cols-3 gap-2">
          {ACTIVITY_KINDS.map((k) => {
            const Icon = KIND_ICONS[k.value];
            const selected = kind === k.value;
            return (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setKind(k.value)}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#7C9A82] ${
                  selected
                    ? 'bg-[#7C9A82] border-[#7C9A82] text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-[#7C9A82] hover:text-[#5A7A60]'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {k.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {kind === 'flight' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Airline"
              value={airline}
              onChange={(e) => {
                setAirline(e.target.value);
                clearFlightError('flightNumber');
              }}
              placeholder="e.g. Qantas"
              autoFocus
            />
            <Input
              label="Flight number"
              value={flightNumber}
              onChange={(e) => {
                setFlightNumber(e.target.value.toUpperCase());
                clearFlightError('flightNumber');
              }}
              placeholder="e.g. QF1"
              error={flightErrors.flightNumber}
              className="uppercase"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="From"
              value={fromAirport}
              onChange={(e) => {
                setFromAirport(e.target.value.toUpperCase());
                clearFlightError('departureAirport');
              }}
              placeholder="SYD"
              maxLength={4}
              error={flightErrors.departureAirport}
              className="uppercase tracking-wider"
              autoCapitalize="characters"
              required
            />
            <Input
              label="To"
              value={toAirport}
              onChange={(e) => {
                setToAirport(e.target.value.toUpperCase());
                clearFlightError('arrivalAirport');
              }}
              placeholder="LHR"
              maxLength={4}
              error={flightErrors.arrivalAirport}
              className="uppercase tracking-wider"
              autoCapitalize="characters"
              required
            />
          </div>
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-1">Departure</legend>
            <div className="grid grid-cols-2 gap-4">
              <Input
                aria-label="Departure date"
                type="date"
                value={depDate}
                onChange={(e) => {
                  setDepDate(e.target.value);
                  if (compareDateKeys(arrDate, e.target.value) < 0) setArrDate(e.target.value);
                  clearFlightError('departureDateTime');
                }}
                required
              />
              <Input
                aria-label="Departure time"
                type="time"
                value={depTime}
                onChange={(e) => {
                  setDepTime(e.target.value);
                  clearFlightError('departureDateTime');
                }}
                required
              />
            </div>
            {flightErrors.departureDateTime && (
              <p className="mt-1 text-sm text-[#C47C7C]">{flightErrors.departureDateTime}</p>
            )}
          </fieldset>
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-1">Arrival</legend>
            <div className="grid grid-cols-2 gap-4">
              <Input
                aria-label="Arrival date"
                type="date"
                value={arrDate}
                min={depDate || undefined}
                onChange={(e) => {
                  setArrDate(e.target.value);
                  clearFlightError('arrivalDateTime');
                }}
                required
              />
              <Input
                aria-label="Arrival time"
                type="time"
                value={arrTime}
                onChange={(e) => {
                  setArrTime(e.target.value);
                  clearFlightError('arrivalDateTime');
                }}
                required
              />
            </div>
            {flightErrors.arrivalDateTime ? (
              <p className="mt-1 text-sm text-[#C47C7C]">{flightErrors.arrivalDateTime}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-400">Local times. The flight appears on its departure day.</p>
            )}
          </fieldset>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Booking ref" value={flightRef} onChange={(e) => setFlightRef(e.target.value.toUpperCase())} placeholder="ABC123" className="uppercase" />
            <Input label="Seat" value={seat} onChange={(e) => setSeat(e.target.value.toUpperCase())} placeholder="14A" className="uppercase" />
            <Input label="Terminal" value={terminal} onChange={(e) => setTerminal(e.target.value)} placeholder="T1" />
          </div>
          <Input
            label="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={titlePlaceholder}
            hint="Leave blank to use the flight number and route."
          />
        </>
      )}

      {/* ----------------------------------------------------------------- */}
      {kind === 'hotel' && (
        <>
          <Input
            label="Hotel name"
            value={hotelName}
            onChange={(e) => {
              setHotelName(e.target.value);
              clearHotelError('hotelName');
            }}
            placeholder="e.g. Hôtel du Marais"
            error={hotelErrors.hotelName}
            required
            autoFocus
          />
          <Input label="Address (optional)" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city" />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Check-in"
              type="date"
              value={checkInDate}
              onChange={(e) => {
                setCheckInDate(e.target.value);
                if (compareDateKeys(checkOutDate, e.target.value) <= 0) setCheckOutDate(addDays(e.target.value, 1));
                clearHotelError('checkInDate');
              }}
              error={hotelErrors.checkInDate}
              required
            />
            <Input
              label="Check-out"
              type="date"
              value={checkOutDate}
              min={checkInDate ? addDays(checkInDate, 1) : undefined}
              onChange={(e) => {
                setCheckOutDate(e.target.value);
                clearHotelError('checkOutDate');
              }}
              error={hotelErrors.checkOutDate}
              hint={nights > 0 ? `${nights} night${nights === 1 ? '' : 's'}` : undefined}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Check-in time" type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} />
            <Input label="Check-out time" type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Booking ref" value={hotelRef} onChange={(e) => setHotelRef(e.target.value.toUpperCase())} placeholder="HM-12345" className="uppercase" />
            <Input label="Room type" value={roomType} onChange={(e) => setRoomType(e.target.value)} placeholder="e.g. Double room" />
          </div>
          <Input
            label="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={titlePlaceholder}
            hint="Leave blank to use “Stay at <hotel>”."
          />
        </>
      )}

      {/* ----------------------------------------------------------------- */}
      {kind === 'generic' && (
        <>
          <Input
            label="Title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError) setTitleError(undefined);
            }}
            placeholder={titlePlaceholder}
            error={titleError}
            required
            autoFocus
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Time (optional)" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            <Select
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ActivityCategory)}
              options={ACTIVITY_CATEGORIES}
            />
          </div>
          {dayOptions.length > 1 && (
            <Select label="Day" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} options={dayOptions} />
          )}
          <Input label="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Rue de Rivoli" />
        </>
      )}

      {costInput}
      <Textarea label="Notes (optional)" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tickets, reservations, reminders…" />

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{isEditing ? 'Save changes' : `Add ${getKindLabel(kind).toLowerCase()}`}</Button>
      </div>
    </form>
  );
};

export default ActivityModal;
export { ActivityModal };
