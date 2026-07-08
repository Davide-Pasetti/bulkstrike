// ============================================================
// BulkStrike — Configurazione pagamenti e dati emittente ricevute
// Destinazione: lib/payments/paymentConfig.js
// ============================================================

export const PAYMENT_CONFIG = {
  // Commissione BulkStrike: 5% sul costo spedizione
  commissionRate: 0.05,

  // Soglia sub-ordine per escrow SEPA di default
  escrowThresholdEur: 10000,

  // Ritenuta d'acconto su prestazione occasionale verso azienda
  ritenutaAcconto: 0.20,

  // Marca da bollo obbligatoria sopra questa soglia (lordo)
  sogliaMarcaDaBollo: 77.47,

  // Importo bollo, a carico del committente (il corriere), aggiunto
  // al netto da bonificare — non soggetto a ritenuta d'acconto
  importoBollo: 2.00,
};

// ============================================================
// Tariffe di ELABORAZIONE PAGAMENTO del gestore (Stripe), girate in modo
// trasparente al cliente per i pagamenti in escrow. NON sono commissioni
// BulkStrike: la commissione BulkStrike (5% sulla spedizione, PAYMENT_CONFIG
// .commissionRate) è separata e invisibile al cliente.
//
// Applicate sul TOTALE ORDINE (merce + spedizione + IVA).
//   - Carta (escrow_premium): 1,5% + €0,25
//   - SEPA  (escrow_sepa):    0,8% + €0,35   (placeholder: nessun tetto massimo
//                                             per l'Italia)
//
// ⚠️ PLACEHOLDER DA CONFERMARE col dashboard Stripe ad account attivo:
//    tetto SEPA per l'Italia, eventuale maggiorazione carte extra-SEE/commerciali.
//    Aggiornare QUI e allineare i trigger SQL apply_escrow_service_fee (SEPA) e
//    apply_escrow_premium_service_fee (carta).
// ============================================================
export const STRIPE_FEES = {
  card: { rate: 0.015, fixed: 0.25, cap: null },
  sepa: { rate: 0.008, fixed: 0.35, cap: null },
};

// enum ordine (payment_method) → tipo tariffa Stripe ('card' | 'sepa' | null)
export function escrowMethodKind(paymentMethod) {
  if (paymentMethod === 'escrow_premium') return 'card';
  if (paymentMethod === 'escrow_sepa') return 'sepa';
  return null;
}

// Costo di elaborazione pagamento sul totale ordine (IVA inclusa).
// Restituisce 0 per metodi non-escrow (es. bonifico) o importi non validi.
export function stripeProcessingFee(kind, grossTotal) {
  const f = STRIPE_FEES[kind];
  if (!f || !(grossTotal > 0)) return 0;
  let fee = grossTotal * f.rate + f.fixed;
  if (f.cap != null) fee = Math.min(fee, f.cap);
  return Math.round(fee * 100) / 100;
}

// I dati dell'emittente ricevuta (nome, CF, IBAN, residenza) NON vivono più
// qui: questo modulo è importato anche da componenti client e finiva nel
// bundle JS pubblico. Ora sono in lib/payments/emittente.js (solo server,
// letti dalle env RICEVUTA_*) e arrivano alla pagina ricevuta via API admin.
