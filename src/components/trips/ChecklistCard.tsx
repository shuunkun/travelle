'use client'

import React, { useEffect, useRef, useState } from 'react';
import { Plus, X, ListChecks } from 'lucide-react';
import { Trip } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useApp } from '@/components/providers/AppProvider';

export interface ChecklistCardProps {
  trip: Trip;
}

/** Packing / to-do list for a trip. Click an item to rename it. */
const ChecklistCard: React.FC<ChecklistCardProps> = ({ trip }) => {
  const { addChecklistItem, toggleChecklistItem, renameChecklistItem, deleteChecklistItem, clearCompletedChecklist } = useApp();
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  const items = trip.checklist ?? [];
  const done = items.filter((i) => i.done).length;
  const pct = items.length === 0 ? 0 : (done / items.length) * 100;

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    addChecklistItem(trip.id, text);
    setText('');
  };

  const startEdit = (id: string, current: string) => {
    setEditingId(id);
    setDraft(current);
  };

  const commitEdit = () => {
    if (!editingId) return;
    if (draft.trim()) renameChecklistItem(trip.id, editingId, draft);
    setEditingId(null);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-[#7C9A82]" aria-hidden="true" /> Checklist
        </h3>
        <span className="text-xs text-gray-400">
          {done}/{items.length} done
        </span>
      </div>
      {items.length > 0 && <ProgressBar value={pct} label="Checklist progress" className="mb-4" />}

      {items.length === 0 ? (
        <p className="text-sm text-gray-500 mb-4 mt-2">Packing list, bookings to confirm, things to remember…</p>
      ) : (
        <ul className="space-y-1 mb-4 max-h-64 overflow-y-auto pr-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 group rounded-md hover:bg-gray-50 px-1 py-1">
              <input
                type="checkbox"
                id={`check-${item.id}`}
                checked={item.done}
                onChange={() => toggleChecklistItem(trip.id, item.id)}
                className="rounded border-gray-300 accent-[#7C9A82] h-4 w-4"
              />
              {editingId === item.id ? (
                <input
                  ref={editRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitEdit();
                    }
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  aria-label={`Rename ${item.text}`}
                  className="flex-1 min-w-0 rounded border border-[#7C9A82] px-1.5 py-0.5 text-sm outline-none ring-1 ring-[#7C9A82]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(item.id, item.text)}
                  title="Click to rename"
                  className={`flex-1 text-left text-sm break-words rounded px-0.5 ${item.done ? 'line-through text-gray-400' : 'text-gray-800'} hover:text-gray-900`}
                >
                  {item.text}
                </button>
              )}
              <button
                type="button"
                onClick={() => deleteChecklistItem(trip.id, item.id)}
                className="text-gray-300 hover:text-red-500 opacity-60 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity rounded"
                aria-label={`Remove ${item.text}`}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add an item…"
          aria-label="New checklist item"
          className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#7C9A82] focus:ring-1 focus:ring-[#7C9A82]"
        />
        <Button type="submit" size="sm" disabled={!text.trim()} aria-label="Add item">
          <Plus className="w-4 h-4" aria-hidden="true" />
        </Button>
      </form>
      {done > 0 && (
        <button type="button" onClick={() => clearCompletedChecklist(trip.id)} className="mt-3 text-xs text-gray-400 hover:text-gray-600">
          Clear {done} completed
        </button>
      )}
    </Card>
  );
};

export default ChecklistCard;
export { ChecklistCard };
