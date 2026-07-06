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

// ISTANZIAZIONE LAZY (fix build): createBrowserClient a livello di modulo
// lancia un'eccezione se le env var NEXT_PUBLIC_* non sono configurate, e i
// moduli vengono valutati anche durante il prerender di `next build`. Con il
// Proxy il client viene creato solo al primo utilizzo reale (mai durante la
// valutazione del modulo in build), mantenendo invariata l'API `supabase.*`
// per tutti i componenti che la importano.
let _client = null;

function getClient() {
  if (!_client) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.warn(
        "[BulkStrike] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      );
    }
    _client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _client;
}

export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getClient();
      const value = client[prop];
      return typeof value === "function" ? value.bind(client) : value;
    },
    has(_target, prop) {
      return prop in getClient();
    },
  },
);
