import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Ingest SETTIMANALE (martedì) del DG-AGRI Agri-food Data Portal nel modello a
// indicatori (market_indicators dove serie_ref->>'source'='agrifood'). Host nuovo
// api.tech.ec.europa.eu (quello vecchio non funziona piu').
//
// Trappole verificate e gestite:
//  - Deno fetch di default negozia gzip/br e QUESTO endpoint chiude la connessione
//    ("error reading a body from connection"): si forza Accept-Encoding: identity
//    + User-Agent da browser.
//  - 404 = NESSUN DATO (body {"error":"Not Found"}), non un errore: si salta.
//  - Rate limiting: chiamate SERIALIZZATE con pausa.
//  - date dd/MM/yyyy URL-encoded (%2F) sul filtro cereali.
//  - prezzo come stringa formattata con decimali MISTI: "€192,60" (virgola) sui
//    cereali, "€452.00" (punto) altrove → parser robusto.
//  - unita' MISTE (TONNES / Tonne / national currency/ton / €/100kg / 100KG) →
//    tutto normalizzato a €/t.
//  - nomi prodotto duplicati (codice grezzo vs etichetta): si filtra per i campi
//    esatti nel match (productName/marketName/product/market/variety/type/stage).
//  - media nazionale: fornita dall'API per cereali (marketName='National Average')
//    e olio (market='Average national price'); per gli oleosi la calcoliamo come
//    media settimanale tra le piazze (agg='avg_markets'). In ogni caso qui si fa
//    la media delle righe che combaciano per settimana: per le serie "row" e' la
//    media di 1 (la riga nazionale), per "avg_markets" la media tra le piazze.
//  - NON si usa /wine (serie IT ferma al 2025).
// Protetta da x-cron-secret (deploy con verify_jwt=false).

