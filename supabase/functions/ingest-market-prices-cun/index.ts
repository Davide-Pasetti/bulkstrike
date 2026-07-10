import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";

// Ingest settimanale del listino CUN Grano Duro (Commissione Unica Nazionale,
// fonte nazionale unica dal 2026). Chiamata dal cron settimanale (lunedì sera,
// dopo la riunione CUN). Protetta da x-cron-secret (verify_jwt=false lato deploy).
//
// listinicun.it ha una catena TLS completa (nessun fix SSL necessario). Il PDF
// corrente è incorporato nella pagina cod=11 a URL stabile: scarichiamo la pagina,
// estraiamo l'URL del PDF e lo passiamo all'AI-extraction (document PDF, stessa
// tecnica di parse-supplier-price-list).
const FONTE = "CUN Grano Duro";
const CUN_PAGE = "https://www.listinicun.it/pages/Home?cod=11";
const CUN_HOST = "https://www.listinicun.it";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function extractFromPdf(apiKey: string, pdfB64: string): Promise<any[]> {
  const system = `Estrai TUTTE le quotazioni del GRANO DURO da questo listino settimanale della CUN (Commissione Unica Nazionale del Grano duro).
Per ogni quotazione presente restituisci un oggetto con:
- grade: la categoria merceologica (es. "Fino", "Buono mercantile", "Mercantile", o come indicata nel listino); null se non indicata
- piazza: l'area geografica / zona di quotazione (es. "Nord", "Centro", "Sud", "Isole", o la zona specifica indicata); null se il prezzo è unico nazionale
- price_min: numero, il prezzo minimo in EURO A TONNELLATA (€/T)
- price_max: numero, il prezzo massimo in €/T (uguale a price_min se è un valore unico)
- rilevazione_date: la data del listino in formato YYYY-MM-DD
- raw_label: l'etichetta originale della riga/quotazione
Regole: considera SOLO il grano duro; usa il punto come separatore decimale; ignora righe senza un prezzo numerico.
Rispondi SOLO con un array JSON valido, senza testo, senza markdown, senza backtick.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfB64 } },
          { type: "text", text: "Estrai le quotazioni del grano duro da questo listino CUN nel formato JSON richiesto." },
        ],
      }],
    }),
  });
  if (!resp.ok) throw new Error(`ANTHROPIC_${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const textBlock = (data.content || []).find((b: any) => b.type === "text");
  const cleaned = (textBlock?.text || "[]").replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

Deno.serve(async (req: Request) => {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "MISSING_API_KEY" }, 500);
  const supaAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: cfg } = await supaAdmin.from("app_secrets").select("value").eq("key", "ingest_cron_secret").single();
  const provided = req.headers.get("x-cron-secret") || "";
  if (!cfg?.value || provided !== cfg.value) return json({ error: "FORBIDDEN" }, 403);

  try {
    // 1) prodotto Grano duro
    const { data: prod } = await supaAdmin.from("products").select("id").eq("canonical_name", "Grano duro").single();
    if (!prod) return json({ error: "PRODUCT_NOT_FOUND" }, 500);

    // 2) pagina CUN -> URL del PDF corrente. Il listino è nel data="" di un <object>,
    // path relativo con SPAZI nel nome file (es. "/listini//11/..._Listino CUN Grano
    // Duro 06.07.2026.pdf"); il match deve fermarsi alla virgoletta, non allo spazio.
    // Gli altri PDF (Composizione/Calendario) usano /pages/CaricaPdf, quindi /listini/
    // individua solo il listino.
    // listinicun restituisce un 200 VUOTO al fingerprint di default di undici/Deno
    // (solo UA+Accept): serve un set di header più simile a un browser reale,
    // altrimenti il body è vuoto e il PDF non si trova.
    const BROWSER_HEADERS = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Upgrade-Insecure-Requests": "1",
    };
    const pageHtml = await (await fetch(CUN_PAGE, { headers: BROWSER_HEADERS })).text();
    const m = pageHtml.match(/\/listini\/[^"']*?\.pdf/i);
    if (!m) return json({ error: "PDF_URL_NOT_FOUND", htmlLen: pageHtml.length }, 502);
    let pdfUrl = m[0];
    if (pdfUrl.startsWith("/")) pdfUrl = CUN_HOST + pdfUrl;
    pdfUrl = pdfUrl.replace(/ /g, "%20");

    // 3) scarica il PDF -> base64
    const pdfResp = await fetch(pdfUrl, { headers: { ...BROWSER_HEADERS, "Accept": "application/pdf" } });
    if (!pdfResp.ok) return json({ error: "PDF_FETCH_ERROR", status: pdfResp.status, pdfUrl }, 502);
    const pdfBytes = new Uint8Array(await pdfResp.arrayBuffer());
    if (pdfBytes.length < 1000) return json({ error: "PDF_EMPTY", bytes: pdfBytes.length, pdfUrl }, 502);
    const pdfB64 = encodeBase64(pdfBytes);

    // 4) AI-extraction dal PDF
    const extracted = await extractFromPdf(apiKey, pdfB64);

    // 5) normalizza (€/T -> €/kg) e upsert (tutte le righe = Grano duro)
    const rows: any[] = [];
    for (const e of extracted) {
      const min = Number(e.price_min), max = Number(e.price_max);
      if (!isFinite(min) && !isFinite(max)) continue;
      const pmin = isFinite(min) ? min / 1000 : null;
      const pmax = isFinite(max) ? max / 1000 : (isFinite(min) ? min / 1000 : null);
      const pavg = (pmin != null && pmax != null) ? (pmin + pmax) / 2 : (pmin ?? pmax);
      rows.push({
        product_id: prod.id,
        grade: e.grade || null,
        piazza: e.piazza || null,
        price_min: pmin,
        price_max: pmax,
        price_avg: pavg,
        currency: "EUR",
        unit: "kg",
        rilevazione_date: e.rilevazione_date,
        fonte: FONTE,
        fonte_url: pdfUrl,
        raw_label: e.raw_label || null,
      });
    }

    const { data: n, error } = await supaAdmin.rpc("upsert_market_prices", { p_rows: rows });
    if (error) return json({ error: "UPSERT_ERROR", detail: error.message, rows: rows.length }, 500);
    return json({ ok: true, fonte: FONTE, pdfUrl, extracted: extracted.length, rows: rows.length, upserted: n });
  } catch (e) {
    return json({ error: "INTERNAL_ERROR", detail: String(e) }, 500);
  }
});
