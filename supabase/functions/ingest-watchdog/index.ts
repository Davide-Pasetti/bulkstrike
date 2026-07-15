import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Watchdog di freschezza delle pipeline prezzi/indici. Chiamato dal cron
// settimanale (venerdì). Controlla l'ultimo inserimento per ogni fonte e, SOLO se
// una fonte è in ritardo oltre la soglia, invia UNA email riassuntiva via Resend.
// Copre tutti i modi di rottura (cron non parte, function in errore, pagina fonte
// cambiata → 0 righe estratte): in ogni caso created_at invecchia e scatta l'allarme.
// Protetto da x-cron-secret (verify_jwt=false lato deploy).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, FROM_EMAIL,
//      ALERT_EMAIL (opzionale, default davide@bulkstrike.com).
// Query ?test=1 forza l'invio dell'email (con prefisso [TEST]) anche se tutto è
// fresco, per verificare il recapito.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
// Stesso fallback della edge function send-delivery-confirmation: FROM_EMAIL non è
// impostato come secret di progetto, si usa il mittente verificato di default.
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "BulkStrike <ordini@updates.bulkstrike.com>";
const ALERT_TO = Deno.env.get("ALERT_EMAIL") ?? "davide@bulkstrike.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Check = { key: string; table: string; fonteFilter: { col: string; op: "eq" | "ilike"; val: string } | null; maxDays: number; label: string };

const CHECKS: Check[] = [
  { key: "ISMEA", table: "market_price_history", fonteFilter: { col: "fonte", op: "eq", val: "ISMEA" }, maxDays: 8, label: "ISMEA — prezzi agricoli (settimanale, giovedì)" },
  { key: "CUN", table: "market_price_history", fonteFilter: { col: "fonte", op: "ilike", val: "CUN%" }, maxDays: 8, label: "CUN — grano duro (settimanale, lunedì)" },
  { key: "Eurostat", table: "market_index_history", fonteFilter: { col: "fonte", op: "eq", val: "Eurostat" }, maxDays: 35, label: "Eurostat — indici settoriali (mensile, giorno 8)" },
];

Deno.serve(async (req: Request) => {
  const supaAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: cfg } = await supaAdmin.from("app_secrets").select("value").eq("key", "ingest_cron_secret").single();
  const provided = req.headers.get("x-cron-secret") || "";
  if (!cfg?.value || provided !== cfg.value) return json({ error: "FORBIDDEN" }, 403);

  const isTest = new URL(req.url).searchParams.get("test") === "1";
  const now = Date.now();

  const rows: { key: string; label: string; last: string | null; ageDays: number | null; stale: boolean }[] = [];
  for (const c of CHECKS) {
    let q = supaAdmin.from(c.table).select("created_at").order("created_at", { ascending: false }).limit(1);
    if (c.fonteFilter) {
      q = c.fonteFilter.op === "eq"
        ? q.eq(c.fonteFilter.col, c.fonteFilter.val)
        : q.ilike(c.fonteFilter.col, c.fonteFilter.val);
    }
    const { data } = await q;
    const last: string | null = data && data[0] ? data[0].created_at : null;
    const ageDays = last ? Math.floor((now - new Date(last).getTime()) / 86400000) : null;
    const stale = ageDays === null || ageDays > c.maxDays;
    rows.push({ key: c.key, label: c.label, last, ageDays, stale });
  }

  const staleRows = rows.filter((r) => r.stale);
  const mustSend = isTest || staleRows.length > 0;

  if (!mustSend) return json({ ok: true, alert: false, rows });

  // Costruzione email
  const fmt = (r: typeof rows[number]) =>
    `${r.stale ? "❌" : "✅"} ${r.label}\n     ultimo dato: ${r.last ? r.last.slice(0, 16).replace("T", " ") + " UTC" : "MAI"}` +
    `${r.ageDays !== null ? ` (${r.ageDays} giorni fa)` : ""}`;
  const subject = `${isTest ? "[TEST] " : "⚠️ "}BulkStrike — pipeline prezzi/indici` +
    `${staleRows.length > 0 ? `: ${staleRows.length} fonte/i in ritardo` : ": tutto regolare (test)"}`;
  const text =
    (isTest
      ? "Questo è un TEST del watchdog. Nessuna azione necessaria.\n\n"
      : "Una o più pipeline dati non si aggiornano da più del previsto. Controlla la fonte e i log delle edge function.\n\n") +
    "Stato fonti:\n\n" + rows.map(fmt).join("\n\n") +
    "\n\n— Watchdog automatico BulkStrike (controllo settimanale)";

  if (!RESEND_API_KEY) {
    return json({ error: "EMAIL_NOT_CONFIGURED", detail: "RESEND_API_KEY mancante", rows }, 500);
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: [ALERT_TO], subject, text }),
  });
  if (!res.ok) {
    return json({ error: "RESEND_ERROR", detail: (await res.text()).slice(0, 300), rows }, 502);
  }
  const payload = await res.json();
  return json({ ok: true, alert: true, test: isTest, stale: staleRows.map((r) => r.key), sent_to: ALERT_TO, resend_id: payload?.id ?? null, rows });
});
