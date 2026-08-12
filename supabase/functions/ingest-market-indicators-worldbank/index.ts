import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

// Ingest MENSILE (giorno 5) del World Bank "Pink Sheet" (Commodity Price Data),
// foglio "Monthly Prices", nel modello a indicatori (market_indicators dove
// serie_ref->>'source' = 'worldbank'). Non esiste API: si scarica un XLSX.
//
// Trappole/vincoli gia' verificati e rispettati:
//  - l'hash nell'URL del file CAMBIA OGNI ANNO: NON hardcodato. Si risolve
//    cercando nel HTML della pagina commodity-markets il link a
//    CMO-Historical-Data-Monthly.xlsx. Fallback all'ultimo URL noto solo se lo
//    scraping fallisce, con flag resolvedBy='fallback' per l'alert.
//  - unita' MISTE: si salva il valore nativo della colonna; l'unita' e' gia'
//    impostata sull'indicatore (metalli/fertilizzanti/grani $/mt, zucchero $/kg,
//    petrolio $/bbl, gas $/mmbtu, minerale di ferro $/dmtu).
//  - VINCOLO LME (metalli/fertilizzanti): SOLO medie mensili (il Pink Sheet e'
//    gia' mensile), nessun endpoint dati/CSV pubblico (qui si scrive solo in
//    tabella per il grafico), attribuzione con "quotazioni di base LME".
// Protetta da x-cron-secret (deploy con verify_jwt=false).

const PAGE = "https://www.worldbank.org/en/research/commodity-markets";
const FILE_NAME = "CMO-Historical-Data-Monthly.xlsx";
// Fallback: ultimo URL noto (hash 2026). Usato SOLO se lo scraping fallisce.
const FALLBACK_XLSX = "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx";
const SHEET = "Monthly Prices";
const SINCE_YEAR = 2015;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function resolveXlsxUrl() {
  try {
    const resp = await fetch(PAGE, { headers: { "Accept": "text/html" } });
    if (resp.ok) {
      const html = await resp.text();
      const idx = html.indexOf(FILE_NAME);
      if (idx >= 0) {
        const start = html.lastIndexOf("http", idx);
        if (start >= 0) {
          const url = html.slice(start, idx + FILE_NAME.length);
          // scarta se contiene apici/spazi (link malformato)
          const bad = ['"', "'", " ", "<", ">"].some((ch) => url.includes(ch));
          if (url.length < 400 && !bad) return { url, resolvedBy: "scrape" };
        }
      }
    }
  } catch (_e) { /* si usa il fallback */ }
  return { url: FALLBACK_XLSX, resolvedBy: "fallback" };
}

// base = testo prima della virgola (minuscolo); qual = resto (minuscolo).
// Tiene solo lettere/cifre/spazi (rimuove footnote come '**', parentesi, ecc.).
function norm(s) {
  let o = "";
  for (const ch of String(s || "").toLowerCase()) {
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === " ") o += ch;
  }
  return o.split(" ").filter(Boolean).join(" ");
}

function splitHeader(h) {
  const s = String(h || "").trim();
  const i = s.indexOf(",");
  const basePart = i < 0 ? s : s.slice(0, i);
  const qualPart = i < 0 ? "" : s.slice(i + 1);
  return { base: norm(basePart), qual: norm(qualPart) };
}

// Match: base uguale, oppure la base dell'header inizia con la base cercata
// (gestisce 'Potassium chloride (muriate of potash)', footnote, ecc.).
function baseMatches(headerBase, target) {
  return headerBase === target || headerBase.startsWith(target + " ");
}

// '2015M01' -> { y, m } oppure null. Nessuna regex.
function parseMonthKey(cell) {
  const s = String(cell || "").trim();
  if (s.length !== 7 || s[4] !== "M") return null;
  const y = Number(s.slice(0, 4));
  const mo = s.slice(5, 7);
  const moN = Number(mo);
  if (!Number.isFinite(y) || y < 1900) return null;
  if (!Number.isFinite(moN) || moN < 1 || moN > 12) return null;
  return { y, m: mo };
}

