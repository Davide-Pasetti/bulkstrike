// Scaglioni di volume (prezzo tetto) — UNICA fonte condivisa tra la pagina di
// dettaglio asta (BulkStrikePool) e la card nella lista aste (BulkStrikePoolList),
// così il calcolo "prossimo scaglione" non viene duplicato.
// Confine: raggiungere la soglia di una fascia (il suo .max) sblocca la fascia
// successiva → confronto "vol < max" (equivalente a "vol >= soglia").
export const TIERS = [
  { max: 5000, price: 2.80, label: "1–5 t" },
  { max: 20000, price: 2.55, label: "5–20 t" },
  { max: 50000, price: 2.30, label: "20–50 t" },
  { max: Infinity, price: 2.10, label: "50 t+" },
];

export function tierIndexFor(vol) {
  for (let i = 0; i < TIERS.length; i++) if (vol < TIERS[i].max) return i;
  return TIERS.length - 1;
}
export function tierFor(vol) { return TIERS[tierIndexFor(vol)]; }
export function tierCeiling(vol) { return tierFor(vol).price; }

// Quanto manca al volume `vol` per sbloccare lo scaglione successivo, e a quale
// tetto. Restituisce null se è già all'ultimo scaglione (nessun tetto più basso).
export function nextTierGap(vol) {
  const t = TIERS[tierIndexFor(vol)];
  if (t.max === Infinity) return null;
  return { gap: Math.max(0, t.max - vol), nextPrice: tierFor(t.max).price };
}
