// Parsing e aggregazione dei CSV MIMIT Osservaprezzi carburanti, condivisi tra:
//   - ingest-market-indicators-mimit  (edge function, snapshot giornaliero)
//   - scripts/backfill-mimit-storico.mjs (backfill una tantum dall'archivio trimestrale)
// JavaScript puro senza import: gira sia su Deno sia su Node.
//
// L'archivio storico non ha lo stesso formato del file corrente. Varianti viste
// scaricando i trimestri reali (2015_1, 2025_4, 2026_1):
//   - separatore ';' fino al 09/02/2026, '|' dal 10/02/2026 (dichiarato nei
//     metadati MIMIT). I tar trimestrali sono rigenerati al momento della
//     pubblicazione, quindi 2026_1 usa '|' anche per i giorni di gennaio: il
//     separatore va RILEVATO per file, mai dedotto dalla data.
//   - riga "Estrazione del YYYY-MM-DD" presente dal 2025, assente nel 2015.
//   - header anagrafica "Id impianto" (con spazio) nel 2015, "idImpianto" oggi.
// Tutte e tre sono gestite qui, così il giornaliero e il backfill si comportano
// allo stesso modo su qualunque file.

// Separatore di colonna del file: si conta sulla riga di header, non si assume.
export function detectSep(headerLine) {
  const pipe = (headerLine.match(/\|/g) || []).length;
  const semi = (headerLine.match(/;/g) || []).length;
  return pipe >= semi && pipe > 0 ? "|" : ";";
}

// Indice della riga di header: la prima (tra le prime 8) che nomina l'id impianto.
// Gli spazi sono ignorati per accettare anche "Id impianto" dei file 2015.
export function headerIndex(lines) {
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    if (lines[i].toLowerCase().replace(/\s+/g, "").includes("idimpianto")) return i;
  }
  return -1;
}

export function parsePrice(s) {
  let x = String(s || "").trim();
  if (x.includes(",") && !x.includes(".")) x = x.split(",").join(".");
  const v = parseFloat(x);
  return isFinite(v) ? v : null;
}

// lunedi' della settimana ISO di una data YYYY-MM-DD
export function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunedi'
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Anagrafica impianti -> Set degli idImpianto autostradali (da escludere).
// "Autostradale" e' l'unico valore stabile nel tempo: nel 2015 gli altri erano
// "Altro"/"Strada Statale", oggi sono "Stradale", ma gli autostradali si sono
// sempre chiamati cosi' (verificato sull'anagrafica 2015: 461 su 19.690).
export function parseHighwaySet(text) {
  const lines = text.split("\n");
  const h = headerIndex(lines);
  if (h < 0) throw new Error("ANAG_HEADER_NOT_FOUND");
  const sep = detectSep(lines[h]);
  const cols = lines[h].split(sep);
  const iTipo = cols.findIndex((c) => c.toLowerCase().includes("tipo impianto"));
  if (iTipo < 0) throw new Error("ANAG_TIPO_IMPIANTO_NOT_FOUND");
  const highway = new Set();
  for (let i = h + 1; i < lines.length; i++) {
    const f = lines[i].split(sep);
    if (f.length < cols.length) continue;
    if ((f[iTipo] || "").trim().toLowerCase() === "autostradale") highway.add((f[0] || "").trim());
  }
  return highway;
}

// Prezzi di un giorno -> media nazionale per indicatore.
// byDesc: { "<descCarburante esatto>": { slug } } — solo i carburanti mappati.
// Filtro identico al giornaliero: isSelf=1, niente autostradali, prezzi 0.3–5.
export function dailyAveragesByDesc(text, byDesc, highway) {
  const lines = text.split("\n");
  const h = headerIndex(lines);
  if (h < 0) throw new Error("PREZZI_HEADER_NOT_FOUND");
  const sep = detectSep(lines[h]);
  const cols = lines[h].split(sep);
  const iDesc = cols.findIndex((c) => c.toLowerCase().includes("desccarburante"));
  const iPrezzo = cols.findIndex((c) => c.toLowerCase().trim() === "prezzo");
  const iSelf = cols.findIndex((c) => c.toLowerCase().includes("isself"));
  if (iDesc < 0 || iPrezzo < 0 || iSelf < 0) throw new Error("PREZZI_COLONNE_MANCANTI");

  const agg = {}; // slug -> {sum,count}
  for (let i = h + 1; i < lines.length; i++) {
    const f = lines[i].split(sep);
    if (f.length < cols.length) continue;
    if ((f[iSelf] || "").trim() !== "1") continue;      // solo self-service
    const id = (f[0] || "").trim();
    if (highway.has(id)) continue;                       // no autostradali
    const ind = byDesc[(f[iDesc] || "").trim()];
    if (!ind) continue;                                  // solo i carburanti mappati
    const p = parsePrice(f[iPrezzo]);
    if (p == null || p < 0.3 || p > 5) continue;         // scarta valori assurdi
    const a = agg[ind.slug] || (agg[ind.slug] = { sum: 0, count: 0 });
    a.sum += p; a.count += 1;
  }
  const out = {};
  for (const slug of Object.keys(agg)) {
    const a = agg[slug];
    if (a.count > 0) out[slug] = Math.round((a.sum / a.count) * 1000) / 1000;
  }
  return out;
}

// Media settimanale a partire dai giorni della settimana: e' l'aggregazione
// usata dal giornaliero (che accumula raw.days run dopo run) e dal backfill
// (che ha gia' tutti i giorni del trimestre). Stessa semantica e stessa forma
// della riga: media aritmetica dei giorni disponibili, giorni dentro raw.days.
export function weekRow(slug, monday, days) {
  const vals = Object.values(days).map(Number).filter((v) => isFinite(v));
  if (!vals.length) return null;
  const avg = Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 1000) / 1000;
  return { indicator_slug: slug, ref_date: monday, ref_date_end: addDays(monday, 6), valore: avg, raw: { days } };
}
