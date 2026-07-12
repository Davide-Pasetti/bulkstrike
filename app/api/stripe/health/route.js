// Health check della configurazione Stripe. NON espone mai i valori delle
// chiavi: riporta solo presenza, modalità dedotta dal prefisso standard
// (sk_test_/sk_live_, pk_test_/pk_live_) e l'esito di una chiamata reale a
// GET /v1/balance con la secret key (il campo livemode della risposta è la
// conferma lato Stripe). Serve a verificare le env per ambiente Vercel
// (Production vs Preview) prima di collegare il flusso di pagamento.
// (Niente route segment config: incompatibile con cacheComponents; le route
// handler GET sono comunque dinamiche di default.)

const modeOf = (k) => {
  if (!k) return null;
  if (k.startsWith("sk_test_") || k.startsWith("pk_test_")) return "test";
  if (k.startsWith("sk_live_") || k.startsWith("pk_live_")) return "live";
  return "unknown";
};

export async function GET() {
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
