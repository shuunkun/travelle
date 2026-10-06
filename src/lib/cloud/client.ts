import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when this build was given Supabase credentials. Without them the app is local-only. */
export const isCloudConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/** Browser-only Supabase client (sessions live in localStorage). */
export function getSupabase(): SupabaseClient | null {
  if (!isCloudConfigured || typeof window === 'undefined') return null;
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
