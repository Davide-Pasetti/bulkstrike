// Health check della configurazione Stripe — strumento diagnostico, NON
// funzionalità di prodotto: riservato agli admin di piattaforma (stessa
// logica dei pannelli admin: profiles → companies.is_platform_admin), sia
// perché non deve essere un endpoint aperto a chiunque, sia perché ogni
// chiamata consuma una richiesta reale verso Stripe.
// Autenticazione dai cookie di sessione Supabase (createServerClient):
// basta essere loggati come admin e visitare l'URL dal browser.
// NON espone mai i valori delle chiavi: solo presenza, modalità dedotta dal
// prefisso standard (sk_test_/sk_live_, pk_test_/pk_live_) e l'esito di una
// chiamata a GET /v1/balance (il campo livemode è la conferma lato Stripe).
// (Niente route segment config: incompatibile con cacheComponents; le route
// handler GET sono comunque dinamiche di default.)
import { createClient } from "@/lib/supabase/server";

const modeOf = (k) => {
  if (!k) return null;
  if (k.startsWith("sk_test_") || k.startsWith("pk_test_")) return "test";
  if (k.startsWith("sk_live_") || k.startsWith("pk_live_")) return "live";
  return "unknown";
};

async function isPlatformAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  // Stesso criterio dei pannelli admin: companies.is_platform_admin (NON
  // profiles.role, che è il ruolo dentro l'azienda). Query sotto RLS con la
  // sessione dell'utente: niente service role.
  const { data: profile } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
  if (!profile?.company_id) return false;
  const { data: company } = await supabase.from("companies").select("is_platform_admin").eq("id", profile.company_id).single();
  return !!company?.is_platform_admin;
}

export async function GET() {
  if (!(await isPlatformAdmin())) {
    return Response.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const secret = process.env.STRIPE_SECRET_KEY || null;
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;
  const out = {
    env: process.env.VERCEL_ENV || "unknown",
    secret_key: { present: !!secret, mode: modeOf(secret) },
    publishable_key: { present: !!publishable, mode: modeOf(publishable) },
    api_call: null,
  };
  if (secret) {
    try {
      const r = await fetch("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
      });
      const d = await r.json().catch(() => ({}));
      out.api_call = {
        ok: r.ok,
        status: r.status,
        livemode: d.livemode ?? null,
        error: d.error ? String(d.error.message || d.error.type).slice(0, 120) : null,
      };
    } catch (e) {
      out.api_call = { ok: false, error: String(e?.message || e).slice(0, 120) };
    }
  }
  return Response.json(out);
}
