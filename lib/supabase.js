// lib/supabase.js
// Supabase browser client (singleton). Next.js / Vite compatible.
import { createClient } from "@supabase/supabase-js";

// Next.js (Vercel): set these in .env.local and in the Vercel dashboard.
//   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...  (fallback: NEXT_PUBLIC_SUPABASE_ANON_KEY)
// Vite alternative: read import.meta.env.VITE_SUPABASE_URL / _ANON_KEY instead.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Fail loud in dev so a missing env var is obvious.
  console.warn("[BulkStrike] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
