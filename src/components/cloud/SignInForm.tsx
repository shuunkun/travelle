'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { useCloud } from '@/components/providers/AppProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type Mode = 'signin' | 'signup' | 'forgot';

/** Email + password sign-in. No emails are sent for sign-up or sign-in. */
export function SignInForm({ redirectPath = '/account' }: { redirectPath?: string }) {
  const cloud = useCloud();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!cloud.configured) {
    return (
      <p className="text-sm text-gray-500">
        Cloud sync isn&apos;t set up on this site yet, so trips are saved in this browser only.
      </p>
    );
  }

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === 'forgot') {
      const result = await cloud.sendPasswordReset(email, redirectPath);
      setBusy(false);
      if (result.error) setError(result.error);
      else setNotice(`If ${email.trim()} has an account, a reset link is on its way. Open it on this device.`);
      return;
    }
    if (!password) {
      setBusy(false);
      return;
    }
    const result = mode === 'signin' ? await cloud.signIn(email, password) : await cloud.signUp(email, password);
    setBusy(false);
    if (result.error) setError(result.error);
    else if ('needsConfirmation' in result && result.needsConfirmation) {
      setNotice(
        'Your account was created, but this site is still set to confirm emails. Ask the site owner to turn off "Confirm email" in Supabase, then sign in.',
      );
    }
  };

  const title = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password';

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      {mode !== 'forgot' && (
        <Input
          label="Password"
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
        />
      )}
      <Button type="submit" disabled={busy || !email.trim() || (mode !== 'forgot' && !password)} className="w-full">
        {busy ? 'One moment…' : mode === 'forgot' ? 'Email me a reset link' : title}
      </Button>

      {notice && (
        <div className="flex items-start gap-2 rounded-lg bg-[#E8F0EA] p-3 text-sm text-[#3F5A45]">
          <Mail className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>{notice}</p>
        </div>
      )}
      {error && <p className="text-sm text-[#C47C7C]">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-gray-500">
        {mode === 'signin' && (
          <>
            <button type="button" className="underline hover:text-gray-700" onClick={() => switchMode('signup')}>
              New here? Create an account
            </button>
            <button type="button" className="underline hover:text-gray-700" onClick={() => switchMode('forgot')}>
              Forgot password?
            </button>
          </>
        )}
        {mode === 'signup' && (
          <button type="button" className="underline hover:text-gray-700" onClick={() => switchMode('signin')}>
            Already have an account? Sign in
          </button>
        )}
        {mode === 'forgot' && (
          <button type="button" className="underline hover:text-gray-700" onClick={() => switchMode('signin')}>
            Back to sign in
          </button>
        )}
      </div>

      {mode === 'forgot' && (
        <p className="text-xs text-gray-400">
          Reset emails don&apos;t always get through. If yours doesn&apos;t arrive, create a new account instead and
          rejoin your trips from their invite links — you can pick yourself from the traveler list, so nothing is lost.
        </p>
      )}
      {mode === 'signup' && <p className="text-xs text-gray-400">No confirmation email; you&apos;re signed in straight away.</p>}
    </form>
  );
}

/** Shown after following a password-reset link. */
export function SetPasswordForm({ onDone }: { onDone?: () => void }) {
  const cloud = useCloud();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6) return;
    setBusy(true);
    setError(null);
    const result = await cloud.updatePassword(password);
    setBusy(false);
    if (result.error) setError(result.error);
    else onDone?.();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 6 characters"
      />
      <Button type="submit" disabled={busy || password.length < 6}>
        {busy ? 'Saving…' : 'Save new password'}
      </Button>
      {error && <p className="text-sm text-[#C47C7C]">{error}</p>}
    </form>
  );
}
