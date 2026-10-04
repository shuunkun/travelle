'use client'

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import { Friend, Trip } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Avatar } from '@/components/ui/Avatar';
import { COVER_PRESETS, DEFAULT_COVER, compareDateKeys, getCoverStyle, isDateKey, isImageUrl, pluralize } from '@/lib/utils';
import { ME_ID } from '@/lib/selectors';

export interface TripFormValues {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  description: string;
  /** Raw text so the user can clear the field; parsed on submit. */
  budget: string;
  travelers: string[];
  coverImage: string;
}

export interface TripSubmitValues extends Omit<TripFormValues, 'budget'> {
  budget: number;
}

export type TripFormErrors = Partial<Record<keyof TripFormValues, string>>;

export function validateTripForm(values: TripFormValues): TripFormErrors {
  const errors: TripFormErrors = {};
  if (!values.name.trim()) errors.name = 'Give your trip a name.';
  if (!values.destination.trim()) errors.destination = 'Where are you going?';
  if (!values.startDate) errors.startDate = 'Pick a start date.';
  else if (!isDateKey(values.startDate)) errors.startDate = 'Invalid date.';
  if (!values.endDate) errors.endDate = 'Pick an end date.';
  else if (!isDateKey(values.endDate)) errors.endDate = 'Invalid date.';
  if (values.startDate && values.endDate && !errors.startDate && !errors.endDate) {
    if (compareDateKeys(values.endDate, values.startDate) < 0) errors.endDate = 'End date must be on or after the start date.';
  }
  const budget = values.budget.trim() === '' ? 0 : Number(values.budget);
  if (!Number.isFinite(budget) || budget < 0) errors.budget = 'Budget must be zero or more.';
  return errors;
}

export function toSubmitValues(values: TripFormValues): TripSubmitValues {
  return {
    ...values,
    name: values.name.trim(),
    destination: values.destination.trim(),
    description: values.description.trim(),
    coverImage: values.coverImage || DEFAULT_COVER,
    budget: values.budget.trim() === '' ? 0 : Number(values.budget),
  };
}

export interface TripFormState {
  values: TripFormValues;
  errors: TripFormErrors;
  update: (patch: Partial<TripFormValues>) => void;
  /** Validates; returns submit-ready values or null if invalid. */
  submit: () => TripSubmitValues | null;
}

/** Owns trip form state so callers (e.g. a live preview) can read it. */
export function useTripForm(initial?: Partial<Trip>, friends: Friend[] = []): TripFormState {
  const [values, setValues] = useState<TripFormValues>(() => ({
    name: initial?.name ?? '',
    destination: initial?.destination ?? '',
    startDate: initial?.startDate ?? '',
    endDate: initial?.endDate ?? '',
    description: initial?.description ?? '',
    budget: initial?.budget ? String(initial.budget) : '',
    travelers: initial?.travelers ?? (friends.some((f) => f.id === ME_ID) ? [ME_ID] : []),
    coverImage: initial?.coverImage || DEFAULT_COVER,
  }));
  const [attempted, setAttempted] = useState(false);

  const update = useCallback((patch: Partial<TripFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  }, []);

  const errors = attempted ? validateTripForm(values) : {};

  const submit = useCallback((): TripSubmitValues | null => {
    setAttempted(true);
    if (Object.keys(validateTripForm(values)).length > 0) return null;
    return toSubmitValues(values);
  }, [values]);

  return { values, errors, update, submit };
}

export interface TripFormProps {
  form: TripFormState;
  friends: Friend[];
  submitLabel?: string;
  onSubmit: (values: TripSubmitValues) => void;
  onCancel?: () => void;
  /** Single-column layout without section cards (for modals). */
  compact?: boolean;
}

