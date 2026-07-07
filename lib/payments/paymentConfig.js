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

// I dati dell'emittente ricevuta (nome, CF, IBAN, residenza) NON vivono più
// qui: questo modulo è importato anche da componenti client e finiva nel
// bundle JS pubblico. Ora sono in lib/payments/emittente.js (solo server,
// letti dalle env RICEVUTA_*) e arrivano alla pagina ricevuta via API admin.
