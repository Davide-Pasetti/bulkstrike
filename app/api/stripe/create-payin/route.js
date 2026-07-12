// ============================================================
// BulkStrike — creazione del pay-in escrow (Stripe PaymentIntent)
// POST /api/stripe/create-payin   body opzionale: { orderIds: [uuid] }
//
// Chiamato dal checkout DOPO checkout_cart + stamp_order_payment_methods:
// prende gli ordini escrow del buyer in pending_payment (il body può solo
// RESTRINGERE l'insieme, mai allargarlo: ownership e stato sono verificati
// qui sotto RLS), li raggruppa per tipo di strumento (sepa_debit | card) e
// crea UN PaymentIntent consolidato per gruppo (metadata.sub_order_ids).
// L'importo per ordine è get_order_grand_total: merce+spedizione+IVA più i
// costi di servizio applicati dai trigger (inclusa la fee di elaborazione).
// Il client conferma i clientSecret con PaymentElement; 'paid' arriva solo
// dal webhook payment_intent.succeeded.
// ============================================================
import { NextResponse } from "next/server";
import { getStripe, createEscrowPayIn } from "@/lib/payments/escrowAdapter";
import { escrowMethodKind } from "@/lib/payments/paymentConfig";
import { getAuthedCompany, ensureStripeCustomer } from "@/lib/payments/apiAuth";

export async function POST(request) {
  const { supabase, user, company } = await getAuthedCompany();
  if (!user || !company) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requested = Array.isArray(body.orderIds)
    ? body.orderIds.filter((x) => typeof x === "string")
    : [];
  // orderIds è OBBLIGATORIO: senza filtro il pay-in engloberebbe l'intero
  // backlog di ordini escrow ancora in pending_payment (anche vecchi ordini
  // rimasti non pagati), non solo quelli del checkout corrente.
  if (!requested.length) {
    return NextResponse.json({ error: "orderIds mancanti" }, { status: 400 });
  }

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, payment_method, status")
    .eq("buyer_company_id", company.id)
    .eq("status", "pending_payment")
    .in("payment_method", ["escrow_sepa", "escrow_premium"])
    .in("id", requested);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!orders?.length) {
    return NextResponse.json({ error: "Nessun ordine escrow in attesa di pagamento" }, { status: 404 });
  }

  try {
    const customerId = await ensureStripeCustomer(supabase, user, company, getStripe());

    const withTotals = [];
    for (const o of orders) {
      const { data: grand, error: gErr } = await supabase.rpc("get_order_grand_total", { p_order_id: o.id });
      if (gErr) throw gErr;
      withTotals.push({ ...o, grandTotal: Number(grand) });
    }

    const groups = {};
    for (const o of withTotals) {
      const kind = escrowMethodKind(o.payment_method) === "card" ? "card" : "sepa_debit";
      (groups[kind] ||= []).push(o);
    }

    const payins = [];
    for (const [kind, list] of Object.entries(groups)) {
      const amountCents = Math.round(list.reduce((a, o) => a + o.grandTotal, 0) * 100);
      const res = await createEscrowPayIn({
        orderId: list[0].id,
        subOrderIds: list.map((o) => o.id),
        amountCents,
        paymentMethod: kind,
        customerId,
      });
      payins.push({
        clientSecret: res.clientSecret,
        paymentIntentId: res.paymentIntentId,
        kind,
        amountCents,
        orderIds: list.map((o) => o.id),
      });
    }
    return NextResponse.json({ payins });
  } catch (e) {
    console.error("create-payin:", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