const TripForm: React.FC<TripFormProps> = ({ form, friends, submitLabel = 'Save', onSubmit, onCancel, compact = false }) => {
  const { values, errors, update, submit } = form;
  const coverIsUrl = isImageUrl(values.coverImage);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = submit();
    if (result) onSubmit(result);
  };

  const toggleTraveler = (id: string) => {
    update({
      travelers: values.travelers.includes(id) ? values.travelers.filter((t) => t !== id) : [...values.travelers, id],
    });
  };

  const fields = (
    <>
      <Input
        label="Trip name"
        value={values.name}
        onChange={(e) => update({ name: e.target.value })}
        placeholder="e.g. Summer in Tokyo"
        error={errors.name}
        required
        autoFocus={!compact}
      />
      <Input
        label="Destination"
        value={values.destination}
        onChange={(e) => update({ destination: e.target.value })}
        placeholder="e.g. Tokyo, Japan"
        error={errors.destination}
        required
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Start date"
          type="date"
          value={values.startDate}
          onChange={(e) => update({ startDate: e.target.value })}
          error={errors.startDate}
          required
        />
        <Input
          label="End date"
          type="date"
          value={values.endDate}
          min={values.startDate || undefined}
          onChange={(e) => update({ endDate: e.target.value })}
          error={errors.endDate}
          required
        />
      </div>
      <Input
        label="Budget (optional)"
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        prefix="$"
        value={values.budget}
        onChange={(e) => update({ budget: e.target.value })}
        placeholder="0.00"
        error={errors.budget}
        hint="Shared budget for the whole group."
      />
      <Textarea
        label="Description"
        rows={3}
        value={values.description}
        onChange={(e) => update({ description: e.target.value })}
        placeholder="What's the vibe of this trip?"
      />
    </>
  );

  const cover = (
    <div>
      <span className="block text-sm font-medium text-gray-700 mb-2">Cover</span>
      <div className="flex flex-wrap gap-2 mb-3" role="radiogroup" aria-label="Cover style">
        {COVER_PRESETS.map((preset) => {
          const selected = !coverIsUrl && values.coverImage === preset.value;
          return (
            <button
              key={preset.name}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={preset.name}
              title={preset.name}
              onClick={() => update({ coverImage: preset.value })}
              className={`w-10 h-10 rounded-lg transition-all ${
                selected ? 'ring-2 ring-offset-2 ring-[#7C9A82] scale-105' : 'hover:scale-105'
              }`}
              style={getCoverStyle(preset.value)}
            />
          );
        })}
      </div>
      <Input
        label="Or paste an image URL"
        value={coverIsUrl ? values.coverImage : ''}
        onChange={(e) => update({ coverImage: e.target.value.trim() || DEFAULT_COVER })}
        placeholder="https://…"
      />
    </div>
  );

  const travelerPicker = (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="block text-sm font-medium text-gray-700">Travelers</span>
        <span className="text-xs text-gray-400">{pluralize(values.travelers.length, 'person', 'people')} selected</span>
      </div>
      {friends.length === 0 ? (
        <p className="text-sm text-gray-500">
          No friends yet.{' '}
          <Link href="/friends" className="text-[#7C9A82] hover:underline">
            Add friends
          </Link>{' '}
          to invite them on trips.
        </p>
      ) : (
        <div className={`space-y-1 ${compact ? 'max-h-48 overflow-y-auto pr-1' : ''}`}>
          {friends.map((friend) => (
            <label
              key={friend.id}
              className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer border border-transparent hover:border-gray-100 transition-colors"
            >
              <input
                type="checkbox"
                checked={values.travelers.includes(friend.id)}
                onChange={() => toggleTraveler(friend.id)}
                className="rounded border-gray-300 accent-[#7C9A82] h-4 w-4"
              />
              <Avatar name={friend.name} color={friend.color} size="sm" />
              <span className="text-sm font-medium text-gray-700">
                {friend.name}
                {friend.id === ME_ID && <span className="ml-1 text-xs text-gray-400">(you)</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );

  const buttons = (
    <div className="flex justify-end gap-3 pt-2">
      {onCancel && (
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      )}
      <Button type="submit">{submitLabel}</Button>
    </div>
  );

  if (compact) {
    return (
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {fields}
        {cover}
        {travelerPicker}
        {buttons}
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-xl font-medium mb-4 text-gray-800">Trip details</h2>
        <div className="space-y-4">{fields}</div>
      </section>
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-xl font-medium mb-4 text-gray-800">Look & feel</h2>
        {cover}
      </section>
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-xl font-medium mb-1 text-gray-800">Who&apos;s coming?</h2>
        <p className="text-sm text-gray-500 mb-4">Travelers can be added to expenses and the itinerary.</p>
        {travelerPicker}
      </section>
      {buttons}
    </form>
  );
};

export default TripForm;
export { TripForm };
