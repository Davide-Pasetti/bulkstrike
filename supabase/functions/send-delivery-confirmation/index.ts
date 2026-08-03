import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

// ============================================================
// BulkStrike — invio email di conferma ricezione ordine (Resend).
// POST { sub_order_id: string, force_resend?: boolean }
//
// Il "sub-ordine" è la riga public.orders (un prodotto per ordine/fornitore:
// nessuna order_items). Riusa product_certificates + products.scheda_*_url del
// sistema post-consegna. Logga ogni invio in delivery_email_log (audit Resend).
//
// Autorizzazione (una delle due):
//  - Authorization: Bearer <SERVICE_ROLE_KEY>  (chiamata interna dal pannello), OR
//  - JWT di un utente platform admin.
//
// Invocazione MANUALE (bottone admin). L'architettura resta compatibile con un
// futuro trigger automatico su status='delivered': basterà invocare questa
// function con il sub_order_id, senza riscriverla.
//
// Secrets richiesti (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY, FROM_EMAIL, FRONTEND_URL
// (SUPABASE_URL / *_KEY sono iniettati automaticamente).
// ============================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "BulkStrike <ordini@updates.bulkstrike.com>";
const FRONTEND_URL = (Deno.env.get("FRONTEND_URL") ?? "https://bulkstrike.com").replace(/\/+$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Una cella CSV: sempre fra virgolette, con "" per le virgolette interne.
const csvCell = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;

// UTF-8 → base64 (per l'allegato Resend), con BOM per Excel.
function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { success: false, message: "METHOD_NOT_ALLOWED" });

  const body = await req.json().catch(() => ({}));
  const subOrderId: string | null = body?.sub_order_id ?? null;
  const forceResend: boolean = body?.force_resend === true;
  if (!subOrderId) return json(400, { success: false, message: "MISSING_SUB_ORDER_ID" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // ---- Autorizzazione: service role oppure utente platform admin -------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  let authorized = bearer === SERVICE_KEY;
  if (!authorized && bearer) {
    const supaUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await supaUser.auth.getUser();
    const uid = userData?.user?.id;
    if (uid) {
      const { data: prof } = await admin.from("profiles").select("company_id").eq("id", uid).maybeSingle();
      const cid = prof?.company_id;
      if (cid) {
        const { data: comp } = await admin.from("companies").select("is_platform_admin").eq("id", cid).maybeSingle();
        authorized = !!comp?.is_platform_admin;
      }
    }
  }
  if (!authorized) return json(403, { success: false, message: "NOT_AUTHORIZED" });

  // ---- Idempotenza: già inviata? --------------------------------------------
  if (!forceResend) {
    const { data: already } = await admin
      .from("delivery_email_log")
      .select("id, sent_at")
      .eq("sub_order_id", subOrderId)
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();
    if (already) {
      return json(409, { success: false, message: "Email di conferma già inviata per questo ordine. Usa force_resend per reinviarla." });
    }
  }

  // ---- Dati sub-ordine + prodotto + fornitore + acquirente -------------------
  const { data: order } = await admin
    .from("orders")
    .select("id, buyer_company_id, supplier_company_id, product_id, quantity_kg, unit_price_per_kg, goods_subtotal, lot_number, status")
    .eq("id", subOrderId)
    .maybeSingle();
  if (!order) return json(404, { success: false, message: "SUB_ORDER_NOT_FOUND" });

  const [{ data: product }, { data: supplier }, { data: buyer }] = await Promise.all([
    admin.from("products").select("canonical_name, e_number, cas_number, default_unit, scheda_sicurezza_url, scheda_tecnica_url").eq("id", order.product_id).maybeSingle(),
    admin.from("companies").select("legal_name").eq("id", order.supplier_company_id).maybeSingle(),
    admin.from("companies").select("legal_name, email_admin, email_mgmt, support_email").eq("id", order.buyer_company_id).maybeSingle(),
  ]);

  // Destinatario: email azienda acquirente, con fallback su un profilo dell'azienda.
  let recipient = buyer?.email_admin || buyer?.email_mgmt || buyer?.support_email || "";
  if (!recipient) {
    const { data: prof } = await admin
      .from("profiles").select("email").eq("company_id", order.buyer_company_id)
      .not("email", "is", null).order("created_at", { ascending: true }).limit(1).maybeSingle();
    recipient = prof?.email || "";
  }

  // Certificati di conformità validi (non scaduti) del prodotto.
  const today = new Date().toISOString().slice(0, 10);
  const { data: certs } = await admin
    .from("product_certificates")
    .select("cert_type, label, file_url, expiry_date")
    .eq("product_id", order.product_id)
    .or(`expiry_date.is.null,expiry_date.gte.${today}`)
    .order("cert_type", { ascending: true });

  const ref = String(order.id).slice(0, 8).toUpperCase();
  const unit = product?.default_unit || "kg";
  const supplierName = supplier?.legal_name || "—";

  // ---- File di carico per il gestionale (DAV-75, livello 1) ------------------
  // Fonte unica: get_goods_receipt assegna il progressivo BS-GR-<anno>-<6 cifre>
  // (STABILE: chiave di idempotenza per il gestionale del cliente) e restituisce
  // anche DDT numero/data — in contabilità italiana la merce entra in magazzino
  // col DDT, la fattura arriva dopo via SDI e si riconcilia sul numero DDT.
  const { data: receipt, error: grErr } = await admin.rpc("get_goods_receipt", { p_order: subOrderId });
  if (grErr) {
    const msg = String(grErr.message || grErr);
    return json(422, { success: false, message: msg.includes("NOT_SHIPPED")
      ? "L'ordine non risulta ancora spedito: il file di carico (DDT) non esiste."
      : `Dati di carico non disponibili: ${msg}` });
  }

  const GR_HEADER = [
    "numero_documento", "data_documento", "ddt_numero", "ddt_data", "codice_articolo_cliente",
    "codice_prodotto_bulkstrike", "descrizione", "quantita", "unita_misura", "lotto",
    "scadenza_lotto", "prezzo_unitario", "valuta", "fornitore_ragione_sociale",
    "fornitore_piva", "destinazione", "note",
  ];
  const grRow = GR_HEADER.map((k) => receipt?.[k] ?? "");
  const csv = "﻿" + [GR_HEADER, grRow].map((r) => r.map(csvCell).join(",")).join("\r\n");

  // Stesso file in XLSX: molti gestionali importano solo Excel.
  const ws = XLSX.utils.aoa_to_sheet([GR_HEADER, grRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Carico");
  const xlsxB64: string = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  const grName = String(receipt?.numero_documento || `carico_${ref}`);

  // ---- Link documenti (righe con url null OMESSE) ---------------------------
  const docItems: { label: string; url: string }[] = [];
  if (product?.scheda_sicurezza_url) docItems.push({ label: "Scheda di sicurezza (SDS)", url: product.scheda_sicurezza_url });
  if (product?.scheda_tecnica_url) docItems.push({ label: "Scheda tecnica", url: product.scheda_tecnica_url });
  for (const c of certs || []) {
    if (c.file_url) docItems.push({ label: `Certificato ${c.label || c.cert_type}`, url: c.file_url });
  }
  const docsHtml = docItems.length
    ? `<ul>${docItems.map((d) => `<li><a href="${esc(d.url)}">${esc(d.label)}</a></li>`).join("")}</ul>`
    : `<p style="color:#64748b">Nessun documento disponibile per questo prodotto.</p>`;

  const orderUrl = `${FRONTEND_URL}/ordine?id=${order.id}`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:640px;margin:0 auto">
      <h2 style="color:#0C4A6E">Conferma ricezione ordine #${ref}</h2>
      <p>Ciao ${esc(buyer?.legal_name || "")}, confermiamo la ricezione del tuo ordine.</p>
      <h3>Riepilogo prodotti</h3>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <thead>
          <tr style="background:#f1f5f9;text-align:left">
            <th style="padding:8px;border:1px solid #e2e8f0">Prodotto</th>
            <th style="padding:8px;border:1px solid #e2e8f0">Quantità</th>
            <th style="padding:8px;border:1px solid #e2e8f0">Lotto</th>
            <th style="padding:8px;border:1px solid #e2e8f0">Fornitore</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:8px;border:1px solid #e2e8f0">${esc(product?.canonical_name || "—")}</td>
            <td style="padding:8px;border:1px solid #e2e8f0">${esc(order.quantity_kg)} ${esc(unit)}</td>
            <td style="padding:8px;border:1px solid #e2e8f0">${esc(order.lot_number || "—")}</td>
            <td style="padding:8px;border:1px solid #e2e8f0">${esc(supplierName)}</td>
          </tr>
        </tbody>
      </table>
      <h3>Documenti</h3>
      ${docsHtml}
      <p style="margin-top:20px">
        <a href="${esc(orderUrl)}" style="background:#0EA5E9;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;display:inline-block">Apri l'ordine in piattaforma</a>
      </p>
      <p style="font-size:12px;color:#64748b;margin-top:18px">In allegato trovi il file di carico <b>${esc(grName)}</b> (CSV e Excel) con numero e data DDT, pronto per l'import nel tuo gestionale. Il numero documento è stabile: reimportare lo stesso file non crea un doppio carico.</p>
    </div>`;

  // ---- Invio via Resend ------------------------------------------------------
  if (!recipient) {
    await admin.from("delivery_email_log").insert({ sub_order_id: subOrderId, recipient_email: null, status: "failed", error_message: "NO_RECIPIENT_EMAIL" });
    return json(422, { success: false, message: "Nessuna email destinatario trovata per l'azienda acquirente." });
  }
  if (!RESEND_API_KEY) {
    await admin.from("delivery_email_log").insert({ sub_order_id: subOrderId, recipient_email: recipient, status: "failed", error_message: "RESEND_API_KEY_NOT_SET" });
    return json(500, { success: false, message: "RESEND_API_KEY non configurata: imposta i secret dell'Edge Function." });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipient,
        subject: `Conferma ricezione ordine #${ref} - BulkStrike`,
        html,
        attachments: [
          { filename: `${grName}.csv`, content: toBase64Utf8(csv) },
          { filename: `${grName}.xlsx`, content: xlsxB64 },
        ],
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = (payload && (payload.message || payload.name)) || `HTTP ${res.status}`;
      await admin.from("delivery_email_log").insert({ sub_order_id: subOrderId, recipient_email: recipient, status: "failed", error_message: String(errMsg).slice(0, 500) });
      return json(502, { success: false, message: `Invio Resend non riuscito: ${errMsg}` });
    }
    const resendId = payload?.id ?? null;
    await admin.from("delivery_email_log").insert({ sub_order_id: subOrderId, recipient_email: recipient, status: "sent", resend_email_id: resendId });
    return json(200, { success: true, message: `Email inviata a ${recipient}`, resend_email_id: resendId });
  } catch (e) {
    await admin.from("delivery_email_log").insert({ sub_order_id: subOrderId, recipient_email: recipient, status: "failed", error_message: String((e as Error)?.message || e).slice(0, 500) });
    return json(500, { success: false, message: `Errore invio: ${String((e as Error)?.message || e)}` });
  }
});
