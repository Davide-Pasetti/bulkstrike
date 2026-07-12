// ============================================================
// BulkStrike — SetupIntent per salvare un metodo di pagamento
// POST /api/stripe/setup-intent
//
// Serve al flusso d'asta con addebito differito (off_session): il buyer
// salva ORA il metodo (carta o SEPA) con la checkbox SCA specifica
// concordata ("autorizzo l'addebito automatico sul metodo salvato quando
// la quotazione del trasporto sarà disponibile" — NON basta accettare i
// T&C), e l'addebito avviene poi server-side con createEscrowPayIn
// { paymentMethodId, offSession: true }. Il clientSecret restituito si
// conferma con PaymentElement in modalità setup.
// ============================================================
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/payments/escrowAdapter";
import { getAuthedCompany, ensureStripeCustomer } from "@/lib/payments/apiAuth";

export async function POST() {
  const { supabase, user, company } = await getAuthedCompany();
  if (!user || !company) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  try {
    const stripe = getStripe();
    const customerId = await ensureStripeCustomer(supabase, user, company, stripe);
    const si = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      payment_method_types: ["card", "sepa_debit"],
      metadata: { bulkstrike_company_id: company.id },
    });
    return NextResponse.json({ clientSecret: si.client_secret });
  } catch (e) {
    console.error("setup-intent:", e);
    return NextResponse.json({ error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
