import type { CSSProperties } from 'react';
import { ActivityCategory, ExpenseCategory } from './types';

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, label, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [data-no-card-click]';

/** True when a click/key originated on a nested control, so a parent “click to edit” should stand down. */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  return Boolean(el?.closest(INTERACTIVE_SELECTOR));
}

/** Parent click/keyboard handler that ignores nested buttons, links, and inputs. */
export function unlessInteractive(handler: () => void) {
  return (event: { target: EventTarget | null; currentTarget?: EventTarget | null; key?: string; preventDefault?: () => void }) => {
    if (event.key !== undefined) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target !== event.currentTarget && isInteractiveTarget(event.target)) return;
      event.preventDefault?.();
      handler();
      return;
    }
    if (isInteractiveTarget(event.target)) return;
    handler();
  };
}

// ---------------------------------------------------------------------------
// Dates. All trip/expense dates are stored as YYYY-MM-DD "date keys" and are
// treated as local calendar dates. Never pass them straight to `new Date()`,
// which would parse them as UTC midnight and shift the day for users west of
// Greenwich.
// ---------------------------------------------------------------------------

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(value: string): boolean {
  if (!DATE_KEY_RE.test(value)) return false;
  const d = parseLocalDate(value);
  return !Number.isNaN(d.getTime()) && toDateKey(d) === value;
}

export function parseLocalDate(dateKey: string): Date {
  const match = DATE_KEY_RE.exec(dateKey);
  if (!match) return new Date(dateKey);
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function compareDateKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function addDays(dateKey: string, days: number): string {
  const d = parseLocalDate(dateKey);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** Inclusive number of calendar days between two date keys (0 if reversed). */
export function getDaysBetween(start: string, end: string): number {
  if (!start || !end || compareDateKeys(start, end) > 0) return 0;
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  const startUtc = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endUtc = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.round((endUtc - startUtc) / 86_400_000) + 1;
}

/** Every date key from start to end, inclusive. */
export function eachDayInRange(start: string, end: string): string[] {
  const count = getDaysBetween(start, end);
  const days: string[] = [];
  for (let i = 0; i < count; i += 1) days.push(addDays(start, i));
  return days;
}

export function formatDate(
  dateKey: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
): string {
  if (!dateKey) return '';
  const date = parseLocalDate(dateKey);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString('en-US', options);
}

export function formatWeekday(dateKey: string): string {
  return formatDate(dateKey, { weekday: 'long' });
}

export function formatDateRange(start: string, end: string): string {
  if (!start || !end) return '';
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  if (startDate.getFullYear() === endDate.getFullYear() && startDate.getMonth() === endDate.getMonth()) {
    return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endDate.getDate()}, ${endDate.getFullYear()}`;
  }
  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${formatDate(end)}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export type TripStatus = 'upcoming' | 'ongoing' | 'past';

export function getTripStatus(startDate: string, endDate: string, today: string = todayKey()): TripStatus {
  if (compareDateKeys(today, startDate) < 0) return 'upcoming';
  if (compareDateKeys(today, endDate) > 0) return 'past';
  return 'ongoing';
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency });
    } catch {
      formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    }
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(amount);
}

/** Like formatCurrency but prefixes a "+" for positive values. */
export function formatSignedCurrency(amount: number, currency: string = 'USD'): string {
  const formatted = formatCurrency(Math.abs(amount), currency);
  if (amount > 0) return `+${formatted}`;
  if (amount < 0) return `-${formatted}`;
  return formatted;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((n) => n[0] ?? '')
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

export const PRESET_COLORS = [
  '#7C9A82', // sage green
  '#6BA3A0', // teal
  '#D4C5A9', // beige
  '#C47C7C', // rose
  '#9B82C4', // purple
  '#829BC4', // blue
  '#C48A7C', // coral
  '#828A9A', // slate
];

export function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'food', label: 'Food & Drink' },
  { value: 'transport', label: 'Transport' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'activity', label: 'Activity' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'other', label: 'Other' },
];

export const ACTIVITY_CATEGORIES: { value: ActivityCategory; label: string }[] = [
  { value: 'activity', label: 'Activity' },
  { value: 'food', label: 'Food & Drink' },
  { value: 'transport', label: 'Transport' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'other', label: 'Other' },
];

export function getCategoryLabel(category: string): string {
  return (
    EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ??
    ACTIVITY_CATEGORIES.find((c) => c.value === category)?.label ??
    category
  );
}

export function getCategoryIcon(category: string): string {
  switch (category) {
    case 'food':
      return '🍔';
    case 'transport':
      return '✈️';
    case 'accommodation':
      return '🏨';
    case 'activity':
      return '🎫';
    case 'shopping':
      return '🛍️';
    default:
      return '📝';
  }
}

export function getCategoryColor(category: string): string {
  switch (category) {
    case 'food':
      return 'text-orange-500 bg-orange-50';
    case 'transport':
      return 'text-blue-500 bg-blue-50';
    case 'accommodation':
      return 'text-purple-500 bg-purple-50';
    case 'activity':
      return 'text-green-500 bg-green-50';
    case 'shopping':
      return 'text-pink-500 bg-pink-50';
    default:
      return 'text-gray-500 bg-gray-50';
  }
}

// ---------------------------------------------------------------------------
// Trip covers: either a URL or a CSS gradient string.
// ---------------------------------------------------------------------------

export const DEFAULT_COVER = 'linear-gradient(135deg, #7C9A82 0%, #D4C5A9 100%)';

export const COVER_PRESETS: { name: string; value: string }[] = [
  { name: 'Sage', value: DEFAULT_COVER },
  { name: 'Lavender', value: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)' },
  { name: 'Mist', value: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' },
  { name: 'Sunset', value: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
  { name: 'Ocean', value: 'linear-gradient(135deg, #6BA3A0 0%, #829BC4 100%)' },
  { name: 'Rose', value: 'linear-gradient(135deg, #C47C7C 0%, #F5E0E0 100%)' },
];

export function isImageUrl(value: string): boolean {
  return /^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('/');
}

export function getCoverStyle(coverImage: string | undefined): CSSProperties {
  if (!coverImage) return { backgroundImage: DEFAULT_COVER };
  if (isImageUrl(coverImage)) {
    return { backgroundImage: `url("${coverImage}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  return { backgroundImage: coverImage };
}
