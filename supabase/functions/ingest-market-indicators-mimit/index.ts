import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
// Parsing e aggregazione condivisi con il backfill storico
// (scripts/backfill-mimit-storico.mjs): unica implementazione del filtro
// self/non-autostradale e della media settimanale.
import { parseHighwaySet, dailyAveragesByDesc, mondayOf, weekRow } from "../_shared/mimit-agg.js";

// Ingest GIORNALIERO del MIMIT Osservaprezzi carburanti nel modello a indicatori
// (market_indicators dove serie_ref->>'source'='mimit'). Due CSV per singolo
// impianto; il separatore e' rilevato dal file ('|' dal 10/02/2026, prima ';'):
//   prezzo_alle_8.csv: idImpianto|descCarburante|prezzo|isSelf|dtComu
//   anagrafica_impianti_attivi.csv: idImpianto|...|Tipo Impianto|...
// Media nazionale self-service (isSelf=1) esclusi gli impianti autostradali
// (Tipo Impianto = 'Autostradale' dall'anagrafica). Lo snapshot e' giornaliero e
// senza storico: NON si persiste il dato giornaliero come serie. Si scrive solo
// UNA riga per settimana ISO (lunedi'->domenica); la media settimanale e'
// progressiva e vive dentro raw.days {data: valore} della riga stessa. Ogni run
// giornaliero aggiorna il valore del giorno (idempotente) e ricalcola la media.
// Licenza IODL 2.0. Protetta da x-cron-secret (deploy con verify_jwt=false).

const PREZZO = "https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv";
const ANAG = "https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const H = { "Accept": "text/csv,*/*", "Accept-Encoding": "identity", "User-Agent": UA };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function getCsv(url) {
  const resp = await fetch(url, { headers: H });
  if (!resp.ok) throw new Error(`MIMIT_${resp.status}_${url}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  return new TextDecoder("latin1").decode(buf); // MIMIT usa Windows-1252
}

Deno.serve(async (req) => {
  const supaAdmin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: cfg } = await supaAdmin.from("app_secrets").select("value").eq("key", "ingest_cron_secret").single();
  if (!cfg?.value || (req.headers.get("x-cron-secret") || "") !== cfg.value) return json({ error: "FORBIDDEN" }, 403);

  try {
    const { data: inds, error: selErr } = await supaAdmin
      .from("market_indicators").select("id, slug, serie_ref").eq("attivo", true);
    if (selErr) return json({ error: "SELECT_ERROR", detail: selErr.message }, 500);
    const mimit = (inds || []).filter((r) => r.serie_ref?.source === "mimit" && r.serie_ref?.desc);
    if (mimit.length === 0) return json({ error: "NO_INDICATORS" }, 200);
    // desc esatto -> indicatore
    const byDesc = {};
    for (const ind of mimit) byDesc[String(ind.serie_ref.desc).trim()] = ind;

    // 1) anagrafica -> set impianti autostradali
    const aTxt = await getCsv(ANAG);
    const highway = parseHighwaySet(aTxt);

    // 2) prezzo -> media nazionale del giorno per carburante (self, non autostradale)
    const pTxt = await getCsv(PREZZO);
    const pLines = pTxt.split("\n");
    // riga 0: 'Estrazione del YYYY-MM-DD' -> prendi l'ultimo token che sembra una data
    const tok = pLines[0].trim().split(" ").pop() || "";
    const refDate = (tok.length === 10 && tok[4] === "-" && tok[7] === "-") ? tok : new Date().toISOString().slice(0, 10);
    const todayAvg = dailyAveragesByDesc(pTxt, byDesc, highway);
    if (Object.keys(todayAvg).length === 0) return json({ error: "NO_DATA", refDate }, 200);

    // 4) NIENTE riga giornaliera: si scrive SOLO la riga SETTIMANALE (lunedi'->
    // domenica). La media della settimana e' progressiva e vive dentro raw.days
    // {data: valore} della singola riga della settimana. Ogni giorno si legge la
    // riga esistente, si aggiorna il valore del giorno (idempotente: ri-eseguire
    // lo stesso giorno sovrascrive) e si ricalcola la media. Cosi' non si persiste
    // il dato giornaliero come serie, solo la settimanale (come da specifica).
    const monday = mondayOf(refDate);
    const idToSlug = {};
    for (const ind of mimit) idToSlug[ind.id] = ind.slug;
    const { data: existing, error: rErr } = await supaAdmin
      .from("market_indicator_history")
      .select("indicator_id, raw")
      .is("piazza", null).is("variante", null).eq("ref_date", monday)
      .in("indicator_id", mimit.map((m) => m.id));
    if (rErr) return json({ error: "READ_WEEK_ERROR", detail: rErr.message }, 500);
    const prevDays = {};
    for (const row of existing || []) {
      const slug = idToSlug[row.indicator_id];
      if (slug) prevDays[slug] = (row.raw && row.raw.days) ? row.raw.days : {};
    }

    const headRows = [];
    for (const ind of mimit) {
      const avg = todayAvg[ind.slug];
      if (avg == null) continue;
      const days = { ...(prevDays[ind.slug] || {}) };
      days[refDate] = avg;                                  // aggiorna/aggiunge il giorno
      const row = weekRow(ind.slug, monday, days);           // stessa media del backfill
      if (row) headRows.push(row);
    }
    const { data: upserted, error: hErr } = await supaAdmin.rpc("upsert_indicator_history", { p_rows: headRows });
    if (hErr) return json({ error: "UPSERT_HEAD_ERROR", detail: hErr.message }, 500);

    return json({ ok: true, fonte: "MIMIT", refDate, week: monday, stazioniAutostradali: highway.size, todayAvg, headline: headRows.map(r => ({ slug: r.indicator_slug, valore: r.valore, giorni: Object.keys(r.raw.days).length })), upserted });
  } catch (e) {
    return json({ error: "INTERNAL_ERROR", detail: String(e) }, 500);
  }
});
