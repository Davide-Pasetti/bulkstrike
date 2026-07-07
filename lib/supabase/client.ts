// lib/supabase/client.ts
// Shim di compatibilità (UNICO punto di ingresso per il client browser):
// i componenti importano createClient da qui seguendo la convenzione dello
// starter Supabase, ma il progetto usa un client singleton LAZY definito in
// lib/supabase.js (createBrowserClient di @supabase/ssr, sessione nei cookie,
// condivisa con login e middleware). Restituire quel singleton evita di
// creare un secondo client e — essendo lazy — non fa fallire il prerender di
// `next build` quando le env var NEXT_PUBLIC_* non sono disponibili.
//
// NB: esisteva anche un client.js accanto a questo file: la risoluzione dei
// moduli preferisce .ts, quindi il .js non veniva mai usato ed è stato
// rimosso per eliminare l'ambiguità.
import { createBrowserClient } from "@supabase/ssr";
import { supabase } from "@/lib/supabase";

// Il singleton è un Proxy definito in JS: TypeScript lo vede come `{}`.
// Il cast al tipo di createBrowserClient restituisce ai consumer .tsx
// (form auth dello starter) il tipo SupabaseClient corretto.
type BrowserClient = ReturnType<typeof createBrowserClient>;

export function createClient(): BrowserClient {
  return supabase as BrowserClient;
}
