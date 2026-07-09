// ============================================================
// BulkStrike — PSP Adapter (escrow)
// Destinazione: lib/payments/escrowAdapter.js
//
// Pattern: Stripe Connect "Separate Charges and Transfers".
// L'incasso resta sul balance della piattaforma finché
// releaseFunds() non viene chiamato (dal cron di rilascio).
// La commissione BulkStrike (5% spedizione) è implicita:
// è la quota NON trasferita al corriere.
//
// env richieste:
//   STRIPE_SECRET_KEY
// ============================================================

import Stripe from 'stripe';
import { PAYMENT_CONFIG } from './paymentConfig';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-06-30',
});

// ------------------------------------------------------------
// Interfaccia PSP-agnostica.
// Se in futuro si passa a Mangopay: implementare le stesse 4
// funzioni in mangopayAdapter.js e cambiare solo l'export finale.
// ------------------------------------------------------------

/**
 * Crea il pay-in escrow. Un solo pagamento può coprire più
 * sub-ordini (multi-fornitore, multi-corriere): lo smistamento
 * avviene dopo, con releaseFunds() per singolo sub-ordine.
 *
 * @param {Object} p
 * @param {string} p.orderId              - id ordine "padre" (carrello)
 * @param {string[]} p.subOrderIds        - id sub-ordini coperti da questo pagamento
 * @param {number} p.amountCents          - importo totale in centesimi
 * @param {'sepa_debit'|'card'} p.paymentMethod
 * @param {string} p.customerId           - Stripe customer del buyer
 * @param {string} [p.paymentMethodId]    - pm salvato (SetupIntent off-session)
 */
export async function createEscrowPayIn(p) {
  const intent = await stripe.paymentIntents.create({
    amount: p.amountCents,
    currency: 'eur',
    customer: p.customerId,
    payment_method: p.paymentMethodId,
    payment_method_types: [p.paymentMethod],
    // NESSUN transfer_data.destination: i fondi restano sulla piattaforma
    metadata: {
      order_id: p.orderId,
      sub_order_ids: p.subOrderIds.join(','), // per riconciliazione
      flow: 'escrow',
    },
    // off_session true solo per il ramo awaiting_shipping_quote
    // (richiede mandato/clausola T&C — vedi spec sez. 8)
    ...(p.offSession ? { off_session: true, confirm: true } : {}),
  });

  return {
    paymentIntentId: intent.id,
    status: intent.status,
    clientSecret: intent.client_secret,
  };
}

/**
 * Rilascia i fondi di UN sub-ordine: transfer al fornitore (merce)
 * + transfer al corriere (spedizione - 5%).
 * La quota trattenuta resta sul balance piattaforma.
 *
 * Chiamato dal cron bulkstrike-auto-release-deliveries per ogni
 * sub-ordine con payments.status='held' e orders.release_scheduled_at
 * scaduto (e orders.disputed_at is null).
 *
 * @param {Object} p
 * @param {string} p.paymentIntentId
 * @param {string} p.subOrderId
 * @param {string} p.supplierAccountId    - Connected Account fornitore
 * @param {number} p.goodsAmountCents     - importo merce
 * @param {string} p.carrierAccountId     - Connected Account corriere
 * @param {number} p.shippingAmountCents  - costo spedizione pieno
 */
export async function releaseFunds(p) {
  // Verifica PRIMA che il pay-in sia realmente liquidato
  // (SEPA DD impiega giorni: 'processing' NON basta)
  const intent = await stripe.paymentIntents.retrieve(p.paymentIntentId);
  if (intent.status !== 'succeeded') {
    return { released: false, reason: `payment_intent status: ${intent.status}` };
  }

  const commissionCents = Math.round(
    p.shippingAmountCents * PAYMENT_CONFIG.commissionRate
  );
  const carrierNetCents = p.shippingAmountCents - commissionCents;

  const charge = intent.latest_charge;

  const supplierTransfer = await stripe.transfers.create({
    amount: p.goodsAmountCents,
    currency: 'eur',
    destination: p.supplierAccountId,
    source_transaction: charge,
    metadata: { sub_order_id: p.subOrderId, role: 'supplier' },
  });

  const carrierTransfer = await stripe.transfers.create({
    amount: carrierNetCents,
    currency: 'eur',
    destination: p.carrierAccountId,
    source_transaction: charge,
    metadata: {
      sub_order_id: p.subOrderId,
      role: 'carrier',
      commission_withheld_cents: String(commissionCents),
    },
  });

  return {
    released: true,
    supplierTransferId: supplierTransfer.id,
    carrierTransferId: carrierTransfer.id,
    commissionCents, // da scrivere in commission_ledger (flow_type='escrow', status='settled')
  };
}

/**
 * Rimborso (totale o parziale) di un pay-in.
 * Per un pagamento unico multi-fornitore con un solo sub-ordine
 * contestato: passare amountCents = quota di quel sub-ordine.
 * Se la quota era già stata trasferita: prima transfer reversal.
 */
export async function refund(p) {
  if (p.reverseTransferId) {
    await stripe.transfers.createReversal(p.reverseTransferId, {
      amount: p.amountCents,
    });
  }
  const r = await stripe.refunds.create({
    payment_intent: p.paymentIntentId,
    amount: p.amountCents, // omesso = totale
    reason: 'requested_by_customer',
    metadata: { sub_order_id: p.subOrderId ?? '', note: p.reason ?? '' },
  });
  return { refundId: r.id };
}

/**
 * Stato onboarding di un Connected Account (fornitore o corriere).
 * Usato per il gating preventivo: se non 'active', il soggetto
 * non compare in get_shipping_quotes / non ha prodotti attivi.
 */
export async function getOnboardingStatus(connectedAccountId) {
  const acct = await stripe.accounts.retrieve(connectedAccountId);
  const active = acct.charges_enabled && acct.payouts_enabled;
  return {
    status: active ? 'active' : acct.requirements?.disabled_reason ? 'restricted' : 'pending',
    requirements: acct.requirements?.currently_due ?? [],
  };
}

/**
 * Crea (o rigenera il link per) un Connected Account Stripe Express
 * per un fornitore o corriere. Wrapper puro: NON scrive sul DB — il
 * chiamante deve salvare stripeAccountId in companies.stripe_account_id
 * dopo aver ricevuto la risposta.
 *
 * Serve solo la capability 'transfers': i fornitori/corrieri ricevono
 * transfer dalla piattaforma, non processano pagamenti propri.
 *
 * @param {Object} p
 * @param {string} p.companyId              - id azienda BulkStrike (finisce in metadata)
 * @param {string} p.email
 * @param {'IT'|string} [p.country]
 * @param {string} [p.existingStripeAccountId] - se già esiste, salta la creazione
 *        e genera solo un nuovo Account Link (utile su refresh_url quando
 *        il link precedente è scaduto senza completare l'onboarding)
 */
export async function createConnectedAccount(p) {
  let accountId = p.existingStripeAccountId;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: p.country ?? 'IT',
      email: p.email,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: { bulkstrike_company_id: p.companyId },
    });
    accountId = account.id;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL; // es. https://www.bulkstrike.com — da impostare su Vercel
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${siteUrl}/onboarding/stripe/refresh?company_id=${p.companyId}`,
    return_url: `${siteUrl}/onboarding/stripe/complete?company_id=${p.companyId}`,
    type: 'account_onboarding',
  });

  return {
    stripeAccountId: accountId,
    onboardingUrl: accountLink.url,
    // I link di onboarding Stripe scadono dopo pochi minuti se non aperti:
    // non salvare onboardingUrl, generarlo sempre al volo quando serve.
  };
}

