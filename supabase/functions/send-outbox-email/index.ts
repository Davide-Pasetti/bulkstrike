import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ============================================================
// BulkStrike — drena una riga di emails_outbox via Resend (DAV-33, DAV-73).
// POST { id: string }  ← chiamata da net.http_post nel trigger
// trg_outbox_dispatch (AFTER INSERT, qualunque kind con status='queued')
// e dal cron di recupero bs_outbox_retry (ogni 5 min, righe scadute).
//
// DAV-73: NESSUNA whitelist di kind — il contenuto (subject/body) è già
// nella riga, quindi qualunque kind viene inviato. Destinatario:
//   ADMIN_KINDS          → ALERT_EMAIL (l'admin)
//   qualunque altro kind → to_email della riga; se NULL viene
//     risolto con resolve_company_email(to_company_id, recipient_role) e
//     salvato sulla riga. Se non risolvibile: status='failed',
//     last_error='NO_RECIPIENT' + avviso ad ALERT_EMAIL.
// Retry: su errore Resend attempts+1, last_error, next_attempt_at con
// backoff 1m/5m/30m/2h/12h; al 6° fallimento status='failed'.
// Allegati: emails_outbox.attachments = [{url, type, order_id}] → passati
// a Resend come attachment con path (URL pubblico).
//
// Autorizzazione: header x-cron-secret == app_secrets.ingest_cron_secret
// (stesso pattern degli ingest ISMEA/CUN; verify_jwt=false lato deploy).
// Idempotente: righe non più 'queued' non vengono rispedite.
// Secrets richiesti: RESEND_API_KEY, FROM_EMAIL, ALERT_EMAIL.
// ============================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "BulkStrike <ordini@updates.bulkstrike.com>";
const ALERT_TO = Deno.env.get("ALERT_EMAIL") ?? "davide@bulkstrike.com";

// Kind amministrativi: vanno all'admin (ALERT_EMAIL), non all'azienda della riga.
const ADMIN_KINDS = ["claim_request", "removal_request", "payout_ready_admin", "order_disputed_admin"] as const;

// Backoff per numero di tentativo (1°→1 min … 5°→12 h); al 6° → failed.
const BACKOFF_MINUTES = [1, 5, 30, 120, 720] as const;
const MAX_ATTEMPTS = 6;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function attachmentName(url: string, i: number) {
  try {
    const base = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (base) return decodeURIComponent(base);
  } catch { /* URL non parsabile → nome generico */ }
  return `allegato-${i + 1}`;
}

async function sendViaResend(to: string, subject: string, html: string | null, text: string | null, attachments: unknown) {
  const atts = Array.isArray(attachments)
    ? attachments
        .filter((a: { url?: string }) => a && typeof a.url === "string" && a.url)
        .map((a: { url: string }, i: number) => ({ filename: attachmentName(a.url, i), path: a.url }))
    : [];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
      ...(atts.length ? { attachments: atts } : {}),
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (payload && (payload.message || payload.name)) || `HTTP ${res.status}`;
    throw new Error(`RESEND: ${String(msg).slice(0, 280)}`);
  }
  return payload?.id ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: cfg } = await admin.from("app_secrets").select("value").eq("key", "ingest_cron_secret").single();
  const provided = req.headers.get("x-cron-secret") || "";
  if (!cfg?.value || provided !== cfg.value) return json(401, { error: "BAD_SECRET" });

  const body = await req.json().catch(() => ({}));
  const id: string | null = body?.id ?? null;
  if (!id) return json(400, { error: "MISSING_ID" });

  const { data: row } = await admin
    .from("emails_outbox")
    .select("id, kind, to_email, to_company_id, recipient_role, subject, body_text, body_html, status, attempts, attachments")
    .eq("id", id)
    .maybeSingle();
  if (!row) return json(404, { error: "OUTBOX_ROW_NOT_FOUND" });
  if (row.status !== "queued") return json(200, { ok: true, skipped: "ALREADY_PROCESSED", status: row.status });

  // Fallimento definitivo: niente retry (destinatario impossibile, ecc.)
  const failFinal = async (msg: string, status: number) => {
    await admin.from("emails_outbox")
      .update({ status: "failed", last_error: msg.slice(0, 300) })
      .eq("id", id).eq("status", "queued");
    return json(status, { error: msg });
  };

  // Fallimento transitorio: attempts+1 e backoff; al 6° tentativo → failed.
  const failRetry = async (msg: string, status: number) => {
    const attempts = (row.attempts ?? 0) + 1;
    const err = msg.slice(0, 300);
    if (attempts >= MAX_ATTEMPTS) {
      await admin.from("emails_outbox")
        .update({ status: "failed", attempts, last_error: err })
        .eq("id", id).eq("status", "queued");
    } else {
      const nextAt = new Date(Date.now() + BACKOFF_MINUTES[attempts - 1] * 60_000).toISOString();
      await admin.from("emails_outbox")
        .update({ attempts, last_error: err, next_attempt_at: nextAt })
        .eq("id", id).eq("status", "queued");
    }
    return json(status, { error: err, attempts });
  };

  // ── Destinatario ──────────────────────────────────────────────
  let recipient: string | null = null;
  if ((ADMIN_KINDS as readonly string[]).includes(row.kind)) {
    recipient = ALERT_TO || null;
    if (!recipient) return await failFinal("ALERT_EMAIL_NOT_SET", 422);
  } else {
    recipient = row.to_email || null;
    if (!recipient && row.to_company_id) {
      const { data: resolved, error: rpcErr } = await admin.rpc("resolve_company_email", {
        p_company_id: row.to_company_id,
        p_role: row.recipient_role || "acquisti",
      });
      if (rpcErr) return await failRetry(`RESOLVE: ${rpcErr.message}`, 500);
      if (resolved) {
        recipient = String(resolved);
        // memorizza l'indirizzo risolto sulla riga (audit + retry senza ri-risolvere)
        await admin.from("emails_outbox").update({ to_email: recipient }).eq("id", id);
      }
    }
    if (!recipient) {
      // Nessun indirizzo per l'azienda: definitivo + avviso all'admin.
      const resp = await failFinal("NO_RECIPIENT", 422);
      if (RESEND_API_KEY && ALERT_TO) {
        try {
          await sendViaResend(
            ALERT_TO,
            `[BulkStrike] Email non recapitabile: nessun indirizzo per l'azienda (${row.kind})`,
            null,
            `La riga ${row.id} di emails_outbox (kind=${row.kind}, company=${row.to_company_id ?? "n/d"}) non ha un destinatario risolvibile: nessuna email aziendale ne' utente registrato. Aggiungi un indirizzo all'azienda e reinserisci l'email.`,
            null,
          );
        } catch { /* best effort: l'avviso non deve mascherare il NO_RECIPIENT */ }
      }
      return resp;
    }
  }

  if (!RESEND_API_KEY) return await failRetry("RESEND_API_KEY_NOT_SET", 500);

  try {
    const resendId = await sendViaResend(recipient, row.subject, row.body_html, row.body_text, row.attachments);
    await admin.from("emails_outbox")
      .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
      .eq("id", id).eq("status", "queued");
    return json(200, { ok: true, sent_to: recipient, resend_id: resendId });
  } catch (e) {
    return await failRetry(String((e as Error)?.message || e), 502);
  }
});
