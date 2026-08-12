import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Ingest MENSILE (giorno 12) degli indici di prezzo alla produzione Eurostat
// (sts_inppd_m, mercato domestico Italia) nel NUOVO modello a indicatori:
// una riga per indicatore in market_indicators, storico in
// market_indicator_history. La lista delle serie NON e' hardcodata qui: si
// legge da market_indicators dove serie_ref->>'source' = 'eurostat' e attivo.
// Cosi' aggiungere/togliere una serie e' un UPDATE in tabella, non un deploy.
//
// Trappole Eurostat gia' verificate e rispettate:
//  - i codici NACE non hanno il punto (C2014, non C20.14): stanno gia' cosi' in serie_ref.
//  - una chiamata per serie (nace_r2 ripetuto non funziona).
//  - unit=I21 (I15/I10 sono vuoti). format=JSON (SDMX-CSV da' 400).
//  - l'ultimo dato e' marcato 'p' = provvisorio e viene REVISIONATO: upsert, non insert,
//    e flag provvisorio propagato dallo 'status' JSON-stat.
//  - la data di inizio varia per serie: si chiede sinceTimePeriod dalla serie_ref (2015-01),
//    Eurostat restituisce solo i periodi realmente disponibili.
// Protetta da x-cron-secret (deploy con verify_jwt=false).

const BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sts_inppd_m";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type SerieRef = {
  source?: string; dataset?: string; nace_r2?: string; unit?: string;
  indic_bt?: string; s_adj?: string; geo?: string; since?: string;
};

function seriesUrl(ref: SerieRef): string {
  const nace = ref.nace_r2!;
  const unit = ref.unit || "I21";
  const geo = ref.geo || "IT";
  const indic = ref.indic_bt || "PRC_PRR_DOM";
  const sadj = ref.s_adj || "NSA";
  const since = ref.since || "2015-01";
  return `${BASE}?format=JSON&lang=EN&geo=${geo}&nace_r2=${nace}&unit=${unit}` +
         `&indic_bt=${indic}&s_adj=${sadj}&sinceTimePeriod=${since}`;
}

// JSON-stat 2.0 → [{ month:'2025-01', value, provvisorio }]. Filtrando a una
// singola serie, le posizioni di `value` corrispondono a quelle della dimensione
// time. `status` mappa posizione→flag ('p' = provvisorio); puo' essere anche una
// singola stringa valida per tutte le posizioni.
function parseSeries(js: any): { month: string; value: number; provvisorio: boolean }[] {
  const idx = js?.dimension?.time?.category?.index || {};
  const posToMonth: Record<string, string> = {};
  for (const [month, pos] of Object.entries(idx)) posToMonth[String(pos)] = month;

  const status = js?.status;
  const flagAt = (pos: string): string => {
    if (status == null) return "";
    if (typeof status === "string") return status;
    if (typeof status === "object") return String((status as any)[pos] ?? "");
    return "";
  };

  const values = js?.value || {};
  const out: { month: string; value: number; provvisorio: boolean }[] = [];
  for (const [pos, val] of Object.entries(values)) {
    const month = posToMonth[String(pos)];
    if (month == null || val == null) continue;
    out.push({ month, value: Number(val), provvisorio: /p/i.test(flagAt(String(pos))) });
  }
  return out;
}

async function fetchSeries(ref: SerieRef): Promise<{ month: string; value: number; provvisorio: boolean }[]> {
  const resp = await fetch(seriesUrl(ref), { headers: { "Accept": "application/json" } });
  if (!resp.ok) throw new Error(`EUROSTAT_${ref.nace_r2}_${resp.status}`);
  return parseSeries(await resp.json());
}

Deno.serve(async (req: Request) => {
  const supaAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: cfg } = await supaAdmin.from("app_secrets").select("value").eq("key", "ingest_cron_secret").single();
  const provided = req.headers.get("x-cron-secret") || "";
  if (!cfg?.value || provided !== cfg.value) return json({ error: "FORBIDDEN" }, 403);

  try {
    const { data: indicators, error: selErr } = await supaAdmin
      .from("market_indicators")
      .select("slug, serie_ref")
      .eq("attivo", true);
    if (selErr) return json({ error: "SELECT_ERROR", detail: selErr.message }, 500);

    const eurostat = (indicators || []).filter((r: any) => (r.serie_ref?.source) === "eurostat" && r.serie_ref?.nace_r2);
    if (eurostat.length === 0) return json({ error: "NO_INDICATORS" }, 200);

    const rows: any[] = [];
    const perSlug: Record<string, number> = {};
    // Serializzate: gentili con l'endpoint pubblico Eurostat.
    for (const ind of eurostat) {
      try {
        const serie = await fetchSeries(ind.serie_ref as SerieRef);
        for (const p of serie) {
          rows.push({
            indicator_slug: ind.slug,
            ref_date: `${p.month}-01`,
            valore: p.value,
            provvisorio: p.provvisorio,
          });
        }
        perSlug[ind.slug] = serie.length;
      } catch (e) {
        perSlug[ind.slug] = -1; // serie fallita: non blocca le altre
        console.error(`[eurostat] ${ind.slug}: ${String(e)}`);
      }
    }

    if (rows.length === 0) return json({ error: "NO_DATA", perSlug }, 502);

    const { data: upserted, error } = await supaAdmin.rpc("upsert_indicator_history", { p_rows: rows });
    if (error) return json({ error: "UPSERT_ERROR", detail: error.message, rows: rows.length }, 500);
    return json({ ok: true, fonte: "Eurostat", indicatori: eurostat.length, rows: rows.length, upserted, perSlug });
  } catch (e) {
    return json({ error: "INTERNAL_ERROR", detail: String(e) }, 500);
  }
});
