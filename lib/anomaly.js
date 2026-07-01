// lib/anomaly.js
// Confronto PURAMENTE INFORMATIVO tra il prezzo offerto e il riferimento di
// mercato. NON è un prezzo minimo, né consigliato, né un limite: serve solo a
// decidere se mostrare un avviso. Il fornitore resta libero di offrire qualsiasi
// cifra e di procedere comunque. La piattaforma non fissa e non vincola i prezzi.
// Soglie di SOLO AVVISO, regolabili: avviso al 15% sotto, avviso forte al 30% sotto.
export const ANOMALY_WARN_PCT = 15;
export const ANOMALY_HIGH_PCT = 30;

export function assessPriceAnomaly(price, reference) {
  if (reference == null || reference <= 0 || price == null) {
    return { anomalous: false, deltaPct: 0, severity: "none" };
  }
  const deltaPct = Math.round(((reference - price) / reference) * 1000) / 10; // 1 decimale
  if (deltaPct >= ANOMALY_HIGH_PCT) return { anomalous: true, deltaPct, severity: "high" };
  if (deltaPct >= ANOMALY_WARN_PCT) return { anomalous: true, deltaPct, severity: "medium" };
  return { anomalous: false, deltaPct, severity: "none" };
}
