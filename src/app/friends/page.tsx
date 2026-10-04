'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Users, Plus, Pencil, Trash2, Lock } from 'lucide-react';
import { Friend } from '@/lib/types';
import { useApp } from '@/components/providers/AppProvider';
import { formatCurrency, PRESET_COLORS, pluralize } from '@/lib/utils';
import { getBalanceWithFriend, getFriendUsage, ME_ID } from '@/lib/selectors';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageSkeleton } from '@/components/ui/Skeleton';

interface FormData {
  name: string;
  email: string;
  color: string;
}

export default function FriendsPage() {
  const app = useApp();
  const { hydrated, friends, trips, expenses, settlements, addFriend, updateFriend, deleteFriend } = app;

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFriend, setEditingFriend] = useState<Friend | null>(null);
  const [friendToDelete, setFriendToDelete] = useState<Friend | null>(null);
  const [formData, setFormData] = useState<FormData>({ name: '', email: '', color: PRESET_COLORS[0] });
  const [formError, setFormError] = useState<string | undefined>();
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const data = useMemo(() => ({ trips, expenses, friends, settlements }), [trips, expenses, friends, settlements]);

  const meFriend = friends.find((f) => f.id === ME_ID);
  const regularFriends = friends.filter((f) => f.id !== ME_ID);

  const details = useMemo(() => {
    const map = new Map<string, { trips: number; expenses: number; balance: number; referenced: boolean }>();
    friends.forEach((f) => {
      const usage = getFriendUsage(data, f.id);
      map.set(f.id, {
        trips: usage.trips.length,
        expenses: usage.expenses.length,
        balance: f.id === ME_ID ? 0 : getBalanceWithFriend(data, f.id),
        referenced: usage.isReferenced,
      });
    });
    return map;
  }, [friends, data]);

  if (!hydrated) return <PageSkeleton />;

  const openAdd = () => {
    setEditingFriend(null);
    setFormData({ name: '', email: '', color: PRESET_COLORS[friends.length % PRESET_COLORS.length] });
    setFormError(undefined);
    setIsFormOpen(true);
  };

  const openEdit = (friend: Friend) => {
    setEditingFriend(friend);
    setFormData({ name: friend.name, email: friend.email || '', color: friend.color });
    setFormError(undefined);
    setIsFormOpen(true);
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    const name = formData.name.trim();
    const email = formData.email.trim();
    if (!name) return setFormError('Enter a name.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setFormError('That email address looks wrong.');
    const duplicate = friends.find((f) => f.id !== editingFriend?.id && f.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return setFormError(`You already have a friend named ${duplicate.name}.`);

    if (editingFriend) updateFriend(editingFriend.id, { name, email, color: formData.color });
    else addFriend({ name, email, color: formData.color });
    setIsFormOpen(false);
  };

  const handleDeleteConfirm = () => {
    if (!friendToDelete) return;
    const result = deleteFriend(friendToDelete.id);
    if (!result.ok) {
      setDeleteError(result.reason);
      return;
    }
    setFriendToDelete(null);
    setDeleteError(undefined);
  };

  const renderBalance = (balance: number) => {
    if (Math.abs(balance) < 0.005) return <span className="text-gray-400 text-sm">Settled up</span>;
    if (balance > 0) return <span className="text-[#7C9A82] text-sm font-medium">Owes you {formatCurrency(balance)}</span>;
    return <span className="text-[#C47C7C] text-sm font-medium">You owe {formatCurrency(Math.abs(balance))}</span>;
  };

  const renderStats = (friendId: string) => {
    const d = details.get(friendId);
    return (
      <div className="flex gap-5">
        <div className="flex flex-col">
          <span className="text-xs text-gray-400 uppercase tracking-wider">Trips</span>
          <span className="text-gray-700 font-medium">{d?.trips ?? 0}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-gray-400 uppercase tracking-wider">Expenses</span>
          <span className="text-gray-700 font-medium">{d?.expenses ?? 0}</span>
        </div>
      </div>
    );
  };

  const pendingUsage = friendToDelete ? getFriendUsage(data, friendToDelete.id) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-light text-gray-900">Friends</h1>
          <p className="text-gray-500 mt-1">Manage your travel buddies and see where you stand with each of them.</p>
        </div>
        <Button onClick={openAdd} icon={<Plus size={18} aria-hidden="true" />}>
          Add friend
        </Button>
      </div>

      {regularFriends.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" aria-hidden="true" />}
          title="No friends yet"
          description="Add your first travel buddy to start planning trips and splitting expenses together."
          action={<Button onClick={openAdd}>Add your first travel buddy</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* "You" card */}
          {meFriend && (
            <Card className="p-6 flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 flex items-center gap-1">
                <Badge className="font-normal">You</Badge>
                <Button variant="ghost" size="sm" onClick={() => openEdit(meFriend)} className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700" aria-label="Edit your profile">
                  <Pencil size={16} aria-hidden="true" />
                </Button>
              </div>
              <div className="flex items-center gap-4 mb-6 pr-20">
                <Avatar name={meFriend.name} color={meFriend.color} size="lg" />
                <div className="min-w-0">
                  <h3 className="text-lg font-medium text-gray-900 truncate">{meFriend.name}</h3>
                  {meFriend.email && <p className="text-sm text-gray-500 truncate">{meFriend.email}</p>}
                </div>
              </div>
              <div className="flex justify-between items-end border-t border-gray-50 pt-4 mt-auto">{renderStats(ME_ID)}</div>
            </Card>
          )}

          {regularFriends.map((friend) => {
            const d = details.get(friend.id);
            return (
              <Card key={friend.id} className="p-6 flex flex-col justify-between group">
                <div className="flex justify-between items-start mb-6 gap-2">
                  <div className="flex items-center gap-4 min-w-0">
                    <Avatar name={friend.name} color={friend.color} size="lg" />
                    <div className="min-w-0">
                      <h3 className="text-lg font-medium text-gray-900 truncate">{friend.name}</h3>
                      {friend.email && <p className="text-sm text-gray-500 truncate">{friend.email}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 opacity-70 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(friend)} className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700" aria-label={`Edit ${friend.name}`}>
                      <Pencil size={16} aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDeleteError(undefined);
                        setFriendToDelete(friend);
                      }}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                      aria-label={`Remove ${friend.name}`}
                      title={d?.referenced ? 'Part of trips or expenses' : undefined}
                    >
                      {d?.referenced ? <Lock size={15} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
                    </Button>
                  </div>
                </div>

                <div className="flex justify-between items-end border-t border-gray-50 pt-4 mt-auto gap-3">
                  {renderStats(friend.id)}
                  <div className="text-right">{renderBalance(d?.balance ?? 0)}</div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / edit modal */}
      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={editingFriend ? (editingFriend.id === ME_ID ? 'Edit your profile' : 'Edit friend') : 'Add friend'} size="sm">
        <form onSubmit={handleSave} noValidate className="space-y-6">
          <div className="space-y-4">
            <Input
              label="Name"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (formError) setFormError(undefined);
              }}
              placeholder="e.g. Jane Doe"
              autoFocus
              required
              error={formError}
            />
            <Input
              label="Email (optional)"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="jane@example.com"
            />
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-2">Avatar colour</span>
              <div className="flex gap-3 flex-wrap" role="radiogroup" aria-label="Avatar colour">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={formData.color === color}
                    aria-label={color}
                    onClick={() => setFormData({ ...formData, color })}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      formData.color === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  >
                    {formData.color === color && <div className="w-3 h-3 bg-white rounded-full opacity-75" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formData.name.trim()}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={friendToDelete !== null}
        onClose={() => {
          setFriendToDelete(null);
          setDeleteError(undefined);
        }}
        onConfirm={handleDeleteConfirm}
        title="Remove friend"
        confirmLabel="Remove"
        confirmDisabled={Boolean(pendingUsage?.isReferenced)}
        message={
          friendToDelete && pendingUsage ? (
            pendingUsage.isReferenced ? (
              <div className="space-y-2">
                <p>
                  <strong>{friendToDelete.name}</strong> is still part of{' '}
                  {[
                    pendingUsage.trips.length > 0 && pluralize(pendingUsage.trips.length, 'trip'),
                    pendingUsage.expenses.length > 0 && pluralize(pendingUsage.expenses.length, 'expense'),
                    pendingUsage.settlements.length > 0 && pluralize(pendingUsage.settlements.length, 'payment'),
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  .
                </p>
                <p>Removing them would break those records, so this is blocked. Remove them from the trips first:</p>
                <ul className="list-disc pl-5 text-gray-500">
                  {pendingUsage.trips.slice(0, 5).map((t) => (
                    <li key={t.id}>
                      <Link href={`/trips/${t.id}`} className="text-[#7C9A82] hover:underline">
                        {t.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                {deleteError && <p className="text-[#C47C7C]">{deleteError}</p>}
              </div>
            ) : (
              <p>
                Remove <strong>{friendToDelete.name}</strong> from your friends? They aren&apos;t part of any trips or expenses, so nothing else
                will change.
              </p>
            )
          ) : null
        }
      />
    </div>
  );
}
