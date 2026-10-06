'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Sparkles, UserPlus, Check } from 'lucide-react';
import { useApp } from '@/components/providers/AppProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Friend, Trip } from '@/lib/types';
import { ME_ID } from '@/lib/selectors';
import { ParsedItem, ParsedTripText, parseTripText, resolveItemDate } from '@/lib/parse-text';
import * as tripHelpers from '@/lib/trip-helpers';
import { flightArrivalDayOffset, formatTime12, hotelNights } from '@/lib/activities';
import {
  DEFAULT_COVER,
  PRESET_COLORS,
  compareDateKeys,
  formatCurrency,
  formatDate,
  generateId,
  getCategoryIcon,
  isDateKey,
  pluralize,
  todayKey,
} from '@/lib/utils';

const EXAMPLE = `HK trip with Sarah and Marco
21-30 Nov 2026
Budget: $3000

CX110 SYD → HKG 21 Nov 09:50 - 16:55 $850
Hotel ICON, Tsim Sha Tsui, 21-25 Nov HK$4,200
25 Nov 10:15 train to Guangzhou
Staying at Garden Hotel Guangzhou 25-28 Nov

Day 1
- 7pm dinner at Tim Ho Wan
Day 2
- 9am Victoria Peak tram
- Lunch dim sum @ Maxim's Palace $300
29 Nov: Window of the World, Shenzhen
CX111 HKG-SYD 30 Nov 23:50 +1 10:55

Packing:
- passport
- adapter`;

type Props =
  | { mode: 'new'; onDone: (tripId: string) => void }
  | { mode: 'existing'; trip: Trip; onDone: () => void; onCancel: () => void };

interface TripFields {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: string;
}

function matchFriend(name: string, friends: Friend[]): Friend | undefined {
  const lower = name.toLowerCase();
  return (
    friends.find((f) => f.id !== ME_ID && f.name.toLowerCase() === lower) ??
    friends.find((f) => f.id !== ME_ID && f.name.toLowerCase().split(/\s+/)[0] === lower)
  );
}

/** Days an item needs inside the trip (a red-eye landing the next day doesn't extend it). */
function itemSpan(item: ParsedItem, date: string): [string, string] {
  const d = item.activity.details;
  if (d?.type === 'hotel') return [date, d.checkOutDate || date];
  return [date, date];
}

