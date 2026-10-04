'use client'

import React, { useState } from 'react';
import { Activity, ActivityCategory, Trip } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ACTIVITY_CATEGORIES, formatDate, formatWeekday } from '@/lib/utils';

export interface ActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip;
  /** Day the activity belongs to (or will be added to). */
  date: string;
  /** When provided, edits this activity. */
  activity?: Activity;
  onSave: (date: string, input: Omit<Activity, 'id'>) => void;
}

const ActivityModal: React.FC<ActivityModalProps> = (props) => {
  const { isOpen, onClose, activity, date } = props;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={activity ? 'Edit activity' : 'Add activity'}
      description={date ? `${formatWeekday(date)}, ${formatDate(date)}` : undefined}
    >
      <ActivityForm key={`${activity?.id ?? 'new'}-${date}`} {...props} />
    </Modal>
  );
};

const ActivityForm: React.FC<ActivityModalProps> = ({ onClose, trip, date, activity, onSave }) => {
  const [title, setTitle] = useState(activity?.title ?? '');
  const [time, setTime] = useState(activity?.time ?? '');
  const [location, setLocation] = useState(activity?.location ?? '');
  const [notes, setNotes] = useState(activity?.notes ?? '');
  const [category, setCategory] = useState<ActivityCategory>(activity?.category ?? 'activity');
  const [targetDate, setTargetDate] = useState(date);
  const [error, setError] = useState<string | undefined>();

  const dayOptions = trip.itinerary.map((d) => ({ value: d.date, label: `${formatWeekday(d.date)}, ${formatDate(d.date)}` }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('Give the activity a title.');
      return;
    }
    onSave(targetDate, { title: title.trim(), time, location: location.trim(), notes: notes.trim(), category });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Input
        label="Title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (error) setError(undefined);
        }}
        placeholder="e.g. Louvre Museum"
        error={error}
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
      <Textarea label="Notes (optional)" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tickets, reservations, reminders…" />
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{activity ? 'Save changes' : 'Add activity'}</Button>
      </div>
    </form>
  );
};

export default ActivityModal;
export { ActivityModal };
