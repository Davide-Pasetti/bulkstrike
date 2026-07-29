// ============================================================
// BulkStrike — Stripe webhook handler
// Destinazione: app/api/webhooks/stripe/route.js
//
// Riceve eventi asincroni da Stripe (un pagamento SEPA impiega
// giorni prima di risultare "succeeded", non è mai istantaneo).
// Senza questo endpoint il DB non saprebbe mai quando un pagamento
// passa da "in corso" a confermato o fallito.
//
// env richieste:
//   STRIPE_SECRET_KEY      (già impostata)
//   STRIPE_WEBHOOK_SECRET  (NUOVA — vedi nota in fondo su come ottenerla)
//
// IMPORTANTE: legge il body RAW (request.text()), non JSON —
// Stripe firma i byte esatti del payload. Se in mezzo c'è un
// parser che consuma/modifica il body prima di arrivare qui, la
// verifica della firma fallisce sempre.
// ============================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
// getStripe: istanza lazy condivisa (vedi adapter) — niente new Stripe a
// livello di modulo (fallirebbe la build senza env) né apiVersion custom.
import { getStripe } from '@/lib/payments/escrowAdapter';

function supabaseAdmin() {
  // lazy, come richiesto dall'audit precedente: mai istanziare a livello
  // di modulo, altrimenti fallisce in build quando le env var server-side
  // non sono garantite disponibili in "Collecting page data"
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Firma webhook Stripe non valida:', err.message);
    return NextResponse.json({ error: 'Firma non valida' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  try {
    switch (event.type) {
      // ------------------------------------------------------------
      // Pagamento confermato: i fondi sono arrivati sul balance
      // piattaforma. Segna payments.status='held' e orders.status='paid'.
      //
      // Il pay-in può essere consolidato multi-fornitore: un solo
      // PaymentIntent copre N sub-ordini (metadata.sub_order_ids, CSV,
      // scritto da createEscrowPayIn). L'importo registrato per riga è
      // il grand_total del singolo sub-ordine (la somma è nel PI).
      // ------------------------------------------------------------
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const orderIds = (pi.metadata?.sub_order_ids || pi.metadata?.order_id || '')
          .split(',').map((s) => s.trim()).filter(Boolean);
        if (orderIds.length === 0) {
          console.warn('payment_intent.succeeded senza order_id/sub_order_ids in metadata:', pi.id);
          break;
        }

        for (const orderId of orderIds) {
          const { data: grand } = await supabase.rpc('get_order_grand_total', { p_order_id: orderId });
          const { error: payErr } = await supabase
            .from('payments')
            .upsert(
              {
                order_id: orderId,
                amount: grand != null ? Number(grand) : pi.amount / 100,
                provider: 'stripe',
                provider_ref: pi.id,
                status: 'held',
                held_at: new Date().toISOString(),
              },
              { onConflict: 'order_id' }
            );
          if (payErr) throw payErr;

          const { data: updated, error: orderErr } = await supabase
            .from('orders')
            .update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('id', orderId)
            .eq('status', 'pending_payment') // non retrocedere stati logistici successivi
            .select('id, supplier_company_id, product_id, buyer_company_id');
          if (orderErr) throw orderErr;

          // Notifica al fornitore "spedisci" SOLO se l'ordine è passato ORA a
          // 'paid' (updated non vuoto): il pagamento in garanzia è incassato.
          // Su retry del webhook la guardia .eq('status','pending_payment') dà 0
          // righe → nessuna notifica duplicata. Non deve MAI far fallire il
          // webhook (Stripe ritenta all'infinito): ogni errore è solo loggato.
          if (updated && updated.length > 0) {
            const o = updated[0];
            try {
              const [{ data: prod }, { data: buyer }] = await Promise.all([
                supabase.from('products').select('canonical_name').eq('id', o.product_id).single(),
                supabase.from('companies').select('legal_name').eq('id', o.buyer_company_id).single(),
              ]);
              await supabase.from('notifications').insert({
                company_id: o.supplier_company_id,
                type: 'order_update',
                product_id: o.product_id,
                title: 'Pagamento confermato — spedisci l\'ordine',
                body: `Il pagamento in garanzia per l'ordine da ${buyer?.legal_name || 'un cliente BulkStrike'} (${prod?.canonical_name || 'prodotto'}) è stato incassato. Puoi procedere alla spedizione.`,
                action_label: 'Vedi ordine',
                action_url: `/ordine?id=${orderId}`,
              });
            } catch (notifyErr) {
              console.error('Notifica "pagamento confermato" non inviata (ordine comunque pagato):', notifyErr?.message);
            }
          }
        }
        break;
      }

      // ------------------------------------------------------------
      // Pagamento fallito (es. SEPA rifiutata, carta rifiutata).
      // ------------------------------------------------------------
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const orderIds = (pi.metadata?.sub_order_ids || pi.metadata?.order_id || '')
          .split(',').map((s) => s.trim()).filter(Boolean);

        for (const orderId of orderIds) {
          await supabase
            .from('payments')
            .upsert(
              {
                order_id: orderId,
                amount: pi.amount / 100,
                provider: 'stripe',
                provider_ref: pi.id,
                status: 'failed',
              },
              { onConflict: 'order_id' }
            );
        }
        // orders.status resta 'pending_payment': il buyer può riprovare
        break;
      }

      // ------------------------------------------------------------
      // Contestazione aperta lato Stripe (chargeback della banca del
      // buyer) — diversa dalla contestazione qualità (TPIA, art. 8
      // dei T&C), che parte da orders.status='disputed' via app.
      // Qui logghiamo soltanto: la gestione vera è manuale per ora.
      // ------------------------------------------------------------
      case 'charge.dispute.created': {
        const dispute = event.data.object;
        console.warn('Contestazione Stripe aperta:', dispute.id, 'charge:', dispute.charge);
        // TODO: quando esiste un pannello admin dispute, notificare qui
        break;
      }

      // ------------------------------------------------------------
      // Onboarding di un Connected Account (fornitore/corriere)
      // aggiornato — aggiorna la cache locale su companies, usata
      // per il gating preventivo (get_shipping_quotes, supplier_products).
      // ------------------------------------------------------------
      case 'account.updated': {
        const account = event.data.object;
        const active = account.charges_enabled && account.payouts_enabled;
        const status = active
          ? 'active'
          : account.requirements?.disabled_reason
            ? 'restricted'
            : 'pending';

        const { error } = await supabase
          .from('companies')
          .update({
            stripe_onboarding_status: status,
            stripe_onboarding_updated_at: new Date().toISOString(),
          })
          .eq('stripe_account_id', account.id);
        if (error) throw error;
        break;
      }

      default:
        // Eventi non gestiti: nessun errore, semplicemente ignorati
        break;
    }
  } catch (err) {
    console.error(`Errore gestendo evento Stripe ${event.type}:`, err);
    // 500 così Stripe ritenta l'invio automaticamente (retry con backoff)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ============================================================
// NOTA — come ottenere STRIPE_WEBHOOK_SECRET (da fare dopo il deploy
// di questo file, non prima: Stripe deve poter raggiungere l'URL):
//
// 1. Deploy questo file su Vercel (serve un URL pubblico raggiungibile
//    da Stripe, es. https://www.bulkstrike.com/api/webhooks/stripe)
// 2. Stripe Dashboard → Developers → Webhooks → "Add endpoint"
// 3. URL: https://www.bulkstrike.com/api/webhooks/stripe
// 4. Eventi da selezionare: payment_intent.succeeded,
//    payment_intent.payment_failed, charge.dispute.created,
//    account.updated
// 5. Dopo la creazione, Stripe mostra un "Signing secret" (whsec_...)
// 6. Quella stringa va su Vercel come nuova env var
//    STRIPE_WEBHOOK_SECRET (Sensitive, ambiente Production) — stesso
//    identico procedimento già fatto per STRIPE_SECRET_KEY
// 7. Redeploy
// ============================================================
