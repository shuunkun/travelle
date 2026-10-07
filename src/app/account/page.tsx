'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Cloud, CloudOff, KeyRound, LogOut, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useApp, useCloud } from '@/components/providers/AppProvider';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { SetPasswordForm, SignInForm } from '@/components/cloud/SignInForm';
import { ImportDeviceTrips } from '@/components/cloud/ImportDeviceTrips';
import { ME_ID } from '@/lib/selectors';
import { pluralize } from '@/lib/utils';

const STATUS_COPY = {
  local: { icon: CloudOff, text: 'Saved in this browser only', tone: 'text-gray-500' },
  loading: { icon: RefreshCw, text: 'Loading your trips…', tone: 'text-gray-500' },
  saving: { icon: RefreshCw, text: 'Saving…', tone: 'text-gray-500' },
  synced: { icon: CheckCircle2, text: 'All changes synced', tone: 'text-[#5A7A60]' },
  error: { icon: AlertTriangle, text: 'Sync problem, retrying', tone: 'text-[#C47C7C]' },
} as const;

/** Set or change the password used to sign in on other devices. */
function PasswordCard() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-gray-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#7C9A82]" aria-hidden="true" /> Password
          </h2>
          <p className="text-sm text-gray-500">
            {saved ? 'Password saved. Use it with your email to sign in elsewhere.' : 'The password you use to sign in on other devices.'}
          </p>
        </div>
        {!open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {saved ? 'Change' : 'Set password'}
          </Button>
        )}
      </div>
      {open && (
        <SetPasswordForm
          onDone={() => {
            setOpen(false);
            setSaved(true);
          }}
        />
      )}
    </Card>
  );
}

export default function AccountPage() {
  const cloud = useCloud();
  const { friends, trips, hydrated } = useApp();
  const me = friends.find((f) => f.id === ME_ID);
  const status = STATUS_COPY[cloud.status];
  const StatusIcon = status.icon;

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-light text-gray-900">Account &amp; sync</h1>
        <p className="text-gray-500 mt-1">Sign in to see your trips on every device and plan them with friends.</p>
      </div>

      {!cloud.authReady ? (
        <Card>
          <p className="text-sm text-gray-500">Checking sign-in…</p>
        </Card>
      ) : cloud.user ? (
        <>
          {cloud.passwordRecovery && (
            <Card className="space-y-3 border-[#7C9A82]">
              <div>
                <h2 className="font-medium text-gray-900">Choose a new password</h2>
                <p className="text-sm text-gray-500">You followed a reset link, so you&apos;re signed in. Set a password to use next time.</p>
              </div>
              <SetPasswordForm />
            </Card>
          )}
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              {me && <Avatar name={me.name} color={me.color} />}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 truncate">{me?.name ?? 'You'}</p>
                <p className="text-sm text-gray-500 truncate">{cloud.user.email}</p>
              </div>
              <Cloud className="w-5 h-5 text-[#7C9A82]" aria-hidden="true" />
            </div>
            <div className={`flex items-center gap-2 text-sm ${status.tone}`} role="status">
              <StatusIcon className={`w-4 h-4 ${cloud.status === 'saving' || cloud.status === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
              {status.text}
              {hydrated && cloud.status === 'synced' && (
                <span className="text-gray-400">· {pluralize(trips.length, 'trip')} in your account</span>
              )}
            </div>
            {cloud.error && <p className="text-xs text-[#C47C7C] break-words">{cloud.error}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/friends">
                <Button variant="outline" size="sm">
                  Edit my profile
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={() => void cloud.signOut()}>
                <LogOut className="w-4 h-4 mr-1.5" aria-hidden="true" /> Sign out
              </Button>
            </div>
          </Card>
          {!cloud.passwordRecovery && <PasswordCard />}
          <ImportDeviceTrips />
          <p className="text-sm text-gray-500">
            To plan with friends, open a trip and use <strong>Share</strong>. Anyone with the link can sign in and join.
          </p>
        </>
      ) : (
        <Card className="space-y-4">
          <div className={`flex items-center gap-2 text-sm ${status.tone}`}>
            <StatusIcon className="w-4 h-4" aria-hidden="true" />
            {status.text}
          </div>
          <SignInForm />
          {cloud.configured && (
            <p className="text-xs text-gray-400">
              Trips you&apos;ve already made in this browser stay here, and you can upload them after signing in.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
