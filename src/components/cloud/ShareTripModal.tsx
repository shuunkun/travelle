'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Link2 } from 'lucide-react';
import { useCloud } from '@/components/providers/AppProvider';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Friend, Trip } from '@/lib/types';
import { ME_ID } from '@/lib/selectors';

export function ShareTripModal({
  trip,
  members,
  isOpen,
  onClose,
}: {
  trip: Trip;
  members: Friend[];
  isOpen: boolean;
  onClose: () => void;
}) {
  const cloud = useCloud();
  const [invite, setInvite] = useState<{ tripId: string; link?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const access = cloud.tripAccess(trip.id);
  const signedIn = Boolean(cloud.user);
  const ready = Boolean(access);
  const { createInvite } = cloud;

  useEffect(() => {
    if (!isOpen || !signedIn || !ready) return;
    let cancelled = false;
    void createInvite(trip.id).then((result) => {
      if (cancelled) return;
      setInvite({
        tripId: trip.id,
        link: result.code ? `${window.location.origin}/join?code=${encodeURIComponent(result.code)}` : undefined,
        error: result.error,
      });
    });
    return () => {
      cancelled = true;
    };
    // createInvite's identity changes with sync status; one invite per open is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, signedIn, ready, trip.id]);

  const current = invite?.tripId === trip.id ? invite : null;
  const linked = new Set(access?.linkedPersonIds ?? []);

  const copy = async () => {
    if (!current?.link) return;
    try {
      await navigator.clipboard.writeText(current.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share trip" description="Plan together and split costs in real time.">
      {!signedIn ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This trip is only saved in this browser. Sign in to sync it to your account, then invite friends with a link.
          </p>
          <Link href="/account" onClick={onClose}>
            <Button>Sign in to share</Button>
          </Link>
        </div>
      ) : !ready ? (
        <p className="text-sm text-gray-500">Saving this trip to your account…</p>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Invite link</p>
            {current?.error ? (
              <p className="text-sm text-[#C47C7C]">{current.error}</p>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1 min-w-0 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  <Link2 className="w-4 h-4 shrink-0 text-gray-400" aria-hidden="true" />
                  <span className="truncate">{current?.link ?? 'Creating link…'}</span>
                </div>
                <Button onClick={() => void copy()} disabled={!current?.link}>
                  {copied ? <Check className="w-4 h-4 mr-1.5" aria-hidden="true" /> : <Copy className="w-4 h-4 mr-1.5" aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-2">
              Friends open the link, sign in with their email, and pick which traveler they are.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Travelers</p>
            <ul className="space-y-2">
              {members.map((m) => {
                const joined = m.id === ME_ID || linked.has(m.id);
                return (
                  <li key={m.id} className="flex items-center gap-3">
                    <Avatar name={m.name} color={m.color} size="sm" />
                    <span className="flex-1 text-sm text-gray-900">{m.id === ME_ID ? `${m.name} (you)` : m.name}</span>
                    <span className={`text-xs ${joined ? 'text-[#5A7A60]' : 'text-gray-400'}`}>
                      {joined ? 'Joined' : 'Not joined yet'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
