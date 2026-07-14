import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Ingest MENSILE degli indici di prezzo alla produzione Eurostat (sts_inppd_m,
// mercato domestico, Italia) per i settori NACE mappati sui prodotti:
//   C241  = ferro/acciaio/ferroleghe (siderurgici)
//   C244  = metalli di base preziosi e altri non ferrosi (rame/allumini/zinco/…)
//   C2016 = materie plastiche in forme primarie (resine grezze)
//   C20   = prodotti chimici
// Sono INDICI DI TENDENZA (2021=100 + var. % YoY), NON prezzi EUR/kg per prodotto.
// L'API Eurostat è pubblica, JSON-stat, senza chiave e con catena TLS valida.
// Protetta da x-cron-secret (verify_jwt=false lato deploy).

const BASE = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sts_inppd_m";
const FONTE_URL = "https://ec.europa.eu/eurostat/databrowser/product/view/sts_inppd_m";

const NACE: { code: string; label: string }[] = [
  { code: "C241",  label: "Fabbricazione di ferro, acciaio e ferroleghe — PPI mercato domestico Italia (Eurostat)" },
  { code: "C244",  label: "Metalli di base preziosi e altri non ferrosi — PPI mercato domestico Italia (Eurostat)" },
  { code: "C2016", label: "Materie plastiche in forme primarie — PPI mercato domestico Italia (Eurostat)" },
  { code: "C20",   label: "Prodotti chimici — PPI mercato domestico Italia (Eurostat)" },
  { code: "C10",   label: "Industria alimentare — PPI mercato domestico Italia (Eurostat)" },
  { code: "C19",   label: "Coke e prodotti petroliferi raffinati (lubrificanti/combustibili) — PPI mercato domestico Italia (Eurostat)" },
  { code: "C21",   label: "Prodotti farmaceutici di base e preparati farmaceutici — PPI mercato domestico Italia (Eurostat)" },
  { code: "C23",   label: "Altri prodotti della lavorazione di minerali non metalliferi (vetro/ceramica/cemento) — PPI mercato domestico Italia (Eurostat)" },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function seriesUrl(nace: string, unit: string): string {
  return `${BASE}?format=JSON&lang=EN&geo=IT&nace_r2=${nace}&unit=${unit}` +
         `&indic_bt=PRC_PRR_DOM&s_adj=NSA&sinceTimePeriod=2022-01`;
}

// JSON-stat 2.0 → { "2025-01": value, ... }. Filtrando a una singola serie
// (un geo, un nace, un'unità) le posizioni di `value` corrispondono alle
// posizioni della dimensione time.
function parseSeries(js: any): Record<string, number> {
  const idx = js?.dimension?.time?.category?.index || {};
  const posToMonth: Record<string, string> = {};
  for (const [month, pos] of Object.entries(idx)) posToMonth[String(pos)] = month;
  const values = js?.value || {};
  const out: Record<string, number> = {};
  for (const [pos, val] of Object.entries(values)) {
    const month = posToMonth[String(pos)];
    if (month && val != null) out[month] = Number(val);
  }
  return out;
}

async function fetchSeries(nace: string, unit: string): Promise<Record<string, number>> {
  const resp = await fetch(seriesUrl(nace, unit), { headers: { "Accept": "application/json" } });
  if (!resp.ok) throw new Error(`EUROSTAT_${nace}_${unit}_${resp.status}`);
  return parseSeries(await resp.json());
}

Deno.serve(async (req: Request) => {
  const supaAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: cfg } = await supaAdmin.from("app_secrets").select("value").eq("key", "ingest_cron_secret").single();
  const provided = req.headers.get("x-cron-secret") || "";
  if (!cfg?.value || provided !== cfg.value) return json({ error: "FORBIDDEN" }, 403);

  try {
    const rows: any[] = [];
    const perNace: Record<string, number> = {};
    for (const { code, label } of NACE) {
      // indice (2021=100) + variazione % anno su anno, allineati per mese.
      const [idxMap, pctMap] = await Promise.all([
        fetchSeries(code, "I21"),
        fetchSeries(code, "PCH_SM"),
      ]);
      const months = new Set([...Object.keys(idxMap), ...Object.keys(pctMap)]);
      let n = 0;
      for (const m of months) {
        rows.push({
          nace_code: code,
          nace_label: label,
          geo: "IT",
          ref_month: `${m}-01`,
          index_value: idxMap[m] ?? null,
          pct_change_yoy: pctMap[m] ?? null,
          fonte: "Eurostat",
          fonte_url: FONTE_URL,
        });
        n++;
      }
      perNace[code] = n;
    }

    if (rows.length === 0) return json({ error: "NO_DATA" }, 502);

    const { data: upserted, error } = await supaAdmin.rpc("upsert_market_index", { p_rows: rows });
    if (error) return json({ error: "UPSERT_ERROR", detail: error.message, rows: rows.length }, 500);
    return json({ ok: true, fonte: "Eurostat", perNace, rows: rows.length, upserted });
  } catch (e) {
    return json({ error: "INTERNAL_ERROR", detail: String(e) }, 500);
  }
});