const BASE = "https://api.tech.ec.europa.eu/agrifood/api";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const H = { "Accept": "application/json", "Accept-Encoding": "identity", "User-Agent": UA };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "€192,60" | "€452.00" | "€1,230.00" | "€1.230,00" -> number (unita' nativa)
function parsePrice(raw) {
  let x = String(raw == null ? "" : raw).split("€").join("");
  x = x.split(" ").join("").split(" ").join("").trim();
  const hasComma = x.includes(","), hasDot = x.includes(".");
  if (hasComma && hasDot) {
    if (x.lastIndexOf(",") > x.lastIndexOf(".")) { x = x.split(".").join(""); x = x.split(",").join("."); }
    else { x = x.split(",").join(""); }
  } else if (hasComma) {
    x = x.split(",").join(".");
  }
  const v = parseFloat(x);
  return isFinite(v) ? v : null;
}

// Qualsiasi unita' "per 100 kg" (€/100kg, 100KG) -> x10 per avere €/t; il resto
// (TONNES, Tonne, national currency/ton) e' gia' €/t.
function toPerTon(v, unit) {
  return String(unit || "").toLowerCase().includes("100") ? v * 10 : v;
}

// "20/07/2026" -> "2026-07-20"
function ddmmyyyy(s) {
  const p = String(s || "").split("/");
  if (p.length !== 3) return null;
  return `${p[2]}-${p[1]}-${p[0]}`;
}

function urlFor(endpoint, year) {
  const ms = "memberStateCodes=IT";
  if (endpoint === "cereal") return `${BASE}/cereal/prices?${ms}&beginDate=01%2F01%2F${year}&endDate=31%2F12%2F${year}`;
  return `${BASE}/${endpoint}/prices?${ms}&years=${year}`;
}

async function fetchYear(endpoint, year) {
  const resp = await fetch(urlFor(endpoint, year), { headers: H });
  if (resp.status === 404) return [];
  if (!resp.ok) throw new Error(`AGRI_${endpoint}_${year}_${resp.status}`);
  const t = await resp.text();
  try { const a = JSON.parse(t); return Array.isArray(a) ? a : [a]; } catch (_e) { return []; }
}

// record combacia con il match (confronto stringa trimmata sui campi nativi API)
function matches(rec, match) {
  for (const k of Object.keys(match)) {
    if (String(rec[k] == null ? "" : rec[k]).trim() !== String(match[k]).trim()) return false;
  }
  return true;
}

Deno.serve(async (req) => {
  const supaAdmin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: cfg } = await supaAdmin.from("app_secrets").select("value").eq("key", "ingest_cron_secret").single();
  const provided = req.headers.get("x-cron-secret") || "";
  if (!cfg?.value || provided !== cfg.value) return json({ error: "FORBIDDEN" }, 403);

  let params = {};
  try { params = await req.json(); } catch (_e) { params = {}; }
  const nowY = new Date().getFullYear();
  const toYear = Number(params.toYear) || nowY;
  const fromYear = Number(params.fromYear) || (toYear - 1);

  try {
    const { data: indicators, error: selErr } = await supaAdmin
      .from("market_indicators").select("slug, serie_ref").eq("attivo", true);
    if (selErr) return json({ error: "SELECT_ERROR", detail: selErr.message }, 500);
    const agri = (indicators || []).filter((r) => r.serie_ref?.source === "agrifood" && r.serie_ref?.endpoint && r.serie_ref?.match);
    if (agri.length === 0) return json({ error: "NO_INDICATORS" }, 200);

    // raggruppa gli indicatori per endpoint
    const byEndpoint = {};
    for (const ind of agri) { (byEndpoint[ind.serie_ref.endpoint] ||= []).push(ind); }
    // `only`: limita agli endpoint indicati (utile in backfill per non riscaricare
    // riso/olio, che con years=YYYY tornano gia' tutto lo storico).
    const only = Array.isArray(params.only) ? params.only : null;
    if (only) { for (const k of Object.keys(byEndpoint)) if (!only.includes(k)) delete byEndpoint[k]; }

    // accumulatore: slug -> refDate -> { sum, count, end }
    const acc = new Map();
    const bump = (slug, refDate, refEnd, val) => {
      let m = acc.get(slug); if (!m) { m = new Map(); acc.set(slug, m); }
      let o = m.get(refDate); if (!o) { o = { sum: 0, count: 0, end: refEnd }; m.set(refDate, o); }
      o.sum += val; o.count += 1;
    };

    const perEndpoint = {};
    const notes = [];
    for (const endpoint of Object.keys(byEndpoint)) {
      let rowsSeen = 0;
      for (let y = fromYear; y <= toYear; y++) {
        let recs = [];
        try { recs = await fetchYear(endpoint, y); }
        catch (e) { notes.push(String(e)); await sleep(1200); continue; }
        rowsSeen += recs.length;
        for (const ind of byEndpoint[endpoint]) {
          const match = ind.serie_ref.match;
          for (const rec of recs) {
            if (!matches(rec, match)) continue;
            const v0 = parsePrice(rec.price);
            if (v0 == null) continue;
            const val = toPerTon(v0, rec.unit);
            const refDate = ddmmyyyy(rec.beginDate);
            if (!refDate) continue;
            const refEnd = ddmmyyyy(rec.endDate);
            bump(ind.slug, refDate, refEnd, val);
          }
        }
        await sleep(1200); // serializzate + gentili col rate limiting
      }
      perEndpoint[endpoint] = rowsSeen;
    }

    // media per (slug, settimana) -> righe da upsertare
    const rows = [];
    const perSlug = {};
    for (const [slug, m] of acc) {
      for (const [refDate, o] of m) {
        rows.push({ indicator_slug: slug, ref_date: refDate, ref_date_end: o.end, valore: Math.round((o.sum / o.count) * 100) / 100 });
      }
      perSlug[slug] = m.size;
    }

    if (rows.length === 0) return json({ error: "NO_DATA", fromYear, toYear, perEndpoint, notes }, 200);

    const { data: upserted, error } = await supaAdmin.rpc("upsert_indicator_history", { p_rows: rows });
    if (error) return json({ error: "UPSERT_ERROR", detail: error.message, rows: rows.length }, 500);
    return json({ ok: true, fonte: "EU DG AGRI", fromYear, toYear, rows: rows.length, upserted, perEndpoint, perSlug, notes });
  } catch (e) {
    return json({ error: "INTERNAL_ERROR", detail: String(e) }, 500);
  }
});
