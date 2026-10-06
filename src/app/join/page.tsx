'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users, MapPin, Calendar } from 'lucide-react';
import { InvitePreview, useApp, useCloud } from '@/components/providers/AppProvider';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { SignInForm } from '@/components/cloud/SignInForm';
import { ME_ID } from '@/lib/selectors';
import { PRESET_COLORS, formatDateRange } from '@/lib/utils';

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinTrip />
    </Suspense>
  );
}

const NEW_PERSON = '__new__';

function JoinTrip() {
  const code = useSearchParams().get('code') ?? '';
  const router = useRouter();
  const cloud = useCloud();
  const { trips, friends } = useApp();
  const me = friends.find((f) => f.id === ME_ID);

  const [preview, setPreview] = useState<{ code: string; data?: InvitePreview; error?: string } | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinedTripId, setJoinedTripId] = useState<string | null>(null);

  const userId = cloud.user?.id;
  const { previewInvite } = cloud;
  useEffect(() => {
    if (!userId || !code) return;
    let cancelled = false;
    void previewInvite(code).then((result) => {
      if (!cancelled) setPreview({ code, data: result.preview, error: result.error });
    });
    return () => {
      cancelled = true;
    };
    // previewInvite's identity changes with sync status; the code and user are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, code]);

  // Wait until the joined trip has synced down before opening it.
  useEffect(() => {
    if (joinedTripId && trips.some((t) => t.id === joinedTripId)) router.replace(`/trips/${joinedTripId}`);
  }, [joinedTripId, trips, router]);

  if (!code) {
    return (
      <Shell>
        <p className="text-gray-600">This invite link is missing its code. Ask for the link again.</p>
      </Shell>
    );
  }

  if (!cloud.authReady) {
    return (
      <Shell>
        <p className="text-sm text-gray-500">Checking sign-in…</p>
      </Shell>
    );
  }

  if (!cloud.user) {
    return (
      <Shell>
        <p className="text-gray-600 mb-4">You&apos;ve been invited to plan a trip together. Sign in to join.</p>
        <SignInForm redirectPath={`/join?code=${encodeURIComponent(code)}`} />
      </Shell>
    );
  }

  const current = preview?.code === code ? preview : null;
  if (!current) {
    return (
      <Shell>
        <p className="text-sm text-gray-500">Loading invite…</p>
      </Shell>
    );
  }
  if (current.error || !current.data) {
    return (
      <Shell>
        <p className="text-[#C47C7C]">{current.error ?? 'This invite link is invalid.'}</p>
      </Shell>
    );
  }

  const invite = current.data;
  if (invite.alreadyMember) {
    return (
      <Shell>
        <TripSummary invite={invite} />
        <p className="text-gray-600 mt-4">You&apos;re already on this trip.</p>
        <Link href={`/trips/${invite.tripId}`}>
          <Button className="mt-4">Open trip</Button>
        </Link>
      </Shell>
    );
  }

  const claimed = new Set(invite.claimedPersonIds);
  const open = invite.people.filter((p) => !claimed.has(p.id));
  const selected = choice ?? (open.length ? null : NEW_PERSON);
  const newName = name || me?.name || '';

  const join = async () => {
    if (!selected) return;
    setBusy(true);
    setJoinError(null);
    const result =
      selected === NEW_PERSON
        ? await cloud.joinTrip(code, null, {
            name: newName.trim() || 'Traveler',
            email: cloud.user?.email ?? '',
            color: me?.color ?? PRESET_COLORS[1],
          })
        : await cloud.joinTrip(code, selected);
    if (result.error || !result.tripId) {
      setBusy(false);
      setJoinError(result.error ?? 'Could not join this trip.');
      return;
    }
    setJoinedTripId(result.tripId);
  };

  return (
    <Shell>
      <TripSummary invite={invite} />
      <fieldset className="mt-6 space-y-2">
        <legend className="text-sm font-medium text-gray-700 mb-2">Which traveler are you?</legend>
        {open.map((person) => (
          <label
            key={person.id}
            className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer ${
              selected === person.id ? 'border-[#7C9A82] bg-[#F7FAF8]' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <input
              type="radio"
              name="person"
              className="text-[#7C9A82] focus:ring-[#7C9A82]"
              checked={selected === person.id}
              onChange={() => setChoice(person.id)}
            />
            <Avatar name={person.name} color={person.color} size="sm" />
            <span className="text-sm font-medium text-gray-900">{person.name}</span>
          </label>
        ))}
        <label
          className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer ${
            selected === NEW_PERSON ? 'border-[#7C9A82] bg-[#F7FAF8]' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <input
            type="radio"
            name="person"
            className="text-[#7C9A82] focus:ring-[#7C9A82]"
            checked={selected === NEW_PERSON}
            onChange={() => setChoice(NEW_PERSON)}
          />
          <span className="text-sm text-gray-700">{open.length ? "I'm not on the list" : 'Join as a new traveler'}</span>
        </label>
        {selected === NEW_PERSON && (
          <Input label="Your name on this trip" value={newName} onChange={(e) => setName(e.target.value)} />
        )}
      </fieldset>
      {joinError && <p className="text-sm text-[#C47C7C] mt-3">{joinError}</p>}
      <Button className="mt-6 w-full" disabled={!selected || busy} onClick={() => void join()}>
        {busy ? 'Joining…' : 'Join trip'}
      </Button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-2 text-[#5A7A60] mb-4">
        <Users className="w-5 h-5" aria-hidden="true" />
        <span className="text-sm font-medium uppercase tracking-wide">Trip invite</span>
      </div>
      <Card>{children}</Card>
    </div>
  );
}

function TripSummary({ invite }: { invite: InvitePreview }) {
  return (
    <div>
      <h1 className="text-2xl font-light text-gray-900">{invite.name}</h1>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
        {invite.destination && (
          <span className="flex items-center">
            <MapPin className="w-4 h-4 mr-1.5" aria-hidden="true" />
            {invite.destination}
          </span>
        )}
        {invite.startDate && invite.endDate && (
          <span className="flex items-center">
            <Calendar className="w-4 h-4 mr-1.5" aria-hidden="true" />
            {formatDateRange(invite.startDate, invite.endDate)}
          </span>
        )}
      </div>
    </div>
  );
}