export function SmartImport(props: Props) {
  const existing = props.mode === 'existing' ? props.trip : undefined;
  const { friends, addTrip, addFriend, updateTrip, addActivity, addChecklistItem } = useApp();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedTripText | null>(null);
  const [fields, setFields] = useState<TripFields>({ name: '', destination: '', startDate: '', endDate: '', budget: '' });
  const [skipItems, setSkipItems] = useState<Set<string>>(() => new Set());
  const [skipChecklist, setSkipChecklist] = useState<Set<number>>(() => new Set());
  const [skipPeople, setSkipPeople] = useState<Set<string>>(() => new Set());
  const [extendRange, setExtendRange] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const read = () => {
    const result = parseTripText(text, {
      today: todayKey(),
      startDate: existing?.startDate,
      endDate: existing?.endDate,
    });
    setParsed(result);
    setFields({
      name: result.name ?? '',
      destination: result.destination ?? '',
      startDate: result.startDate ?? '',
      endDate: result.endDate ?? '',
      budget: result.budget ? String(result.budget) : '',
    });
    setSkipItems(new Set());
    setSkipChecklist(new Set());
    setSkipPeople(new Set());
    setError(null);
  };

  const start = existing?.startDate ?? fields.startDate;
  const end = existing?.endDate ?? fields.endDate;

  const placed = useMemo(() => {
    if (!parsed) return [];
    return parsed.items
      .map((item) => ({ item, date: resolveItemDate(item, start) }))
      .sort((a, b) =>
        compareDateKeys(a.date ?? '9999', b.date ?? '9999') || (a.item.activity.time || '99').localeCompare(b.item.activity.time || '99'),
      );
  }, [parsed, start]);

  const chosen = placed.filter((p) => !skipItems.has(p.item.key) && p.date);
  const unplacedItems = placed.filter((p) => !p.date);
  const checklist = parsed?.checklist.filter((_, i) => !skipChecklist.has(i)) ?? [];
  const people = (parsed?.travelerNames ?? []).map((name) => ({ name, friend: matchFriend(name, friends) }));

  // Range needed to hold every chosen item.
  let needStart = start;
  let needEnd = end;
  for (const { item, date } of chosen) {
    const [a, b] = itemSpan(item, date!);
    if (!needStart || compareDateKeys(a, needStart) < 0) needStart = a;
    if (!needEnd || compareDateKeys(b, needEnd) > 0) needEnd = b;
  }
  const outsideRange = Boolean(start && end && (needStart !== start || needEnd !== end));

  const toggle = <T,>(set: Set<T>, value: T, apply: (next: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    apply(next);
  };

  const create = () => {
    if (props.mode === 'existing') {
      const trip = props.trip;
      if (outsideRange && extendRange) updateTrip(trip.id, { startDate: needStart, endDate: needEnd });
      for (const { item, date } of chosen) addActivity(trip.id, date!, item.activity);
      checklist.forEach((t) => addChecklistItem(trip.id, t));
      props.onDone();
      return;
    }

    const startDate = fields.startDate && isDateKey(fields.startDate) ? needStart : '';
    const endDate = fields.endDate && isDateKey(fields.endDate) ? needEnd : '';
    if (!startDate || !endDate) {
      setError('Add the trip dates so we know where each day goes.');
      return;
    }
    const travelers = [ME_ID];
    people.forEach(({ name, friend }, i) => {
      if (skipPeople.has(name)) return;
      const id =
        friend?.id ??
        addFriend({ name, email: '', color: PRESET_COLORS[(friends.length + i) % PRESET_COLORS.length] }).id;
      if (!travelers.includes(id)) travelers.push(id);
    });
    const budget = Number(fields.budget);
    const base = {
      name: fields.name.trim() || (fields.destination ? `${fields.destination.split(',')[0]} trip` : 'New trip'),
      destination: fields.destination.trim(),
      startDate,
      endDate,
      coverImage: DEFAULT_COVER,
      description: '',
      travelers,
      budget: Number.isFinite(budget) && budget > 0 ? budget : 0,
      checklist: checklist.map((t) => ({ id: generateId(), text: t, done: false })),
    };
    let draft: Trip = tripHelpers.syncItineraryToRange({ ...base, id: 'draft', itinerary: [] });
    for (const { item, date } of chosen) draft = tripHelpers.addActivity(draft, date!, item.activity);
    const trip = addTrip({ ...base, itinerary: draft.itinerary });
    props.onDone(trip.id);
  };

  if (!parsed) {
    return (
      <div className="space-y-4">
        <Textarea
          label={existing ? 'Paste bookings or plans' : 'Paste your trip notes'}
          rows={existing ? 10 : 14}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            'Paste anything: booking emails, notes, a chat message…\n\nCX110 SYD → HKG 21 Nov 09:50 - 16:55\nHotel ICON, 21-25 Nov\nDay 2\n- 9am Victoria Peak'
          }
        />
        <p className="text-xs text-gray-400">
          Picks up dates, flight numbers with airports, hotels with check-in/out dates, times, prices, &quot;Day 1&quot;
          headings, traveler names (&quot;with Sarah and Marco&quot;) and packing lists. Your text stays on this device.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={read} disabled={!text.trim()} icon={<Sparkles className="w-4 h-4" aria-hidden="true" />}>
            Read my notes
          </Button>
          {!text && (
            <Button variant="ghost" onClick={() => setText(EXAMPLE)}>
              Try an example
            </Button>
          )}
          {props.mode === 'existing' && (
            <Button variant="ghost" onClick={props.onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  const nothingFound = parsed.items.length === 0 && parsed.checklist.length === 0 && !parsed.startDate;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => setParsed(null)}
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4 mr-1" aria-hidden="true" /> Edit text
      </button>

      {nothingFound && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          I couldn&apos;t find any dates or bookings. Try adding dates like &quot;21 Nov&quot; or &quot;Day 1&quot;
          headings.
        </div>
      )}

      {!existing && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Trip</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Name" value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} placeholder="New trip" />
            <Input
              label="Destination"
              value={fields.destination}
              onChange={(e) => setFields({ ...fields, destination: e.target.value })}
            />
            <Input
              label="Start date"
              type="date"
              value={fields.startDate}
              onChange={(e) => setFields({ ...fields, startDate: e.target.value })}
            />
            <Input
              label="End date"
              type="date"
              value={fields.endDate}
              min={fields.startDate || undefined}
              onChange={(e) => setFields({ ...fields, endDate: e.target.value })}
            />
            <Input
              label="Budget"
              type="number"
              min="0"
              prefix="$"
              value={fields.budget}
              onChange={(e) => setFields({ ...fields, budget: e.target.value })}
            />
          </div>
          {people.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Travelers (plus you)</p>
              <div className="flex flex-wrap gap-2">
                {people.map(({ name, friend }) => {
                  const on = !skipPeople.has(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggle(skipPeople, name, setSkipPeople)}
                      aria-pressed={on}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                        on ? 'border-[#7C9A82] bg-[#E8F0EA] text-[#3F5A45]' : 'border-gray-200 text-gray-400 line-through'
                      }`}
                    >
                      {friend ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />}
                      {friend ? friend.name : name}
                      <span className="text-xs opacity-70">{friend ? 'friend' : 'new'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {placed.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Found {pluralize(parsed.items.length, 'item')}
          </h3>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
            {placed.map(({ item, date }) => {
              const on = !skipItems.has(item.key) && Boolean(date);
              const a = item.activity;
              const d = a.details;
              const detail =
                d?.type === 'flight'
                  ? `${formatTime12(d.departureDateTime.slice(11))} → ${formatTime12(d.arrivalDateTime.slice(11))}${
                      flightArrivalDayOffset(d) ? ` (+${flightArrivalDayOffset(d)})` : ''
                    }`
                  : d?.type === 'hotel'
                    ? `${pluralize(hotelNights(d), 'night')}${d.address ? ` · ${d.address}` : ''}`
                    : [a.time ? formatTime12(a.time) : '', a.location].filter(Boolean).join(' · ');
              return (
                <li key={item.key}>
                  <label className={`flex items-start gap-3 p-3 cursor-pointer ${on ? '' : 'opacity-50'}`}>
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-gray-300 text-[#7C9A82] focus:ring-[#7C9A82]"
                      checked={on}
                      disabled={!date}
                      onChange={() => toggle(skipItems, item.key, setSkipItems)}
                    />
                    <span className="text-lg leading-none mt-0.5" aria-hidden="true">
                      {getCategoryIcon(a.category)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium text-gray-900">{a.title}</span>
                        {a.estimatedCost ? <span className="text-sm text-gray-500">{formatCurrency(a.estimatedCost)}</span> : null}
                      </span>
                      <span className="block text-sm text-gray-500">
                        {date ? formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Needs trip dates'}
                        {item.dayNumber && !item.date ? ` · Day ${item.dayNumber}` : ''}
                        {detail ? ` · ${detail}` : ''}
                      </span>
                      {item.warnings.length > 0 && (
                        <span className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          {item.warnings.join(' · ')}. You can fix this after adding.
                        </span>
                      )}
                      <span className="block text-xs text-gray-400 truncate mt-0.5" title={item.source}>
                        “{item.source.replace(/\s+/g, ' ')}”
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {unplacedItems.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">Set the start date to place items listed by day number.</p>
          )}
        </section>
      )}

      {parsed.checklist.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Checklist</h3>
          <ul className="flex flex-wrap gap-2">
            {parsed.checklist.map((t, i) => {
              const on = !skipChecklist.has(i);
              return (
                <li key={`${t}-${i}`}>
                  <button
                    type="button"
                    onClick={() => toggle(skipChecklist, i, setSkipChecklist)}
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1 text-sm ${
                      on ? 'border-[#7C9A82] bg-[#E8F0EA] text-[#3F5A45]' : 'border-gray-200 text-gray-400 line-through'
                    }`}
                  >
                    {t}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {parsed.unplaced.length > 0 && (
        <details className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
          <summary className="cursor-pointer text-gray-600">
            {pluralize(parsed.unplaced.length, 'line')} I couldn&apos;t place
          </summary>
          <ul className="mt-2 space-y-1 text-gray-500">
            {parsed.unplaced.map((line, i) => (
              <li key={i} className="truncate">
                {line}
              </li>
            ))}
          </ul>
        </details>
      )}

      {existing && outsideRange && chosen.length > 0 && (
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-gray-300 text-[#7C9A82] focus:ring-[#7C9A82]"
            checked={extendRange}
            onChange={(e) => setExtendRange(e.target.checked)}
          />
          <span>
            Some items fall outside this trip. Extend the trip to{' '}
            <strong>
              {formatDate(needStart)} – {formatDate(needEnd)}
            </strong>
          </span>
        </label>
      )}
      {!existing && outsideRange && (
        <p className="text-xs text-gray-500">
          The trip will be stretched to {formatDate(needStart)} – {formatDate(needEnd)} to fit everything.
        </p>
      )}

      {error && <p className="text-sm text-[#C47C7C]">{error}</p>}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
        <Button onClick={create} disabled={existing ? chosen.length === 0 && checklist.length === 0 : false}>
          {existing
            ? `Add ${pluralize(chosen.length + checklist.length, 'item')}`
            : `Create trip${chosen.length ? ` with ${pluralize(chosen.length, 'item')}` : ''}`}
        </Button>
        {props.mode === 'existing' && (
          <Button variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
