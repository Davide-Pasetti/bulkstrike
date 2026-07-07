// ============================================================
// BulkStrike — Dati emittente ricevute (SOLO SERVER)
//
// ATTENZIONE: non importare questo modulo da componenti client
// ('use client') o da codice che finisce nel bundle browser.
// Contiene dati personali/finanziari (CF, IBAN) letti dalle env:
//   RICEVUTA_NOME, RICEVUTA_NATO_A, RICEVUTA_NATO_IL,
//   RICEVUTA_RESIDENZA, RICEVUTA_CODICE_FISCALE, RICEVUTA_IBAN
//
// Regime transitorio: prestazione occasionale.
// TODO tra ~1 anno: sostituire con dati fatturazione BulkStrike S.r.l. + SDI
// ============================================================

export function getRicevutaEmittente() {
  const emittente = {
    nome: process.env.RICEVUTA_NOME ?? null,
    natoA: process.env.RICEVUTA_NATO_A ?? null,
    natoIl: process.env.RICEVUTA_NATO_IL ?? null,
    residenza: process.env.RICEVUTA_RESIDENZA ?? null,
    codiceFiscale: process.env.RICEVUTA_CODICE_FISCALE ?? null,
    iban: process.env.RICEVUTA_IBAN ?? null,
  };
  const completo = Object.values(emittente).every(Boolean);
  return { ...emittente, completo };
}
