// Backfill UNA TANTUM dello storico MIMIT Osservaprezzi carburanti per gli
// indicatori mimit-benzina / mimit-gasolio / mimit-gpl, dall'archivio trimestrale
// pubblico (2015-Q1 in poi). Il job settimanale esistente continua ad aggiungere
// da solo le settimane successive: questo script non va messo in cron.
//
//   node scripts/backfill-mimit-storico.mjs --da 2015-1 --a 2026-2 [--dry-run]
//                                           [--solo-trimestre 2015-1] [--verbose]
//
// Richiede NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nell'ambiente
// (o in .env.local). Senza --dry-run scrive su market_indicator_history via la
// RPC upsert_indicator_history, la stessa usata dal job giornaliero.
//
// Scelte, e perche':
//  - PREZZI: si scarica l'intero tar del trimestre (~46 MB) perche' servono tutti
//    i giorni.
//  - ANAGRAFICA: il tar pesa 85-107 MB ma serve solo l'elenco degli impianti
//    autostradali, che cambia lentissimamente. Si scarica quindi via HTTP Range
//    solo l'inizio dell'archivio e si usa il PRIMO CSV giornaliero del trimestre
//    per tutto il trimestre (~4 MB invece di ~95). E' l'unica semplificazione
//    rispetto al giornaliero, che usa l'anagrafica del giorno stesso.
//  - Le settimane gia' presenti a DB non vengono toccate: la settimana in corso
//    e' del job giornaliero, che la sta ancora riempiendo giorno per giorno.
//  - Le settimane a cavallo di due trimestri vengono unite prima di scrivere,
//    cosi' la media e' su tutti i 7 giorni e non su due mezze settimane.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseHighwaySet, dailyAveragesByDesc, mondayOf, weekRow } from "../supabase/functions/_shared/mimit-agg.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "https://opendatacarburanti.mise.gov.it/categorized";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const ANAG_PEEK_BYTES = 6_000_000; // basta per il primo CSV dell'anagrafica

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] || true) : d; };
const DRY = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose");

// --- env ---------------------------------------------------------------
function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(__dirname, "..", f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();
// In dry-run si legge soltanto (indicatori e settimane gia' presenti sono dati
// pubblici, gli stessi che la pagina /andamento-prezzi mostra all'anonimo):
// basta la chiave pubblica. La service role key serve solo per SCRIVERE, e va
// passata nell'ambiente al momento dell'esecuzione, non messa in .env.local.
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || (DRY ? (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) : null);
if (!SUPA_URL || !SUPA_KEY) {
  console.error(DRY
    ? "Serve NEXT_PUBLIC_SUPABASE_URL e una chiave (anon basta per il dry-run)."
    : "Per scrivere serve SUPABASE_SERVICE_ROLE_KEY nell'ambiente:\n" +
      "  $env:SUPABASE_SERVICE_ROLE_KEY='...'; node scripts/backfill-mimit-storico.mjs ...");
  process.exit(1);
}
const supa = createClient(SUPA_URL, SUPA_KEY);

// --- tar in memoria ----------------------------------------------------
// I tar trimestrali cambiano struttura interna negli anni
// (2015: ftproot/osservaprezzi/copied/..., dal 2025: ./ANNO_T_tr/...):
// i file si riconoscono dal NOME, mai dal percorso.
function* tarEntries(buf) {
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = buf.subarray(off, off + 100).toString("utf8").replace(/\0.*$/, "");
    if (!name) break;
    const size = parseInt(buf.subarray(off + 124, off + 136).toString("utf8").replace(/\0.*$/, "").trim(), 8) || 0;
    const start = off + 512;
    if (start + size <= buf.length) yield { name: path.basename(name), body: buf.subarray(start, start + size) };
    off = start + Math.ceil(size / 512) * 512;
  }
}