Deno.serve(async (req) => {
  const supaAdmin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: cfg } = await supaAdmin.from("app_secrets").select("value").eq("key", "ingest_cron_secret").single();
  const provided = req.headers.get("x-cron-secret") || "";
  if (!cfg?.value || provided !== cfg.value) return json({ error: "FORBIDDEN" }, 403);

  try {
    const { data: indicators, error: selErr } = await supaAdmin
      .from("market_indicators").select("slug, serie_ref").eq("attivo", true);
    if (selErr) return json({ error: "SELECT_ERROR", detail: selErr.message }, 500);
    const wb = (indicators || []).filter((r) => r.serie_ref?.source === "worldbank" && r.serie_ref?.base);
    if (wb.length === 0) return json({ error: "NO_INDICATORS" }, 200);

    const { url, resolvedBy } = await resolveXlsxUrl();
    const fileResp = await fetch(url);
    if (!fileResp.ok) return json({ error: "DOWNLOAD_ERROR", status: fileResp.status, url, resolvedBy }, 502);
    const bytes = new Uint8Array(await fileResp.arrayBuffer());

    const book = XLSX.read(bytes, { type: "array" });
    const ws = book.Sheets[SHEET];
    if (!ws) return json({ error: "SHEET_NOT_FOUND", sheets: book.SheetNames, url, resolvedBy }, 502);
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false });

    let headerRow = -1;
    for (let i = 0; i < Math.min(aoa.length, 20); i++) {
      if ((aoa[i] || []).some((c) => String(c || "").trim().toLowerCase() === "aluminum")) { headerRow = i; break; }
    }
    if (headerRow < 0) return json({ error: "HEADER_NOT_FOUND", url, resolvedBy, firstRows: aoa.slice(0, 8) }, 502);

    const header = aoa[headerRow];
    const colOf = {};
    const unmatched = [];
    for (const ind of wb) {
      const base = norm(ind.serie_ref.base);
      const q = ind.serie_ref.q ? norm(ind.serie_ref.q) : null;
      let found = -1;
      for (let c = 1; c < header.length; c++) {
        const h = splitHeader(header[c]);
        if (baseMatches(h.base, base) && (!q || h.qual.includes(q))) { found = c; break; }
      }
      if (found >= 0) colOf[ind.slug] = found; else unmatched.push(ind.slug);
    }

    const rows = [];
    const perSlug = {};
    for (let i = headerRow + 1; i < aoa.length; i++) {
      const mk = parseMonthKey((aoa[i] || [])[0]);
      if (!mk || mk.y < SINCE_YEAR) continue;
      const ref_date = `${mk.y}-${mk.m}-01`;
      for (const ind of wb) {
        const c = colOf[ind.slug];
        if (c == null) continue;
        const raw = (aoa[i] || [])[c];
        const val = typeof raw === "number" ? raw : parseFloat(String(raw).split(",").join(""));
        if (!isFinite(val)) continue;
        rows.push({ indicator_slug: ind.slug, ref_date, valore: val });
        perSlug[ind.slug] = (perSlug[ind.slug] || 0) + 1;
      }
    }

    if (rows.length === 0) return json({ error: "NO_DATA", url, resolvedBy, unmatched }, 502);

    const { data: upserted, error } = await supaAdmin.rpc("upsert_indicator_history", { p_rows: rows });
    if (error) return json({ error: "UPSERT_ERROR", detail: error.message, rows: rows.length }, 500);

    const maxDate = rows.reduce((m, r) => (r.ref_date > m ? r.ref_date : m), "");
    return json({ ok: true, fonte: "World Bank", url, resolvedBy, rows: rows.length, upserted, maxDate, unmatched, perSlug });
  } catch (e) {
    return json({ error: "INTERNAL_ERROR", detail: String(e) }, 500);
  }
});
