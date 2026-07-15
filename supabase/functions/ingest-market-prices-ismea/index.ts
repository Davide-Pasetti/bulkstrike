import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Ingest settimanale dei prezzi ISMEA per i cereali grezzi (vista "Prezzi per
// piazza - Origine", l'unica dove ISMEA quota le materie prime grezze; l'ingrosso
// contiene solo farine/semole trasformate). Chiamata dal cron settimanale via
// net.http_post. Protetta da x-cron-secret (verify_jwt=false lato deploy).
//
// SSL: ISMEA invia SOLO il certificato foglia (manca l'intermedio Sectigo), quindi
// Deno non riesce a costruire la catena (UNABLE_TO_VERIFY_LEAF_SIGNATURE). Forniamo
// noi l'intermedio come CA aggiuntiva: la verifica del certificato resta PIENA
// (NON disattiviamo rejectUnauthorized). Intermedio scaricato dall'AIA della foglia
// (crt.sectigo.com), Subject = emittente esatto della foglia, valido fino al 2036.
const SECTIGO_OV_R36 = `-----BEGIN CERTIFICATE-----
MIIGTDCCBDSgAwIBAgIQLBo8dulD3d3/GRsxiQrtcTANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgT1YgUjM2MIIBojANBgkqhkiG9w0B
AQEFAAOCAY8AMIIBigKCAYEApkMtJ3R06jo0fceI0M52B7K+TyMeGcv2BQ5AVc3j
lYt76TvHIu/nNe22W/RJXX9rWUD/2GE6GF5x0V4bsY7K3IeJ8E7+KzG/TGboySfD
u+F52jqQBbY62ofhYjMeiAbLI02+FqwHeM8uIrUtcX8b2RCxF358TB0NHVccAXZc
FYgZndZCeXxjuca7pJJ20LLUnXtgXcjAE1vY4WvbReW0W6mkeZyNGdmpTcFs5Y+s
yy6LtE5Zocji9J9NlNnReox2RWVyEXpA1ChZ4gqN+ZpVSIQ0HBorVFbBKyhdZyEX
gZgNSNtBRwxqwIzJePJhYd4ZUhO1vk+/uP3nwDk0p95q/j7naXNCSvESnrHPypaB
WRK066nKfPRPi9m9kIOhMdYfS8giFRTcdgL24Ycilj7ecAK9Trh0VbjwouJ4WH+x
bt47u68ZFCD/ac55I0DNHkCpaPruj6e9Rmr7K46wZDAYXuEAqB7tGG/jd6JAA+H2
O44CV98NRsU213f1kScIZntNAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk
lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQU42Z0u3BojSxdTg6mSo+bNyKcgpIw
DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI
KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgIw
VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv
UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH
AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp
Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF
BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA
BZXWDHWC3cubb/e1I1kzi8lPFiK/ZUoH09ufmVOrc5ObYH/XKkWUexSPqRkwKFKr
7r8OuG+p7VNB8rifX6uopqKAgsvZtZsq7iAFw04To6vNcxeBt1Eush3cQ4b8nbQR
MQLChgEAqwhuXp9P48T4QEBSksYav7+aFjNySsLYlPzNqVM3RNwvBdvp6vgDtGwc
xlKQZVuuNVIaoYyls8swhxDeSHKpRdxRauTLZ+pl+wGvy0pnrLEJGSz9mOEmfbod
e/XopR2NGqaHJ6bIjyxPu6UtyQGI26En7UAEozACrHz06Nx2jTAY9E6NeB6XuobE
wLK025ZRmvglcURG1BrV24tGHHTgxCe8M3oGlpUSMTKQ2dkgljZVYt+gKdFtWELZ
MuRdi+X3XsrR8LFz+aLUiDRfQqhmw3RxjIyVKvvu9UPYY1nsvxYmFnUSeM+2q1z/
iPUry+xDY9MC6+IhleKT094VKdFVp7LXH42+wvU+17lRolQ2mK2N/nBLVBwaIhib
QXw4VYKwB86Bc6eS6iqsc94KEgD/U4VsjmgfhK+Xp4NM+VYzTTa3QeV3p8xOM0cw
q1p8oZFA+OBcz3FYWpDIe5j0NWKlw9hXsTyPY/HeZUV59akskSOSRSmDfe8wJDPX
58uB9/7lud0G3x0pxQAcffP0ayKavNwDTw4UfJ34cEw=
-----END CERTIFICATE-----`;

const FONTE = "ISMEA";
// Fonti ISMEA (tabelle HTML server-rendered a URL stabile). Cereali origine copre
// grano tenero (3 gradi), mais, orzo, riso/risone. Il grano duro ha fonte propria
// (CUN, edge function dedicata). Semi oleosi: origine quota la Soia (= Semi di soia),
// ingrosso farine quota la Farina di soia (= Farina di estrazione di soia); entrambi
// sono già nel settore cereali-seminativi con i sinonimi giusti. Il sorgo NON è
// quotato da ISMEA (resta senza prezzo diretto). Tutte le tabelle hanno lo stesso
// formato "Prezzi per piazza" (Piazza|Data|Prodotto|Prezzo|Var.|Condizione), €/T.
const SOURCES = [
  {
    url: "https://www.ismeamercati.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/849",
    descr: "ISMEA · Cereali · Prezzi per piazza · Origine",
  },
  {
    url: "https://www.ismeamercati.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/924",
    descr: "ISMEA · Semi oleosi · Prezzi per piazza · Origine",
  },
  {
    url: "https://www.ismeamercati.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/1199",
    descr: "ISMEA · Semi oleosi · Prezzi ingrosso · Farine",
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Estrae la tabella dati (quella con intestazione "Piazza") come righe testuali
// pipe-delimited, senza il resto della pagina (menu/script).
function extractTable(html: string): string {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  const dataTable = tables.find((t) => /Piazza/i.test(t)) ||
    tables.sort((a, b) => b.length - a.length)[0] || "";
  return dataTable
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ \|\s*\n/g, "\n")
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n")
    .slice(0, 60000);
}

async function extractWithAI(apiKey: string, tableText: string, products: any[], descr: string): Promise<any[]> {
  const system = `Estrai i prezzi delle materie prime agricole da una tabella ISMEA (prezzi per piazza).
Le righe hanno la forma: Piazza | Data | Prodotto | Prezzo | Var. | Condizione di vendita.
Il Prezzo è in EURO A TONNELLATA (€/T).
Per OGNI riga che corrisponde a uno dei prodotti forniti, restituisci un oggetto con:
- product_id: l'id del prodotto corrispondente scelto TRA quelli forniti (usa nome e sinonimi per il match)
- grade: la categoria merceologica/grado ricavata dalla stringa Prodotto (es. "Fino", "Buono mercantile", "Mercantile", oppure la varietà per il riso); null se non presente
- piazza: la piazza della riga
- price_min: numero, il prezzo in €/T (se la cella è un range min-max usa il minimo; se è un valore unico, usalo)
- price_max: numero, il prezzo in €/T (il massimo del range, oppure uguale a price_min se valore unico)
- rilevazione_date: la Data della riga in formato YYYY-MM-DD (es. "09-07-26" -> "2026-07-09")
- raw_label: la stringa Prodotto originale della riga
Regole:
- Mappa SOLO i prodotti NAZIONALI ai product_id forniti: IGNORA le righe con "estero"/"Comunitario"/"Extracomunitario" (sono importazioni, non i nostri prodotti nazionali).
- IGNORA il FRUMENTO DURO / grano duro (ha una fonte dedicata separata, non è tra i prodotti forniti).
- Sulle pagine dei SEMI OLEOSI: mappa "Soia" (origine) a Semi di soia e "Farina di soia" (ingrosso) a Farina di estrazione di soia; IGNORA Colza e Girasole se non sono tra i prodotti forniti.
- IGNORA le righe che non corrispondono a nessun prodotto fornito.
- IGNORA righe senza un prezzo numerico.
- Usa il punto come separatore decimale.
Rispondi SOLO con un array JSON valido, senza testo, senza markdown, senza backtick.`;

  const user = `Prodotti disponibili (scegli product_id tra questi):\n${
    JSON.stringify(products.map((p) => ({ product_id: p.id, nome: p.name, sinonimi: p.synonyms })))
  }\n\nTabella (${descr}):\n${tableText}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 32000,
      system,
      messages: [{ role: "user", content: [{ type: "text", text: user }] }],
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

  // Protezione: solo chi conosce il segreto condiviso (app_secrets.ingest_cron_secret,
  // letto anche dal cron) può invocare. verify_jwt=false lato deploy; il segreto vive
  // solo nel DB (leggibile da service_role), mai hardcoded né esposto ad anon.
  const { data: cfg } = await supaAdmin.from("app_secrets").select("value").eq("key", "ingest_cron_secret").single();
  const expected = cfg?.value;
  const provided = req.headers.get("x-cron-secret") || "";
  if (!expected || provided !== expected) return json({ error: "FORBIDDEN" }, 403);

  try {
    // 1) prodotti target (settore "Cereali & seminativi") con sinonimi, per il mapping
    const { data: sec } = await supaAdmin.from("sectors").select("id").eq("slug", "cereali-seminativi").single();
    if (!sec) return json({ error: "SECTOR_NOT_FOUND" }, 500);
    const { data: ps } = await supaAdmin
      .from("product_sectors")
      .select("products(id, canonical_name, product_synonyms(synonym))")
      .eq("sector_id", sec.id);
    const products = (ps || [])
      .map((r: any) => r.products)
      .filter(Boolean)
      // Il GRANO DURO ha una fonte nazionale unica dedicata (CUN): NON lo prendiamo
      // da ISMEA (frumento duro) per non mischiare due fonti sullo stesso prodotto.
      .filter((p: any) => p.canonical_name !== "Grano duro")
      .map((p: any) => ({ id: p.id, name: p.canonical_name, synonyms: (p.product_synonyms || []).map((s: any) => s.synonym) }));
    const validIds = new Set(products.map((p: any) => p.id));

    // 2) http client con catena completata (verifica piena)
    const client = Deno.createHttpClient({ caCerts: [SECTIGO_OV_R36] });

    // 3) fetch + estrazione AI per ogni sorgente
    const rows: any[] = [];
    const perSource: any[] = [];
    for (const src of SOURCES) {
      const html = await (await fetch(src.url, { client })).text();
      const tableText = extractTable(html);
      const extracted = await extractWithAI(apiKey, tableText, products, src.descr);
      let kept = 0;
      for (const e of extracted) {
        if (!e || !validIds.has(e.product_id)) continue;
        const min = Number(e.price_min), max = Number(e.price_max);
        if (!isFinite(min) && !isFinite(max)) continue;
        // €/T -> €/kg
        const pmin = isFinite(min) ? min / 1000 : null;
        const pmax = isFinite(max) ? max / 1000 : (isFinite(min) ? min / 1000 : null);
        const pavg = (pmin != null && pmax != null) ? (pmin + pmax) / 2 : (pmin ?? pmax);
        rows.push({
          product_id: e.product_id,
          grade: e.grade || null,
          piazza: e.piazza || null,
          price_min: pmin,
          price_max: pmax,
          price_avg: pavg,
          currency: "EUR",
          unit: "kg",
          rilevazione_date: e.rilevazione_date,
          fonte: FONTE,
          fonte_url: src.url,
          raw_label: e.raw_label || null,
        });
        kept++;
      }
      perSource.push({ url: src.url, extracted: extracted.length, kept });
    }

    // 4) upsert idempotente
    const { data: n, error } = await supaAdmin.rpc("upsert_market_prices", { p_rows: rows });
    if (error) return json({ error: "UPSERT_ERROR", detail: error.message, rows: rows.length }, 500);

    return json({ ok: true, fonte: FONTE, sources: perSource, rows: rows.length, upserted: n });
  } catch (e) {
    return json({ error: "INTERNAL_ERROR", detail: String(e) }, 500);
  }
});
