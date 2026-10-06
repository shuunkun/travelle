'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { useCloud } from '@/components/providers/AppProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/** Passwordless email sign-in: a magic link, or the 6-digit code from the same email. */
export function SignInForm({ redirectPath = '/account' }: { redirectPath?: string }) {
  const cloud = useCloud();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!cloud.configured) {
    return (
      <p className="text-sm text-gray-500">
        Cloud sync isn&apos;t set up on this site yet, so trips are saved in this browser only.
      </p>
    );
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    const result = await cloud.sendMagicLink(email, redirectPath);
    setBusy(false);
    if (result.error) setError(result.error);
    else setSentTo(email.trim());
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sentTo || !code.trim()) return;
    setBusy(true);
    setError(null);
    const result = await cloud.verifyCode(sentTo, code);
    setBusy(false);
    if (result.error) setError(result.error);
  };

  if (sentTo) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-[#E8F0EA] p-4 text-sm text-[#3F5A45]">
          <Mail className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Check <strong>{sentTo}</strong> for a sign-in link. Open it on this device, or type the code from the
            email below.
          </p>
        </div>
        <form onSubmit={verify} className="flex gap-2 items-end">
          <Input
            label="Code from the email"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
          <Button type="submit" disabled={busy || !code.trim()}>
            Verify
          </Button>
        </form>
        {error && <p className="text-sm text-[#C47C7C]">{error}</p>}
        <button
          type="button"
          className="text-sm text-gray-500 underline hover:text-gray-700"
          onClick={() => {
            setSentTo(null);
            setCode('');
            setError(null);
          }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <Button type="submit" disabled={busy || !email.trim()} className="w-full">
        {busy ? 'Sending…' : 'Email me a sign-in link'}
      </Button>
      {error && <p className="text-sm text-[#C47C7C]">{error}</p>}
      <p className="text-xs text-gray-400">No password needed. New here? This creates your account.</p>
    </form>
  );
}
