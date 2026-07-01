// lib/supabase.js
// Browser client (singleton) usato da api.js e dai componenti BulkStrike.
//
// IMPORTANTE: usa createBrowserClient di @supabase/ssr (sessione nei COOKIE),
// così condivide la sessione con il form di login dello starter e con il
// middleware. Usando createClient di @supabase/supabase-js la sessione finirebbe
// in localStorage e getSession() non vedrebbe mai un utente loggato (l'avatar
// non comparirebbe e "accedi" sembrerebbe non funzionare).
import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn(
    "[BulkStrike] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
}

export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
