// ============================================================
// BulkStrike — variazione "da gennaio" (year-to-date), fonte unica condivisa.
// Dal primo dato dell'anno solare corrente all'ultimo disponibile. Usata sia
// dall'header prodotto sia dal widget Market Intelligence in home, così il
// riferimento temporale è coerente ovunque ("da gennaio", non anno-su-anno).
// Ritorna null se non ci sono dati reali sufficienti: l'UI deve NASCONDERE
// l'elemento invece di mostrare un numero finto.
// ============================================================

// series: [{ t: 'YYYY-MM-DD…', [valueKey]: number }] (ordine qualsiasi).
export function ytdChange(series, valueKey = "v") {
  if (!Array.isArray(series) || series.length < 2) return null;
  const pts = series
    .map((p) => ({ y: Number(String(p?.t).slice(0, 4)), t: String(p?.t).slice(0, 10), v: Number(p?.[valueKey]) }))
    .filter((p) => Number.isFinite(p.v) && Number.isFinite(p.y))
    .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  if (pts.length < 2) return null;
  const year = new Date().getFullYear();
  const thisYear = pts.filter((p) => p.y === year);
  const base = thisYear[0];               // primo dato dell'anno corrente (≈ gennaio)
  const last = pts[pts.length - 1];       // ultimo disponibile
  if (!base || base.v === 0 || base.t === last.t) return null;
  return ((last.v - base.v) / base.v) * 100;
}
