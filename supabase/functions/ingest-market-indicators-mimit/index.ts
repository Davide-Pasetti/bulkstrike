import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Ingest GIORNALIERO del MIMIT Osservaprezzi carburanti nel modello a indicatori
// (market_indicators dove serie_ref->>'source'='mimit'). Due CSV per singolo
// impianto, separatore PIPE '|' (cambiato il 10/02/2026):
//   prezzo_alle_8.csv: idImpianto|descCarburante|prezzo|isSelf|dtComu
//   anagrafica_impianti_attivi.csv: idImpianto|...|Tipo Impianto|...
// Media nazionale self-service (isSelf=1) esclusi gli impianti autostradali
// (Tipo Impianto = 'Autostradale' dall'anagrafica). Lo snapshot e' giornaliero e
// senza storico: si salva il punto del giorno in un canale laterale (piazza='giorno')
// e si ricalcola la HEADLINE settimanale (piazza null, lunedi' della settimana ISO)
// come media dei giorni della settimana — curva leggibile. Licenza IODL 2.0.
// Protetta da x-cron-secret (deploy con verify_jwt=false).

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

function headerIndex(lines) {
  for (let i = 0; i < Math.min(lines.length, 8); i++) if (lines[i].toLowerCase().includes("idimpianto")) return i;
  return -1;
}

function parsePrice(s) {
  let x = String(s || "").trim();
  if (x.includes(",") && !x.includes(".")) x = x.split(",").join(".");
  const v = parseFloat(x);
  return isFinite(v) ? v : null;
}

// lunedi' della settimana ISO di una data YYYY-MM-DD
function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunedi'
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
    const aLines = aTxt.split("\n");
    const ah = headerIndex(aLines);
    const acols = aLines[ah].split("|");
    const iTipo = acols.findIndex((c) => c.toLowerCase().includes("tipo impianto"));
    const highway = new Set();
    for (let i = ah + 1; i < aLines.length; i++) {
      const f = aLines[i].split("|");
      if (f.length < acols.length) continue;
      if ((f[iTipo] || "").trim().toLowerCase() === "autostradale") highway.add((f[0] || "").trim());
    }

    // 2) prezzo -> media per carburante (self, non autostradale)
    const pTxt = await getCsv(PREZZO);
    const pLines = pTxt.split("\n");
    // riga 0: 'Estrazione del YYYY-MM-DD' -> prendi l'ultimo token che sembra una data
    const tok = pLines[0].trim().split(" ").pop() || "";
    const refDate = (tok.length === 10 && tok[4] === "-" && tok[7] === "-") ? tok : new Date().toISOString().slice(0, 10);
    const ph = headerIndex(pLines);
    const pcols = pLines[ph].split("|");
    const iDesc = pcols.findIndex((c) => c.toLowerCase().includes("desccarburante"));
    const iPrezzo = pcols.findIndex((c) => c.toLowerCase() === "prezzo");
    const iSelf = pcols.findIndex((c) => c.toLowerCase().includes("isself"));

    const agg = {}; // slug -> {sum,count}
    for (let i = ph + 1; i < pLines.length; i++) {
      const f = pLines[i].split("|");
      if (f.length < pcols.length) continue;
      if ((f[iSelf] || "").trim() !== "1") continue;                 // solo self-service
      const id = (f[0] || "").trim();
      if (highway.has(id)) continue;                                  // no autostradali
      const ind = byDesc[(f[iDesc] || "").trim()];
      if (!ind) continue;                                             // solo i 3 carburanti base
      const p = parsePrice(f[iPrezzo]);
      if (p == null || p < 0.3 || p > 5) continue;                    // scarta valori assurdi
      const a = agg[ind.slug] || (agg[ind.slug] = { sum: 0, count: 0 });
      a.sum += p; a.count += 1;
    }

    // 3) upsert dei punti GIORNALIERI (canale laterale piazza='giorno')
    const dailyRows = [];
    const todayAvg = {};
    for (const ind of mimit) {
      const a = agg[ind.slug];
      if (!a || a.count === 0) continue;
      const avg = Math.round((a.sum / a.count) * 1000) / 1000;
      todayAvg[ind.slug] = { avg, n: a.count };
      dailyRows.push({ indicator_slug: ind.slug, ref_date: refDate, piazza: "giorno", valore: avg });
    }
    if (dailyRows.length === 0) return json({ error: "NO_DATA", refDate }, 200);
    const { error: dErr } = await supaAdmin.rpc("upsert_indicator_history", { p_rows: dailyRows });
    if (dErr) return json({ error: "UPSERT_DAILY_ERROR", detail: dErr.message }, 500);

    // 4) ricalcola la HEADLINE settimanale (media dei giorni della settimana ISO)
    const monday = mondayOf(refDate);
    const sunday = addDays(monday, 6);
    const idToSlug = {};
    for (const ind of mimit) idToSlug[ind.id] = ind.slug;
    const { data: weekDaily, error: rErr } = await supaAdmin
      .from("market_indicator_history")
      .select("indicator_id, valore")
      .eq("piazza", "giorno").gte("ref_date", monday).lte("ref_date", sunday)
      .in("indicator_id", mimit.map((m) => m.id));
    if (rErr) return json({ error: "READ_WEEK_ERROR", detail: rErr.message }, 500);
    const wk = {};
    for (const row of weekDaily || []) {
      const slug = idToSlug[row.indicator_id]; if (!slug) continue;
      const w = wk[slug] || (wk[slug] = { sum: 0, count: 0 });
      w.sum += Number(row.valore); w.count += 1;
    }
    const headRows = [];
    for (const [slug, w] of Object.entries(wk)) {
      headRows.push({ indicator_slug: slug, ref_date: monday, ref_date_end: sunday, valore: Math.round((w.sum / w.count) * 1000) / 1000 });
    }
    let upserted = 0;
    if (headRows.length) {
      const { data: u, error: hErr } = await supaAdmin.rpc("upsert_indicator_history", { p_rows: headRows });
      if (hErr) return json({ error: "UPSERT_HEAD_ERROR", detail: hErr.message }, 500);
      upserted = u;
    }

    return json({ ok: true, fonte: "MIMIT", refDate, week: monday, stazioniAutostradali: highway.size, todayAvg, headline: headRows, upserted });
  } catch (e) {
    return json({ error: "INTERNAL_ERROR", detail: String(e) }, 500);
  }
});
