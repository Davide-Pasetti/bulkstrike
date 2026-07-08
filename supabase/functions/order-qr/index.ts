import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import QRCode from "npm:qrcode@1.5.4";

// ============================================================
// BulkStrike — genera il PNG del QR di un ordine.
// Contenuto QR: https://bulkstrike.com/ricezione/{order_id}/{token}
// (pagina di destinazione non ancora attiva — schema pronto per la futura
//  lettura/scan-to-load).
// Autorizzazione (una delle due):
//  - ?token=<receipt_token> che combacia con l'ordine (usato dal modulo email
//    e dalla futura pagina di ricezione), oppure
//  - JWT dell'utente che è fornitore/acquirente dell'ordine (download dall'area).
// Ritorna image/png.
// ============================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_BASE = Deno.env.get("PUBLIC_BASE_URL") ?? "https://bulkstrike.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function bad(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  let orderId = url.searchParams.get("order_id");
  let token = url.searchParams.get("token");
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    orderId = orderId ?? body.order_id ?? null;
    token = token ?? body.token ?? null;
  }
  if (!orderId) return bad(400, "MISSING_ORDER_ID");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: order } = await admin
    .from("orders")
    .select("id, receipt_token, supplier_company_id, buyer_company_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return bad(404, "ORDER_NOT_FOUND");

  // Autorizzazione
  let authorized = false;
  if (token && token === order.receipt_token) {
    authorized = true;
  } else {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supaUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await supaUser.auth.getUser();
    const uid = userData?.user?.id;
    if (uid) {
      const { data: prof } = await admin.from("profiles").select("company_id").eq("id", uid).maybeSingle();
      const cid = prof?.company_id;
      const { data: comp } = cid ? await admin.from("companies").select("is_platform_admin").eq("id", cid).maybeSingle() : { data: null };
      if (cid && (cid === order.supplier_company_id || cid === order.buyer_company_id || comp?.is_platform_admin)) {
        authorized = true;
      }
    }
  }
  if (!authorized) return bad(403, "NOT_AUTHORIZED");

  const qrTarget = `${PUBLIC_BASE}/ricezione/${order.id}/${order.receipt_token}`;
  const png: Uint8Array = await QRCode.toBuffer(qrTarget, { type: "png", width: 512, margin: 2 });

  return new Response(png, {
    headers: {
      ...CORS,
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="qr-ordine-${String(order.id).slice(0, 8)}.png"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});
