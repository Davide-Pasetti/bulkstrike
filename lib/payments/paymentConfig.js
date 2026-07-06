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

// Dati emittente ricevuta (regime transitorio: prestazione occasionale)
// TODO tra ~1 anno: sostituire con dati fatturazione BulkStrike S.r.l. + SDI
export const RICEVUTA_EMITTENTE = {
  nome: 'Davide Pasetti',
  natoA: 'Pescara',
  natoIl: '26/04/1988',
  residenza: 'Corso Vittorio Emanuele 269, 65122 Pescara (PE)',
  codiceFiscale: 'PSTDVD88D26G482A',
  // IBAN personale su cui ricevere i netti dai corrieri:
  iban: 'IT19C0367401600002185278111',
};
