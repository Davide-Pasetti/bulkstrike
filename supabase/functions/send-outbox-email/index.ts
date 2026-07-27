import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ============================================================
// BulkStrike — drena una riga di emails_outbox via Resend (DAV-33).
// POST { id: string }  ← chiamata da net.http_post nel trigger
// trg_outbox_dispatch (AFTER INSERT su emails_outbox, solo i kind in
// ALLOWED_KINDS; i kind ordini restano al loro flusso: questa function
// li rifiuta).
//
// Destinatario per kind:
//   claim_request      → ALERT_EMAIL (l'admin: stessa env del watchdog)
//   removal_request    → ALERT_EMAIL (richiesta di rimozione, DAV-33-bis)
//   unclaimed_contact  → to_email della riga (support_email dell'azienda)
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

const ALLOWED_KINDS = ["claim_request", "unclaimed_contact", "removal_request"] as const;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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
    .select("id, kind, to_email, subject, body_text, body_html, status")
    .eq("id", id)
    .maybeSingle();
  if (!row) return json(404, { error: "OUTBOX_ROW_NOT_FOUND" });
  if (!ALLOWED_KINDS.includes(row.kind as typeof ALLOWED_KINDS[number])) {
    return json(422, { error: "KIND_NOT_HANDLED", kind: row.kind });
  }
  if (row.status !== "queued") return json(200, { ok: true, skipped: "ALREADY_PROCESSED", status: row.status });

  const recipient = row.kind === "unclaimed_contact" ? (row.to_email ?? "") : ALERT_TO;

  const fail = async (msg: string, status: number) => {
    await admin.from("emails_outbox").update({ status: "failed" }).eq("id", id).eq("status", "queued");
    return json(status, { error: msg });
  };

  if (!recipient) return await fail(row.kind === "unclaimed_contact" ? "NO_RECIPIENT_EMAIL" : "ALERT_EMAIL_NOT_SET", 422);
  if (!RESEND_API_KEY) return await fail("RESEND_API_KEY_NOT_SET", 500);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipient],
        subject: row.subject,
        ...(row.body_html ? { html: row.body_html } : {}),
        ...(row.body_text ? { text: row.body_text } : {}),
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = (payload && (payload.message || payload.name)) || `HTTP ${res.status}`;
      return await fail(`RESEND: ${String(errMsg).slice(0, 300)}`, 502);
    }
    await admin.from("emails_outbox").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
    return json(200, { ok: true, sent_to: recipient, resend_id: payload?.id ?? null });
  } catch (e) {
    return await fail(String((e as Error)?.message || e).slice(0, 300), 500);
  }
});