async function fetchBuf(url, rangeBytes = null) {
  const headers = { "User-Agent": UA, "Accept-Encoding": "identity" };
  if (rangeBytes) headers["Range"] = `bytes=0-${rangeBytes}`;
  const r = await fetch(url, { headers });
  if (!r.ok && r.status !== 206) throw new Error(`HTTP_${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

function gunzipTollerante(gz) {
  try { return zlib.gunzipSync(gz); } catch {
    // download troncato di proposito (Range): si tiene quello che si e' potuto inflare
    try { return zlib.gunzipSync(gz, { finishFlush: zlib.constants.Z_SYNC_FLUSH }); } catch { return Buffer.alloc(0); }
  }
}

// --- indicatori --------------------------------------------------------
async function getIndicatori() {
  const { data, error } = await supa.from("market_indicators").select("id, slug, serie_ref").eq("attivo", true);
  if (error) throw new Error(`SELECT_INDICATORI: ${error.message}`);
  const mimit = (data || []).filter((r) => r.serie_ref?.source === "mimit" && r.serie_ref?.desc);
  const byDesc = {};
  for (const ind of mimit) byDesc[String(ind.serie_ref.desc).trim()] = ind;
  return { mimit, byDesc };
}

async function settimaneGiaPresenti(mimit) {
  const { data, error } = await supa
    .from("market_indicator_history")
    .select("indicator_id, ref_date")
    .in("indicator_id", mimit.map((m) => m.id))
    .is("piazza", null).is("variante", null);
  if (error) throw new Error(`SELECT_STORICO: ${error.message}`);
  const idToSlug = Object.fromEntries(mimit.map((m) => [m.id, m.slug]));
  return new Set((data || []).map((r) => `${idToSlug[r.indicator_id]}|${r.ref_date}`));
}

// --- un trimestre ------------------------------------------------------
async function elaboraTrimestre(anno, tr, byDesc) {
  const nome = `${anno}_${tr}_tr.tar.gz`;
  const anagBuf = gunzipTollerante(await fetchBuf(`${BASE}/anagrafica_impianti_attivi/${anno}/${nome}`, ANAG_PEEK_BYTES));
  let highway = null;
  for (const e of tarEntries(anagBuf)) {
    if (!/^anagrafica_impianti_attivi-\d{8}\.csv$/i.test(e.name)) continue;
    highway = parseHighwaySet(e.body.toString("latin1"));
    if (VERBOSE) console.log(`   anagrafica da ${e.name}: ${highway.size} impianti autostradali`);
    break;
  }
  if (!highway) throw new Error(`ANAGRAFICA_NON_LETTA ${anno}-${tr}`);

  const prezziBuf = gunzipTollerante(await fetchBuf(`${BASE}/prezzo_alle_8/${anno}/${nome}`));
  const perGiorno = {}; // 'YYYY-MM-DD' -> { slug: media }
  let letti = 0, vuoti = 0, errori = 0;
  for (const e of tarEntries(prezziBuf)) {
    const m = e.name.match(/^prezzo_alle_8-(\d{4})(\d{2})(\d{2})\.csv$/i);
    if (!m) continue;
    const giorno = `${m[1]}-${m[2]}-${m[3]}`;   // data dal NOME file: nei file 2015 manca la riga "Estrazione del"
    // Alcuni giorni sono pubblicati a 0 byte dal MIMIT (es. 14 e 15/01/2015):
    // sono buchi della fonte, non errori di parsing.
    if (e.body.length === 0) { vuoti++; continue; }
    try {
      const avg = dailyAveragesByDesc(e.body.toString("latin1"), byDesc, highway);
      if (Object.keys(avg).length) { perGiorno[giorno] = avg; letti++; }
    } catch (err) {
      errori++;
      // Alcuni giorni sono pubblicati guasti: il file contiene solo la riga
      // "Estrazione del ..." ripetuta, senza header ne' dati (es. 20/02/2021).
      const guasto = err.message === "PREZZI_HEADER_NOT_FOUND";
      console.warn(`   ! ${e.name}: ${guasto ? "file guasto alla fonte (nessun header)" : err.message}`);
    }
  }
  return { perGiorno, giorniLetti: letti, vuoti, errori };
}

// --- main --------------------------------------------------------------
function trimestriDa(da, a) {
  const [ay, aq] = da.split("-").map(Number);
  const [by, bq] = a.split("-").map(Number);
  const out = [];
  for (let y = ay; y <= by; y++) {
    for (let q = 1; q <= 4; q++) {
      if (y === ay && q < aq) continue;
      if (y === by && q > bq) continue;
      out.push([y, q]);
    }
  }
  return out;
}

const solo = flag("--solo-trimestre");
const lista = solo ? [solo.split("-").map(Number)] : trimestriDa(String(flag("--da", "2015-1")), String(flag("--a", "2026-2")));

const { mimit, byDesc } = await getIndicatori();
if (!mimit.length) { console.error("Nessun indicatore MIMIT attivo."); process.exit(1); }
console.log(`Indicatori: ${mimit.map((m) => `${m.slug} <- "${m.serie_ref.desc}"`).join(", ")}`);
const giaPresenti = await settimaneGiaPresenti(mimit);
console.log(`Settimane gia' a DB (non verranno toccate): ${giaPresenti.size}`);
console.log(`Trimestri da elaborare: ${lista.length}${DRY ? "  [DRY-RUN: nessuna scrittura]" : ""}\n`);

// giorni accumulati su tutti i trimestri: le settimane a cavallo si uniscono
const giorniPerSlug = {}; // slug -> { 'YYYY-MM-DD': valore }
let trimestriOk = 0, trimestriKo = 0, giorniVuotiTot = 0;

for (const [anno, tr] of lista) {
  const t0 = Date.now();
  process.stdout.write(`[${anno}-Q${tr}] `);
  try {
    const { perGiorno, giorniLetti, vuoti, errori } = await elaboraTrimestre(anno, tr, byDesc);
    for (const [giorno, avg] of Object.entries(perGiorno)) {
      for (const [slug, v] of Object.entries(avg)) {
        (giorniPerSlug[slug] || (giorniPerSlug[slug] = {}))[giorno] = v;
      }
    }
    trimestriOk++;
    giorniVuotiTot += vuoti;
    console.log(`${giorniLetti} giorni${vuoti ? `, ${vuoti} vuoti alla fonte` : ""}${errori ? `, ${errori} errori` : ""}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (e) {
    trimestriKo++;
    console.log(`ERRORE: ${e.message}`);
  }
}

// giorni -> settimane ISO, con la stessa media del job giornaliero
const righe = [];
const saltate = [];
for (const [slug, giorni] of Object.entries(giorniPerSlug)) {
  const perSettimana = {};
  for (const [giorno, v] of Object.entries(giorni)) {
    const lun = mondayOf(giorno);
    (perSettimana[lun] || (perSettimana[lun] = {}))[giorno] = v;
  }
  for (const [lun, days] of Object.entries(perSettimana)) {
    if (giaPresenti.has(`${slug}|${lun}`)) { saltate.push(`${slug}|${lun}`); continue; }
    const r = weekRow(slug, lun, days);
    if (r) righe.push(r);
  }
}
righe.sort((a, b) => (a.ref_date < b.ref_date ? -1 : a.ref_date > b.ref_date ? 1 : 0));

console.log(`\nTrimestri: ${trimestriOk} ok, ${trimestriKo} falliti${giorniVuotiTot ? `, ${giorniVuotiTot} giorni pubblicati vuoti dal MIMIT` : ""}`);
console.log(`Settimane da scrivere: ${righe.length}  (saltate perche' gia' a DB: ${saltate.length})`);
if (righe.length) {
  const p = righe[0], u = righe[righe.length - 1];
  console.log(`Periodo: ${p.ref_date} -> ${u.ref_date_end}`);
  for (const slug of Object.keys(giorniPerSlug)) {
    const rs = righe.filter((r) => r.indicator_slug === slug);
    if (!rs.length) continue;
    const vals = rs.map((r) => r.valore);
    console.log(`  ${slug}: ${rs.length} settimane, min ${Math.min(...vals)} max ${Math.max(...vals)}, ` +
      `prima ${rs[0].ref_date}=${rs[0].valore} ultima ${rs[rs.length - 1].ref_date}=${rs[rs.length - 1].valore}`);
  }
}

if (DRY) {
  const out = path.join(__dirname, "..", "backfill-mimit-anteprima.json");
  fs.writeFileSync(out, JSON.stringify(righe, null, 1));
  console.log(`\nDRY-RUN: nulla scritto a DB. Anteprima in ${out}`);
  process.exit(0);
}

let scritte = 0;
for (let i = 0; i < righe.length; i += 200) {
  const chunk = righe.slice(i, i + 200);
  const { data, error } = await supa.rpc("upsert_indicator_history", { p_rows: chunk });
  if (error) { console.error(`UPSERT_ERRORE al blocco ${i}: ${error.message}`); process.exit(1); }
  scritte += Number(data) || 0;
  process.stdout.write(`\rScritte ${scritte}/${righe.length}`);
}
console.log(`\nFatto: ${scritte} righe settimanali su market_indicator_history.`);
