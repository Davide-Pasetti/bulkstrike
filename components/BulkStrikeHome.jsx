import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Bot, ArrowRight, ArrowUp, BarChart3, Check, Clock, ChevronRight, TrendingDown, Flame, Wine, Beef, Pill, SprayCan, FlaskConical, Palette, Recycle, Building2, Package, Shirt, Fuel, Sprout, Wheat, Grid3x3, Anvil, Zap } from "lucide-react";
import { getMacroAreas, getMacroAreasCached, getSectorProducts, getActivePools, getMyFollowedProducts, getSession, getMarketPriceSeries, getMarketIndexSectors, getMarketSelectorNav, getWatchedMaterials, getMyOrdersHistory, getMyFollowedSectors, getHomepageStats, getPriceTicker } from "@/lib/api";
import { ytdChange } from "@/lib/priceTrend";
import { TIERS, tierIndexFor, tierFor } from "@/lib/tiers";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import PriceSourceNote from "@/components/PriceSourceNote";
import PresentationVideo from "@/components/PresentationVideo";
import BulkStrikeChatWidget from "@/components/BulkStrikeChatWidget";
import { BSIcon } from "@/components/BSLogo";

// ─── DATA ───────────────────────────────────────────────────────────────────

// Icone Lucide per le macro-aree (chiave = slug dal DB). Niente emoji: rendering
// identico su ogni OS e allineamento tipografico corretto (DAV-68).
// Slug allineati allo split 13→16 di DAV-71 (verificati sul DB il 02/08/2026).
const MACRO_ICONS = {
  "agricoltura-ambiente":            Sprout,
  "alimentare-ingredienti":          Wheat,
  "carta-imballaggio":               Package,
  "ceramica-vetro":                  Grid3x3,
  "chimica-solventi-gas":            FlaskConical,
  "cosmetica-detergenza-igiene":     SprayCan,
  "edilizia-costruzioni":            Building2,
  "energia-lubrificanti":            Fuel,
  "enologia-bevande":                Wine,
  "farmaceutica-nutraceutica":       Pill,
  "mangimi-zootecnia":               Beef,
  "metalli-fonderia":                Anvil,
  "plastiche-gomma-compositi":       Recycle,
  "tessile-concia-cuoio":            Shirt,
  "trattamenti-saldatura":           Zap,
  "vernici-inchiostri-rivestimenti": Palette,
};
// Blu petrolio del design system: il fondo del logo ufficiale (BSLogo, gradiente
// #0D2137→#0C4A6E). Diverso dallo sky-700 dei pulsanti primari (DAV-72).
const PETROL = "#0C4A6E";

// ─── FORMATTER + LOGICA ASTA IN EVIDENZA ─────────────────────────────────────
const eurKg = (n) => "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });
const kgFmt = (n) => Number(n || 0).toLocaleString("it-IT");
const fmt1 = (n) => Number(n).toLocaleString("it-IT", { minimumFractionDigits:1, maximumFractionDigits:1 });
const fmt2 = (n) => Number(n).toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });

// Tempo rimanente alla chiusura, forma compatta ("4g 9h", "3h 12m"). Copiata da
// BulkStrikePoolList per coerenza con la pagina "Aste attive".
function timeLeft(iso) {
  if (!iso) return "";
  const s = Math.floor((new Date(iso) - Date.now()) / 1000);
  if (s <= 0) return "in chiusura";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}g ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Deriva i dati del box "asta in evidenza" da una riga di get_active_pools,
// riusando gli scaglioni globali (@/lib/tiers) come la pagina di dettaglio asta.
function deriveFeatured(fp) {
  const vol = Number(fp.total_volume_kg) || 0;
  const tier = TIERS[tierIndexFor(vol)];
  const barTarget = tier.max === Infinity ? null : tier.max;                 // soglia prossimo scaglione
  const pct = barTarget ? Math.min(100, Math.round((vol / barTarget) * 100)) : 100;
  const toNext = barTarget ? Math.max(0, barTarget - vol) : 0;
  const ceiling = tier.price;
  const best = fp.best_price_per_kg != null ? Number(fp.best_price_per_kg) : null;
  const effective = best != null ? Math.min(best, ceiling) : ceiling;        // "Miglior prezzo attuale" della pagina asta
  const quick = TIERS[0].price;                                              // Acquisto Rapido = chi compra da solo (scaglione minimo)
  const savingsPct = Math.max(0, Math.round(((quick - effective) / quick) * 100));
  const almost = !!barTarget && pct >= 85;                                   // "Quasi completo": ≥85% verso il prossimo scaglione
  const closeIso = fp.status === "final_phase" && fp.final_phase_ends_at ? fp.final_phase_ends_at : fp.closes_at;
  // Badge scaglione a 3 stati (DAV-68):
  //  A = esiste uno scaglione successivo → gap + prezzo target + barra
  //  B = scala multi-scaglione tutta sbloccata → prezzo bloccato, countdown primario
  //  C = nessuna scala di scaglioni → solo prezzo + countdown, MAI la parola "scaglione"
  const nextPrice = barTarget ? tierFor(barTarget).price : null;
  const state = barTarget ? "A" : (TIERS.length > 1 ? "B" : "C");
  return { vol, barTarget, pct, toNext, nextPrice, state, effective, quick, savingsPct, almost, closeIso };
}

// Ticker homepage: indici settoriali Eurostat (PPI, base 2021=100) per prodotto
// rappresentativo, MAI prezzi reali €/kg — get_price_ticker() / DAV-67.
function monthLabel(iso) {
  if (!iso) return "";
  const [y, m] = String(iso).slice(0, 7).split("-");
  const MESI = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${MESI[idx]} ${y}` : String(iso);
}

const BUYER_STEPS  = [
  { n:"01", title:"Cerca la materia prima",  desc:"Digita il prodotto o descrivi cosa cerchi. L'AI trova il prodotto esatto nella tassonomia BulkStrike." },
  { n:"02", title:"Scegli: Rapido o Asta a ribasso",   desc:"Acquista subito al prezzo più basso, oppure unisciti a un'asta a ribasso per sbloccare lo scaglione successivo." },
  { n:"03", title:"Ricevi la merce",         desc:"Pagamento protetto in escrow. Track & trace integrato. Confermi la consegna e il gioco è fatto." },
];
const SELLER_STEPS = [
  { n:"01", title:"Pubblica il listino",     desc:"Inserisci i prodotti con listino a scaglioni. L'AI ti guida nella creazione della scheda prodotto." },
  { n:"02", title:"Ricevi richieste",        desc:"Notifiche in tempo reale su aste a ribasso attive, richieste convocate e WantedBoard compatibili con il tuo catalogo." },
  { n:"03", title:"Vinci e spedisci",        desc:"Aggiudicati la fornitura, emetti i documenti in piattaforma e ricevi il pagamento in 5 giorni." },
];

const AI_MSGS = [
  { u:true,  t:"Ho bisogno di 4 tonnellate di acido citrico food grade entro fine mese" },
  { u:false, t:"Per 4 tonnellate di Acido Citrico E330 ho due opzioni:\n\n🟢 Acquisto Rapido — Supplier B — €1,14/kg all-in — 3 giorni\n\n⭐ Asta a ribasso attiva — €0,99/kg all-in — 62% completato — ~4-6 giorni\n\nL'asta ti fa risparmiare ~€60. Vuoi che ti iscriva?" },
  { u:true,  t:"Sì, uniscimi all'asta" },
  { u:false, t:"✅ Iscritto. 4t · Acido Citrico E330 · €0,99/kg all-in.\nTi avviso quando l'asta si completa. 🚀" },
];

// Selezione della strip discovery preservata a livello di modulo: come la
// cache della tassonomia, sopravvive al remount della pagina client (swap
// shell statica → dinamica di cacheComponents), così il box sotto-aree
// aperto non si chiude da solo.
let _discoverySel = { macro: null, sector: null };

// ─── MAIN ───────────────────────────────────────────────────────────────────
function CookieBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem("bs_cookie_consent")) setShow(true); } catch (e) {}
  }, []);
  if (!show) return null;
  const decide = (v) => { try { localStorage.setItem("bs_cookie_consent", v); } catch (e) {} setShow(false); };
  return (
    <div style={{ position:"fixed", left:16, right:16, bottom:16, zIndex:200, maxWidth:720, margin:"0 auto", background:"#fff", border:"1px solid #E2E8F0", borderRadius:14, boxShadow:"0 12px 40px rgba(0,0,0,0.18)", padding:"16px 18px", display:"flex", flexWrap:"wrap", alignItems:"center", gap:12 }}>
      <div style={{ flex:1, minWidth:220, fontSize:13, color:"#334155", lineHeight:1.5 }}>
        Usiamo cookie tecnici necessari al funzionamento del sito e, previo consenso, cookie di misurazione. Dettagli nella <a href="/legale#cookie" style={{ color:"#0369A1", fontWeight:600 }}>Cookie Policy</a>.
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={() => decide("rejected")} style={{ padding:"9px 16px", borderRadius:9, border:"1.5px solid #CBD5E1", background:"#fff", color:"#334155", fontSize:13, fontWeight:600, cursor:"pointer" }}>Rifiuta</button>
        <button onClick={() => decide("accepted")} style={{ padding:"9px 16px", borderRadius:9, border:"none", background:"#0369A1", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>Accetta</button>
      </div>
    </div>
  );
}

export default function BulkStrikeLight() {
  const [activeTab, setActiveTab]   = useState("acquirente");
  const [count, setCount]           = useState({ pools:0, materials:0, countries:0, suppliers:0 });
  const [stats, setStats]           = useState(null); // contatori reali (get_homepage_stats)
  // Aste attive: undefined = in caricamento, [] = nessuna, array = aste ordinate.
  // Un'unica fetch alimenta sia il box "in evidenza" sia la griglia "Aste attive ora".
  const [pools, setPools]           = useState(undefined);
  const [favIds, setFavIds]         = useState(null); // Set dei product_id preferiti (null = non loggato/non caricato)
  // Rimozione del box su schermi stretti: non basta nasconderlo via CSS, va tolto
  // dal render (stesso breakpoint 768px usato nel resto della Home).
  const [isMobile, setIsMobile]     = useState(false);
  // Grafico "Andamento prezzi" (DAV-69): due menu a tendina al posto dei chip.
  // nav = mappa sector_id → { nace_code, nace_label, products:[{id,name}] }.
  const [nav, setNav]                       = useState(null);  // null = in caricamento
  const [selSectorId, setSelSectorId]       = useState("");    // settore scelto nel menu 1
  const [persLabel, setPersLabel]           = useState(null);  // "Dai tuoi preferiti" | "Hai già ordinato questo prodotto"
  const [marketSel, setMarketSel]           = useState(null);  // {id,name} | null (prodotto €/kg selezionato)
  const [marketData, setMarketData]         = useState(null);  // {series,fonte,fonte_url,last_date}
  // Indici settoriali Eurostat (metalli/plastica/chimica): tendenza, non €/kg.
  const [indexSectors, setIndexSectors]     = useState([]);    // [{nace_code,nace_label,series,...}]
  const [indexSel, setIndexSel]             = useState(null);  // sector selezionato | null
  // Ticker tape in testa alla homepage: indici settoriali Eurostat (PPI) per
  // prodotto (get_price_ticker), non prezzi reali €/kg — DAV-67.
  // null = in caricamento (la fascia resta visibile, niente salto di layout);
  // [] = vuoto/errore confermato → la fascia sparisce.
  const [tickerData, setTickerData]         = useState(null);
  // Box hero AI: il campo di testo è un "innesco" verso l'assistente vero (widget
  // flottante). Scrivendo e inviando qui, si apre il widget con il messaggio già inviato.
  const chatWidgetRef = useRef(null);
  const [heroChat, setHeroChat] = useState("");
  const sendHeroChat = () => {
    const t = heroChat.trim();
    if (!t) return;
    chatWidgetRef.current?.openWithMessage(t);
    setHeroChat("");
  };

  // Stato iniziale dalla cache sincrona: al remount della pagina (swap shell
  // statica → dinamica di cacheComponents) il box categorie non flasha vuoto.
  const [macros, setMacros]               = useState(() => getMacroAreasCached() || []);
  const [activeMacro, setActiveMacroState]   = useState(() => _discoverySel.macro);
  const [activeSector, setActiveSectorState] = useState(() => _discoverySel.sector);
  const [sectorProducts, setSectorProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const setActiveMacro  = (m) => { _discoverySel.macro = m; setActiveMacroState(m); };
  const setActiveSector = (s) => { _discoverySel.sector = s; setActiveSectorState(s); };

  // Statistiche REALI (niente più numeri finti): conta-su animato verso i valori
  // veri restituiti da get_homepage_stats.
  useEffect(() => {
    let timer;
    getHomepageStats().then((s) => {
      if (!s) return;
      setStats(s);
      const targets = {
        pools: Number(s.active_pools) || 0,
        materials: Number(s.products) || 0,
        suppliers: Number(s.suppliers) || 0,
        countries: Number(s.countries) || 0,
      };
      let step = 0;
      timer = setInterval(() => {
        step++; const e = 1 - Math.pow(1 - step/60, 3);
        // Mai mostrare "0" per un valore reale positivo: il conta-su parte da 1
        // (per "1 asta attiva" il primo frame direbbe "0 aste" — DAV-68).
        const shown = (t) => t > 0 ? Math.max(1, Math.round(t*e)) : 0;
        setCount({
          pools: shown(targets.pools), materials: shown(targets.materials),
          suppliers: shown(targets.suppliers), countries: shown(targets.countries),
        });
        if (step >= 60) { clearInterval(timer); setCount(targets); }
      }, 1800/60);
    }).catch(() => {});
    return () => { if (timer) clearInterval(timer); };
  }, []);

  useEffect(() => { getMacroAreas().then(setMacros).catch(() => {}); }, []);

  useEffect(() => { getPriceTicker(12).then(d => setTickerData(d || [])).catch(() => setTickerData([])); }, []);

  // Seleziona un prodotto reale → carica la sua serie €/kg.
  const selectMarketProduct = (p) => {
    setIndexSel(null);
    setMarketSel(p); setMarketData(null);
    getMarketPriceSeries(p.id).then(setMarketData).catch(() => setMarketData(null));
  };
  // Seleziona un settore indice (serie già inclusa nel payload).
  const selectIndexSector = (sec) => { setMarketSel(null); setMarketData(null); setIndexSel(sec); };

  // Menu 1: settore scelto a mano → voce di default nel menu 2 (indice PPI se
  // il settore ne ha uno con dati, altrimenti il primo prodotto con serie).
  const applySector = (sectorId, navMap = nav, idxArr = indexSectors) => {
    setSelSectorId(sectorId); setPersLabel(null);
    const entry = navMap?.[sectorId];
    if (!entry) return;
    const idxObj = entry.nace_code ? (idxArr || []).find(x => x.nace_code === entry.nace_code) : null;
    if (idxObj) selectIndexSector(idxObj);
    else if ((entry.products || []).length) selectMarketProduct(entry.products[0]);
    else { setMarketSel(null); setIndexSel(null); setMarketData(null); }
  };

  // Navigazione del selettore + indici Eurostat in un'unica catena, poi il
  // DEFAULT alla prima apertura con priorità rigida (DAV-69):
  //   1. preferito più recente con serie (watched_materials) → "Dai tuoi preferiti"
  //   2. ultimo ordine da acquirente con serie → "Hai già ordinato questo prodotto"
  //   3. settore seguito (sector_follows) → indice PPI o primo prodotto del settore
  //   4. anonimo / nessuno storico → Risone (la serie con più storico e più
  //      movimento: 180 rilevazioni, CV 30% — misurato il 02/08/2026)
  useEffect(() => {
    let alive = true;
    (async () => {
      const [navArr, idxArr] = await Promise.all([
        getMarketSelectorNav().catch(() => []),
        getMarketIndexSectors().catch(() => []),
      ]);
      if (!alive) return;
      const navMap = Object.fromEntries((navArr || []).map(e => [e.sector_id, e]));
      setNav(navMap); setIndexSectors(idxArr || []);

      const seriesById = {}, productSector = {};
      for (const [sid, e] of Object.entries(navMap)) for (const p of (e.products || [])) {
        seriesById[p.id] = p;
        if (!productSector[p.id]) productSector[p.id] = sid;
      }
      const pickProduct = (p, label) => { setSelSectorId(productSector[p.id] || ""); setPersLabel(label); selectMarketProduct(p); };

      const session = await getSession().catch(() => null);
      if (session) {
        try {
          const wm = await getWatchedMaterials(); // ordinati per created_at asc → il più recente è in coda
          const hit = [...(wm || [])].reverse().find(m => m.product_id && seriesById[m.product_id]);
          if (hit) { if (alive) pickProduct(seriesById[hit.product_id], "Dai tuoi preferiti"); return; }
        } catch { /* preferiti non leggibili → priorità successiva */ }
        try {
          const orders = await getMyOrdersHistory(); // get_my_orders non espone product_id: abbino per nome canonico
          const byName = Object.fromEntries(Object.values(seriesById).map(p => [String(p.name).toLowerCase(), p]));
          const hit = (orders || [])
            .filter(o => o.role === "buyer")
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .map(o => byName[String(o.product_name || "").toLowerCase()])
            .find(Boolean);
          if (hit) { if (alive) pickProduct(hit, "Hai già ordinato questo prodotto"); return; }
        } catch { /* → priorità successiva */ }
        try {
          const fs = await getMyFollowedSectors();
          const first = (fs || []).find(f => navMap[f.sector_id]);
          if (first) { if (alive) applySector(first.sector_id, navMap, idxArr); return; }
        } catch { /* → fallback anonimo */ }
      }
      if (!alive) return;
      const all = Object.values(seriesById);
      const pref = all.find(p => /risone/i.test(p.name || "")) || all[0];
      if (pref) pickProduct(pref, null);
      else if ((idxArr || []).length) {
        const sid = Object.keys(navMap).find(k => navMap[k].nace_code === idxArr[0].nace_code);
        if (sid) applySector(sid, navMap, idxArr);
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Carica le aste attive UNA volta. get_active_pools() torna già ordinato per
  // closes_at asc (stessa RPC/ordinamento "Chiusura più vicina" di /pool). I
  // preferiti dell'utente loggato hanno priorità nella selezione (vedi orderedPools).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ps = await getActivePools();                  // già ordinate per chiusura
        if (!alive) return;
        setPools(ps || []);
        const session = await getSession().catch(() => null);
        if (session) {
          try {
            const favs = await getMyFollowedProducts();
            if (alive) setFavIds(new Set((favs || []).map(f => f.product_id)));
          } catch { /* preferiti non disponibili → nessuna priorità preferiti */ }
        }
      } catch { if (alive) setPools([]); }
    })();
    return () => { alive = false; };
  }, []);

  // Traccia il breakpoint mobile (768px) per togliere il box dal DOM su mobile.
  useEffect(() => {
    const mq = window.matchMedia("(max-width:768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const loadSectorProducts = (sec) => {
    setSectorProducts([]); setLoadingProducts(true);
    getSectorProducts(sec.id)
      .then((ps) => { setSectorProducts(ps); setLoadingProducts(false); })
      .catch(() => setLoadingProducts(false));
  };

  // dopo un remount con sotto-area già aperta (selezione preservata sopra),
  // ricarica i suoi prodotti
  useEffect(() => { if (activeSector) loadSectorProducts(activeSector); }, []);

  // apre una sotto-area e carica SOLO i suoi prodotti (filtro rigoroso per settore)
  const openSector = (sec) => {
    if (activeSector?.id === sec.id) { setActiveSector(null); setSectorProducts([]); return; }
    setActiveSector(sec);
    loadSectorProducts(sec);
  };

  const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706" };

  // Aste ordinate con PRIORITÀ ai preferiti: prima le aste sui prodotti seguiti
  // (già ordinate per chiusura), poi le altre. Alimenta sia il box in evidenza
  // (prima asta) sia la griglia "Aste attive ora" (prime 3).
  const poolsLoading = pools === undefined;
  const orderedPools = (() => {
    if (!Array.isArray(pools) || pools.length === 0) return [];
    if (favIds && favIds.size > 0) {
      const fav = pools.filter(p => favIds.has(p.product_id));
      const rest = pools.filter(p => !favIds.has(p.product_id));
      return [...fav, ...rest];
    }
    return pools;
  })();
  const fp = orderedPools[0] || null;      // box "asta più vicina"
  const box = fp ? deriveFeatured(fp) : null;
  const top3 = orderedPools.slice(0, 3);   // griglia "Aste attive ora"
  // Etichetta categoria compatta dal primo macro-slug REALE del prodotto (o null se
  // il prodotto non ha un settore/macro assegnato → badge omesso, niente valori finti).
  const macroLabel = (p) => {
    const slug = Array.isArray(p.macros) ? p.macros[0] : null;
    if (!slug) return null;
    const m = macros.find(x => x.slug === slug);
    return m ? m.name.split(/[,&]/)[0].trim() : null;
  };

  // Grafico prezzi: agri reale (€/kg) OPPURE indice settoriale Eurostat.
  const showingReal = !!marketSel;    // agri €/kg
  const showingIndex = !!indexSel;    // indice settoriale (tendenza)
  const realSeries = (marketData?.series || []).map(pt => {
    const [, m, d] = String(pt.t).slice(0, 10).split("-");
    return { t: `${d}/${m}`, v: Number(pt.v) };
  });
  const indexPts = showingIndex
    ? (indexSel.series || []).filter(pt => pt.index != null).map(pt => {
        const [y, m] = String(pt.t).slice(0, 10).split("-");
        return { t: `${m}/${y.slice(2)}`, v: Number(pt.index) };
      })
    : [];
  const chartData = showingIndex ? indexPts : realSeries;
  const lastPrice = showingIndex
    ? (indexPts.length ? indexPts[indexPts.length - 1].v : null)
    : (showingReal ? (realSeries.length ? realSeries[realSeries.length - 1].v : null) : null);
  // Variazione "da gennaio" (da inizio anno) sul prezzo REALE €/kg.
  const marketYtd = showingReal ? ytdChange(marketData?.series || [], "v") : null;
  // Per gli INDICI la variazione è anno su anno: il campo pct della serie è già
  // il confronto con lo stesso mese dell'anno precedente (Eurostat).
  const indexYoY = showingIndex
    ? (() => { const pts = (indexSel.series || []).filter(p => p.index != null && p.pct != null); return pts.length ? Number(pts[pts.length - 1].pct) : null; })()
    : null;
  // Asse Y: dominio su min/max reali con margine e decimali dinamici, così due
  // tick non stampano MAI la stessa etichetta (le serie quasi piatte, tipo
  // Grano duro, arrotondavano tutti i tick a "€0,27" — DAV-69).
  const yAxis = (() => {
    const vals = chartData.map(p => Number(p.v)).filter(Number.isFinite);
    const base = showingIndex ? 0 : 2;
    const fmtAt = (dec) => (v) => (showingIndex ? "" : "€") + Number(v).toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (!vals.length) return { domain: ["auto", "auto"], dec: base, fmt: fmtAt(base) };
    const vMin = Math.min(...vals), vMax = Math.max(...vals);
    const span = vMax - vMin;
    const pad = span > 0 ? span * 0.15 : Math.max(Math.abs(vMax) * 0.01, showingIndex ? 1 : 0.005);
    const spacing = (span + 2 * pad) / 4;                 // 5 tick di default in recharts
    const dec = Math.min(4, Math.max(base, Math.ceil(-Math.log10(spacing))));
    return { domain: [vMin - pad, vMax + pad], dec, fmt: fmtAt(dec) };
  })();

  return (
    <div style={{ backgroundColor:"#FFFFFF", color:C.text, minHeight:"100vh", overflowX:"hidden", colorScheme:"light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .bs-ticker-wrap { overflow:hidden; width:100%; -webkit-mask-image:linear-gradient(to right,transparent,#000 80px,#000 calc(100% - 80px),transparent); mask-image:linear-gradient(to right,transparent,#000 80px,#000 calc(100% - 80px),transparent); }
        .bs-ticker { display:flex; width:max-content; animation:tick 45s linear infinite; }
        .bs-ticker:hover { animation-play-state:paused; }
        @keyframes tick { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        .bs-num { font-family:'JetBrains Mono',monospace; }
        /* DAV-72: griglia wrap (8x2 desktop, 4x4 mobile) al posto dello scroll
           orizzontale — tutte le 16 macro-aree sempre visibili, niente tagli.
           Tile a 3 toni: bianco / nero / blu petrolio (#0C4A6E, dal logo). */
        .bs-cats { display:grid; grid-template-columns:repeat(8,minmax(0,1fr)); gap:10px 12px; padding:20px 24px; }
        .bs-cat { display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:7px; cursor:pointer; background:#fff; border:1px solid #E2E8F0; border-radius:12px; padding:12px 6px 10px; transition:all 0.15s; }
        .bs-cat:hover { transform:translateY(-2px); border-color:#0C4A6E; }
        .bs-cat.active { background:#0C4A6E; border-color:#0C4A6E; }
        .bs-cat-label { text-align:center; line-height:1.25; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; }
        .bs-section { max-width:1280px; margin:0 auto; padding:64px 24px; }
        .bs-card { background:#FFFFFF; border:1px solid ${C.border}; border-radius:16px; padding:24px; transition:box-shadow 0.2s,transform 0.2s; }
        .bs-card:hover { box-shadow:0 8px 32px rgba(14,165,233,0.10); transform:translateY(-2px); }
        .bs-btn { background:#0369A1; color:#fff; border:none; border-radius:10px; padding:13px 24px; font-size:15px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:8px; transition:all 0.2s; font-family:inherit; }
        .bs-btn:hover { background:#075985; transform:translateY(-1px); box-shadow:0 6px 20px rgba(3,105,161,0.3); }
        .bs-btn-out { background:transparent; color:#0369A1; border:1.5px solid #0369A1; border-radius:10px; padding:12px 24px; font-size:15px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:8px; font-family:inherit; transition:all 0.2s; }
        .bs-btn-out:hover { background:#EFF6FF; }
        .bs-pool-btn { width:100%; background:transparent; color:#0369A1; border:1.5px solid #E2E8F0; border-radius:8px; padding:10px; font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; font-family:inherit; transition:all 0.2s; }
        .bs-pool-btn:hover { border-color:#0369A1; background:#EFF6FF; }
        .bs-tab { padding:9px 22px; border-radius:100px; font-size:14px; font-weight:600; cursor:pointer; border:1.5px solid; transition:all 0.2s; font-family:inherit; }
        .bs-select { width:100%; max-width:440px; padding:10px 12px; border:1px solid #E2E8F0; border-radius:9px; font-size:14px; color:#0F172A; background:#fff; font-family:inherit; cursor:pointer; outline:none; }
        .bs-select:focus { border-color:#0369A1; box-shadow:0 0 0 3px rgba(3,105,161,0.12); }
        .bs-select:disabled { color:#94A3B8; cursor:default; }
        .bs-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#0369A1; margin-bottom:8px; }
        .bs-h2 { font-size:34px; font-weight:800; letter-spacing:-0.02em; }
        .bs-progress { height:6px; background:#E2E8F0; border-radius:100px; overflow:hidden; }
        .bs-progress-bar { height:100%; border-radius:100px; transition:width 1.2s ease; }
        @keyframes bs-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        .bs-chatbot { position:fixed; bottom:24px; right:24px; z-index:1000; }
        .bs-chatbot-panel { position:absolute; bottom:70px; right:0; width:300px; background:#fff; border-radius:16px; border:1px solid #E2E8F0; box-shadow:0 20px 60px rgba(0,0,0,0.15); overflow:hidden; }
        .bs-chatbot-btn { width:56px; height:56px; border-radius:50%; background:#0369A1; border:3px solid #fff; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 20px rgba(3,105,161,0.4); transition:transform 0.2s; }
        .bs-chatbot-btn:hover { transform:scale(1.08); }
        .bs-hamburger-btn { display:none; background:none; border:none; cursor:pointer; padding:6px; margin:-6px; flex-shrink:0; }
        .bs-search-mobile-row { display:none; }
        .bs-mobile-menu-panel { display:none; }
        @media (max-width:768px) {
          .bs-grid-2 { grid-template-columns:1fr !important; gap:32px !important; }
          .bs-grid-3 { grid-template-columns:1fr !important; }
          .cf-grid { grid-template-columns:1fr !important; gap:28px !important; }
          .bs-grid-4 { grid-template-columns:repeat(2,1fr) !important; }
          .bs-h2 { font-size:26px; }
          .bs-hero-h1 { font-size:32px !important; }
          .bs-section { padding:48px 16px; }
          .bs-nav-links { display:none !important; }
          .bs-cta-btns { flex-direction:column !important; }
          .bs-hero-grid { grid-template-columns:1fr !important; gap:32px !important; }
          .bs-hamburger-btn { display:flex !important; align-items:center; justify-content:center; }
          .bs-logo-wrap { flex:1 !important; display:flex !important; justify-content:center !important; }
          .bs-search-desktop { display:none !important; }
          .bs-search-mobile-row { display:block !important; padding:10px 16px 14px; border-top:1px solid ${C.border}; }
          .bs-mobile-menu-panel { display:block !important; border-top:1px solid ${C.border}; background:#fff; }
          .bs-cats { grid-template-columns:repeat(4,minmax(0,1fr)) !important; gap:8px !important; padding:16px !important; }
          .bs-cat-label { font-size:12px !important; }
        }
      `}</style>

      {/* ── NAVBAR ── */}
      <BulkStrikeNav />

      {/* ── TICKER TAPE: indici settoriali Eurostat (PPI), MAI prezzi reali €/kg ── */}
      {(tickerData == null || tickerData.length > 0) && (
        <div style={{ background:"#07111E", borderBottom:`1px solid #1A3454`, padding:"10px 0", display:"flex", alignItems:"center" }}>
          <div style={{ flex:"0 0 auto", display:"flex", alignItems:"center", gap:8, padding:"0 16px 0 24px", borderRight:"1px solid #1A3454", whiteSpace:"nowrap" }}>
            <BarChart3 size={15} color="#6B94B8" />
            <span style={{ fontSize:11.5, color:"#6B94B8", lineHeight:1.3 }}>
              Indici settoriali<br/><b style={{ color:"#9FC3E8" }}>Eurostat</b> (PPI)
            </span>
          </div>
          <div className="bs-ticker-wrap">
            {Array.isArray(tickerData) && (
              <div className="bs-ticker">
                {[...tickerData,...tickerData].map((item,i) => (
                  <div
                    key={i}
                    title={`${item.nace_label || ""} · indice di settore — fonte Eurostat (PPI, base 2021=100) · ${monthLabel(item.ref_month)}`}
                    style={{ display:"flex", alignItems:"center", gap:8, padding:"0 24px", whiteSpace:"nowrap" }}
                  >
                    <span style={{ fontSize:13, color:"#6B94B8" }}>{item.product_name}</span>
                    <span className="bs-num" style={{ fontSize:13, fontWeight:600, color:"#F0F6FF" }}>idx {fmt1(item.index_value)}</span>
                    {item.pct_change_ytd != null ? (
                      <span className="bs-num" style={{ fontSize:12, color:item.pct_change_ytd>=0?"#10B981":"#F43F5E" }}>
                        {item.pct_change_ytd>=0?"▲":"▼"} {fmt1(Math.abs(item.pct_change_ytd))}% da gennaio
                      </span>
                    ) : (
                      <span className="bs-num" style={{ fontSize:12, color:"#6B94B8" }}>—</span>
                    )}
                    <span style={{ color:"#1A3454", margin:"0 4px" }}>·</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DISCOVERY a due livelli: macro-aree → sotto-aree → prodotti ── */}
      <div style={{ borderBottom:`1px solid ${C.border}`, background:"#fff" }}>
        <div style={{ maxWidth:1280, margin:"0 auto" }}>
          {/* livello 1: macro-aree — griglia 8x2 (4x4 su mobile), tile a 3 toni:
              non selezionata bianco/bordo grigio, selezionata blu petrolio pieno */}
          <div className="bs-cats">
            {macros.map(m => {
              const on = activeMacro?.id === m.id;
              const Ico = MACRO_ICONS[m.slug] || Package;
              return (
                <div key={m.id} className={`bs-cat${on?" active":""}`}
                     onClick={() => { const next = on ? null : m; setActiveMacro(next); setActiveSector(null); setSectorProducts([]); }}>
                  <Ico size={22} strokeWidth={1.8} color={on ? "#fff" : PETROL} />
                  <span className="bs-cat-label" style={{ fontSize:12.5, color:on?"#fff":"#0F172A", textAlign:"center", fontWeight:on?700:500 }}>
                    {m.name}
                  </span>
                </div>
              );
            })}
          </div>

          {/* livello 2: sotto-aree della macro selezionata */}
          {activeMacro && (
            <div style={{ padding:"12px 16px", display:"flex", flexWrap:"wrap", gap:8, borderTop:`1px solid ${C.border}`, background:"#FAFCFF" }}>
              {(activeMacro.sub_areas || []).filter(s => (s.product_count||0) > 0).map(s => {
                const on = activeSector?.id === s.id;
                return (
                  <div key={s.id} onClick={() => openSector(s)}
                       style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"8px 14px", borderRadius:100, cursor:"pointer",
                                border:`1.5px solid ${on?"#0369A1":C.border}`, background:on?"#EFF6FF":"#fff",
                                fontSize:13, fontWeight:on?700:500, color:on?"#0369A1":C.text, whiteSpace:"nowrap" }}>
                    {s.name}
                    <span style={{ fontSize:11, color:on?"#0369A1":C.muted, background:on?"#DBEAFE":"#F1F5F9", borderRadius:100, padding:"1px 7px", fontWeight:700 }}>{s.product_count}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* livello 3: prodotti della sotto-area selezionata (solo di quel settore) */}
          {activeSector && (
            <div style={{ padding:"14px 16px 20px", borderTop:`1px solid ${C.border}` }}>
              {loadingProducts ? (
                <div style={{ fontSize:13, color:C.muted, padding:"8px 2px" }}>Caricamento prodotti…</div>
              ) : (
                <>
                  <div style={{ fontSize:13, color:C.muted, margin:"0 0 10px" }}>
                    {sectorProducts.length} prodotti in <b style={{ color:C.text }}>{activeSector.name}</b>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:8 }}>
                    {sectorProducts.map(p => (
                      <div key={p.id} onClick={() => { window.location.href = `/prodotto?id=${p.id}`; }}
                           style={{ padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:9, cursor:"pointer", fontSize:13, color:C.text, background:"#fff", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                        <span>{p.canonical_name}</span>
                        <ChevronRight size={14} color={C.muted} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── HERO ── */}
      <div className="bs-section" style={{ paddingTop:56, paddingBottom:56 }}>
        <div className="bs-hero-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:56, alignItems:"center" }}>
          <div>
            <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:100, padding:"6px 14px", marginBottom:20 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:C.green, boxShadow:`0 0 6px ${C.green}` }} />
              <span style={{ fontSize:13, color:"#1D4ED8", fontWeight:600 }}>
                {/* valore reale diretto, non il conta-su: mai un "0 aste attive" transitorio */}
                {stats && stats.active_pools > 0
                  ? `${Number(stats.active_pools)} ${Number(stats.active_pools) === 1 ? "asta attiva" : "aste attive"} in questo momento`
                  : "Aste a ribasso in tempo reale"}
              </span>
            </div>
            <h1 className="bs-hero-h1" style={{ fontSize:52, fontWeight:900, lineHeight:1.06, letterSpacing:"-0.03em", marginBottom:18 }}>
              Il mercato delle{" "}
              <span style={{ background:"linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>materie prime</span>{" "}
              a prezzi industriali
            </h1>
            <p style={{ fontSize:17, color:C.muted, lineHeight:1.65, marginBottom:28, maxWidth:460 }}>
              Acquista sfuso insieme ad altri. Vendi a chi vuole davvero comprare. Aste a ribasso, aggregazione della domanda, prezzi in tempo reale. Da 1 kg a 50 tonnellate.
            </p>
            <div className="bs-cta-btns" style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              <button className="bs-btn" onClick={() => { window.location.href = "/registrati"; }}>Inizia ad acquistare <ArrowRight size={18} /></button>
              <button className="bs-btn-out" onClick={() => { window.location.href = "/registrati"; }}>Diventa fornitore</button>
            </div>
            <div style={{ display:"flex", gap:20, marginTop:20, flexWrap:"wrap" }}>
              {["Registrazione gratuita","Nessun abbonamento","Asta senza impegno"].map(t => (
                <span key={t} style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:13, color:C.muted }}>
                  <Check size={14} color={C.green} strokeWidth={2.5} />{t}
                </span>
              ))}
            </div>
          </div>
          {/* Hero pool card — asta REALE più vicina alla chiusura (preferiti se
              disponibili). Rimossa dal DOM su mobile: sotto c'è già "Aste attive ora". */}
          {!isMobile && (
            poolsLoading ? (
              // Skeleton di caricamento (evita il flash del contenuto finto)
              <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, padding:24, boxShadow:"0 4px 24px rgba(14,165,233,0.08)" }}>
                <div style={{ fontSize:11, color:C.muted, marginBottom:12 }}>Asta più vicina alla chiusura</div>
                <div style={{ height:20, width:"70%", background:"#F1F5F9", borderRadius:6, marginBottom:10 }} />
                <div style={{ height:12, width:"50%", background:"#F1F5F9", borderRadius:6, marginBottom:20 }} />
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18 }}>
                  <div style={{ height:64, background:C.bg, borderRadius:10 }} />
                  <div style={{ height:64, background:C.bg, borderRadius:10 }} />
                </div>
                <div className="bs-progress" style={{ marginBottom:16 }}><div className="bs-progress-bar" style={{ background:"#E2E8F0", width:"40%" }} /></div>
                <div style={{ height:46, background:"#F1F5F9", borderRadius:10 }} />
              </div>
            ) : fp ? (
              // Box con dati reali
              <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, padding:24, boxShadow:"0 4px 24px rgba(14,165,233,0.08)", position:"relative" }}>
                {box.almost && (
                  <div style={{ position:"absolute", top:-12, right:16, background:C.red, borderRadius:100, padding:"4px 12px", fontSize:12, fontWeight:700, color:"#fff", display:"inline-flex", alignItems:"center", gap:5 }}><Flame size={12} /> Quasi completo</div>
                )}
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>Asta più vicina alla chiusura</div>
                  <div style={{ fontSize:19, fontWeight:800, color:C.text, marginBottom:2 }}>{fp.product_name}</div>
                  <div style={{ fontSize:13, color:C.muted }}>
                    {[
                      fp.product_enum,
                      // mai "0 fornitori in gara": con zero offerte mostra il volume aggregato
                      Number(fp.num_bids) > 0
                        ? `${fp.num_bids} ${Number(fp.num_bids) === 1 ? "fornitore" : "fornitori"} in gara`
                        : `${kgFmt(box.vol)} kg già aggregati`,
                      box.closeIso ? `chiude tra ${timeLeft(box.closeIso)}` : null,
                    ].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18 }}>
                  <div style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>Prezzo asta all-in</div>
                    <div className="bs-num" style={{ fontSize:24, fontWeight:700, color:C.blue }}>{eurKg(box.effective)}<span style={{ fontSize:12, fontWeight:400 }}>/kg</span></div>
                  </div>
                  <div style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>Risparmio</div>
                    <div className="bs-num" style={{ fontSize:24, fontWeight:700, color:C.green }}>-{box.savingsPct}%</div>
                    <div style={{ fontSize:11, color:C.muted }}>vs {eurKg(box.quick)}/kg singolo</div>
                  </div>
                </div>
                {box.state === "A" ? (
                  // STATO A: c'è uno scaglione successivo → la leva è il volume
                  <div style={{ marginBottom:16 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                      <span style={{ fontSize:13, color:C.muted }}>Volume raccolto</span>
                      <span className="bs-num" style={{ fontSize:13, fontWeight:600 }}>{kgFmt(box.vol)} / {kgFmt(box.barTarget)} kg</span>
                    </div>
                    <div className="bs-progress">
                      <div className="bs-progress-bar" style={{ background: box.pct >= 80 ? `linear-gradient(90deg,${C.amber},${C.red})` : `linear-gradient(90deg,${C.blue},#22D3EE)`, width:`${box.pct}%` }} />
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:5 }}>
                      <span style={{ fontSize:12, color: box.pct >= 80 ? C.amber : C.muted, fontWeight:600 }}>{box.pct}%{box.almost ? " — quasi pieno!" : ""}</span>
                      <span style={{ fontSize:12, color:C.muted }}>Mancano {kgFmt(box.toNext)} kg → {eurKg(box.nextPrice)}/kg</span>
                    </div>
                  </div>
                ) : (
                  // STATO B/C: niente più da sbloccare → niente celebrazione, la leva
                  // è la scadenza: countdown protagonista, prezzo garantito sotto.
                  <div style={{ marginBottom:16, background:"#F0F9FF", border:"1px solid #BAE6FD", borderRadius:10, padding:"12px 14px", display:"flex", alignItems:"center", gap:10 }}>
                    <Clock size={20} color="#0369A1" />
                    <div>
                      <div style={{ fontSize:15, fontWeight:800, color:C.text }}>{box.closeIso ? `Chiusura tra ${timeLeft(box.closeIso)}` : "In chiusura"}</div>
                      <div style={{ fontSize:12.5, color:C.muted }}>
                        {box.state === "B" ? `Prezzo bloccato ${eurKg(box.effective)}/kg — non può più peggiorare` : `Prezzo ${eurKg(box.effective)}/kg`}
                      </div>
                    </div>
                  </div>
                )}
                <button className="bs-btn" onClick={() => { window.location.href = `/pool?id=${fp.id}`; }} style={{ width:"100%", justifyContent:"center" }}>Visualizza l'asta a ribasso <ArrowRight size={16} /></button>
                <div style={{ textAlign:"center", fontSize:12.5, color:C.muted, margin:"10px 0" }}>oppure</div>
                <button className="bs-btn-out" onClick={() => { window.location.href = `/prodotto?id=${fp.product_id}`; }} style={{ width:"100%", justifyContent:"center" }}>Acquista subito</button>
              </div>
            ) : (
              // Fallback: nessuna asta attiva in piattaforma
              <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, padding:24, boxShadow:"0 4px 24px rgba(14,165,233,0.08)", display:"flex", flexDirection:"column", gap:14 }}>
                <div>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>Aste a ribasso</div>
                  <div style={{ fontSize:19, fontWeight:800, color:C.text, marginBottom:6 }}>Nessuna asta attiva in questo momento</div>
                  <div style={{ fontSize:13.5, color:C.muted, lineHeight:1.6 }}>Apri tu la prossima asta a ribasso dalla pagina di un prodotto, oppure acquista subito al miglior prezzo dal catalogo.</div>
                </div>
                <button className="bs-btn" onClick={() => { window.location.href = "/catalogo"; }} style={{ width:"100%", justifyContent:"center" }}>Esplora il catalogo <ArrowRight size={16} /></button>
                <button className="bs-btn-out" onClick={() => { window.location.href = "/pool"; }} style={{ width:"100%", justifyContent:"center" }}>Vedi tutte le aste</button>
              </div>
            )
          )}
        </div>
      </div>

      {/* ── STATS BAR ── */}
      <div style={{ background:C.bg, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1280, margin:"0 auto", padding:"36px 24px" }}>
          <div className="bs-grid-4" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:24 }}>
            {[
              { label:"Aste attive ora",    val:count.pools,     suffix:"",  color:"#0EA5E9" },
              { label:"Materie prime",      val:count.materials, suffix:"",  color:"#0284C7" },
              { label:"Fornitori",          val:count.suppliers, suffix:"",  color:C.amber },
              { label:"Paesi coperti",      val:count.countries, suffix:"",  color:C.green },
            ].map(({ label, val, suffix, color }) => (
              <div key={label} style={{ textAlign:"center" }}>
                {stats == null ? (
                  // Skeleton pulsante finché i contatori reali non arrivano: mai "0"
                  <div style={{ height:48, width:96, maxWidth:"80%", margin:"0 auto", background:"#E2E8F0", borderRadius:10, animation:"bs-pulse 1.2s ease-in-out infinite" }} />
                ) : (
                  <div className="bs-num" style={{ fontSize:40, fontWeight:800, color, letterSpacing:"-0.02em" }}>{val.toLocaleString("it-IT")}{suffix}</div>
                )}
                <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ACTIVE POOLS ── */}
      <div className="bs-section">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:36, flexWrap:"wrap", gap:12 }}>
          <div>
            <div className="bs-label">Mercato Live</div>
            <h2 className="bs-h2">Aste attive ora</h2>
            <p style={{ fontSize:15, color:C.muted, marginTop:8 }}>Risparmia fino al 20% rispetto ai prezzi singoli</p>
          </div>
          <button onClick={() => { window.location.href = "/pool"; }} style={{ display:"flex", alignItems:"center", gap:6, color:"#0369A1", background:"none", border:"none", fontSize:14, fontWeight:600, cursor:"pointer" }}>
            Vedi tutti <ChevronRight size={16} />
          </button>
        </div>
        {poolsLoading ? (
          // Skeleton: 3 card placeholder mentre carica (niente contenuto finto)
          <div className="bs-grid-3" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
            {[0,1,2].map(i => (
              <div key={i} className="bs-card">
                <div style={{ height:16, width:"40%", background:"#F1F5F9", borderRadius:5, marginBottom:10 }} />
                <div style={{ height:18, width:"70%", background:"#F1F5F9", borderRadius:5, marginBottom:18 }} />
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                  <div style={{ height:58, background:C.bg, borderRadius:10 }} />
                  <div style={{ height:58, background:C.bg, borderRadius:10 }} />
                </div>
                <div className="bs-progress" style={{ marginBottom:14 }}><div className="bs-progress-bar" style={{ background:"#E2E8F0", width:"45%" }} /></div>
                <div style={{ height:40, background:"#F1F5F9", borderRadius:8 }} />
              </div>
            ))}
          </div>
        ) : top3.length === 0 ? (
          // Stato vuoto: nessuna asta aperta → invito ad aprirne una
          <div style={{ border:`1px dashed ${C.border}`, borderRadius:16, padding:"40px 24px", textAlign:"center", color:C.muted }}>
            <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:6 }}>Nessuna asta aperta in questo momento — proponi tu la prossima</div>
            <div style={{ fontSize:14, marginBottom:16 }}>Apri un'asta a ribasso dalla pagina di un prodotto del catalogo: gli altri acquirenti potranno unirsi alla tua.</div>
            <button className="bs-btn" onClick={() => { window.location.href = "/catalogo"; }} style={{ display:"inline-flex" }}>Apri la prossima asta <ArrowRight size={16} /></button>
          </div>
        ) : (
          // Griglia adattiva: con 1-2 aste le card si centrano e si allargano,
          // niente colonne vuote (DAV-68).
          <div className="bs-grid-3" style={{ display:"grid", gridTemplateColumns:`repeat(${Math.min(top3.length, 3)},minmax(0,1fr))`, gap:20, maxWidth: top3.length === 1 ? 560 : top3.length === 2 ? 940 : undefined, margin: top3.length < 3 ? "0 auto" : undefined }}>
            {top3.map(pool => {
              const b = deriveFeatured(pool);
              const cat = macroLabel(pool);
              return (
                <div key={pool.id} className="bs-card">
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                    <div>
                      <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
                        {cat && <span style={{ background:"#EFF6FF", color:"#1D4ED8", borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600 }}>{cat}</span>}
                        {b.almost && <span style={{ background:"#FFF1F2", color:C.red, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600, display:"inline-flex", alignItems:"center", gap:4 }}><Flame size={11} /> Quasi pieno</span>}
                      </div>
                      <h3 style={{ fontSize:17, fontWeight:700, marginBottom:2, color:C.text }}>{pool.product_name}</h3>
                      {/* niente grado/purezza inventati; mai "0 fornitori in gara":
                          con zero offerte mostra il volume aggregato */}
                      <p style={{ fontSize:13, color:C.muted }}>
                        {Number(pool.num_bids) > 0
                          ? `${pool.num_bids} ${Number(pool.num_bids) === 1 ? "fornitore in gara" : "fornitori in gara"}`
                          : `${kgFmt(b.vol)} kg già aggregati`}
                      </p>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:4, justifyContent:"flex-end", fontSize:12, color:C.muted }}>
                        <Clock size={11} /> {b.closeIso ? timeLeft(b.closeIso) : "—"}
                      </div>
                      {/* niente bandiere paese inventate: mostro l'E-number solo se esiste */}
                      {pool.product_enum && <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>{pool.product_enum}</div>}
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                    <div style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                      <div style={{ fontSize:11, color:C.muted, marginBottom:2 }}>Prezzo asta</div>
                      <div className="bs-num" style={{ fontSize:20, fontWeight:700, color:C.blue }}>{eurKg(b.effective)}<span style={{ fontSize:11 }}>/kg</span></div>
                    </div>
                    <div style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                      <div style={{ fontSize:11, color:C.muted, marginBottom:2 }}>Risparmio</div>
                      <div className="bs-num" style={{ fontSize:20, fontWeight:700, color:C.green }}>-{b.savingsPct}%</div>
                      <div style={{ fontSize:11, color:C.muted }}>vs {eurKg(b.quick)}/kg</div>
                    </div>
                  </div>
                  {b.state === "A" ? (
                    // STATO A: c'è uno scaglione successivo → gap + prezzo target + barra
                    <div style={{ marginBottom:14 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                        <span style={{ fontSize:12, color:C.muted }}>Volume</span>
                        <span className="bs-num" style={{ fontSize:12, fontWeight:600 }}>{kgFmt(b.vol)} / {kgFmt(b.barTarget)} kg</span>
                      </div>
                      <div className="bs-progress">
                        <div className="bs-progress-bar" style={{ background:b.pct>=80?`linear-gradient(90deg,${C.amber},${C.red})`:`linear-gradient(90deg,${C.blue},#22D3EE)`, width:`${b.pct}%` }} />
                      </div>
                      <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                        <span style={{ fontSize:12, color:C.muted }}>Mancano {kgFmt(b.toNext)} kg → {eurKg(b.nextPrice)}/kg</span>
                        <span style={{ fontSize:12, color:b.pct>=80?C.amber:C.muted }}>{b.pct}%</span>
                      </div>
                    </div>
                  ) : (
                    // STATO B/C: niente da sbloccare → countdown protagonista, niente emoji
                    <div style={{ marginBottom:14, background:"#F0F9FF", border:"1px solid #BAE6FD", borderRadius:10, padding:"10px 12px", display:"flex", alignItems:"center", gap:8 }}>
                      <Clock size={16} color="#0369A1" />
                      <div>
                        <div style={{ fontSize:14, fontWeight:800, color:C.text }}>{b.closeIso ? `Chiusura tra ${timeLeft(b.closeIso)}` : "In chiusura"}</div>
                        <div style={{ fontSize:12, color:C.muted }}>
                          {b.state === "B" ? `Prezzo bloccato ${eurKg(b.effective)}/kg` : `Prezzo ${eurKg(b.effective)}/kg`}
                        </div>
                      </div>
                    </div>
                  )}
                  <button className="bs-pool-btn" onClick={() => { window.location.href = `/pool?id=${pool.id}`; }}>Visualizza l'asta a ribasso <ArrowRight size={14} /></button>
                  <div style={{ textAlign:"center", fontSize:12, color:C.muted, margin:"8px 0" }}>oppure</div>
                  <button className="bs-pool-btn" onClick={() => { window.location.href = `/prodotto?id=${pool.product_id}`; }}>Acquista subito</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── PRICE CHARTS ── */}
      <div style={{ background:C.bg, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}` }}>
        <div className="bs-section">
          {/* align center: il grafico si centra sull'altezza della colonna testo
              anche quando questa cresce (es. etichetta "Dai tuoi preferiti") — DAV-70 */}
          <div className="bs-grid-2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:56, alignItems:"center" }}>
            <div>
              <div className="bs-label">Market Intelligence</div>
              <h2 className="bs-h2" style={{ marginBottom:12 }}>Andamento prezzi in tempo reale</h2>
              <p style={{ fontSize:15, color:C.muted, lineHeight:1.65, marginBottom:24 }}>
                L'andamento dei prezzi delle materie prime, aggiornato di continuo. Per le materie prime agricole i dati provengono dalle fonti ufficiali (ISMEA, CUN Grano Duro).
              </p>
              {/* DAV-69: due menu a tendina al posto dei 17 chip. Menu 1 = macro
                  area (optgroup) → settore; menu 2 = indice PPI del settore (se
                  disponibile) + prodotti del settore con serie €/kg reale. */}
              <div style={{ marginBottom:24, display:"flex", flexDirection:"column", gap:12 }}>
                <div>
                  <div style={{ fontSize:10.5, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:C.muted, marginBottom:6 }}>Categoria e settore</div>
                  <select className="bs-select" value={selSectorId} onChange={e => applySector(e.target.value)} aria-label="Categoria e settore">
                    <option value="" disabled>{nav ? "Seleziona un settore…" : "Caricamento…"}</option>
                    {macros.map(m => {
                      const opts = (m.sub_areas || []).filter(s => nav && nav[s.id]);
                      if (!opts.length) return null;
                      return (
                        <optgroup key={m.id} label={m.name}>
                          {opts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:10.5, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:C.muted, marginBottom:6 }}>Prodotto o indice</div>
                  {(() => {
                    const entry = nav?.[selSectorId];
                    const idxObj = entry?.nace_code ? indexSectors.find(x => x.nace_code === entry.nace_code) : null;
                    return (
                      <select className="bs-select" value={indexSel ? "index" : (marketSel?.id || "")} disabled={!entry}
                        aria-label="Prodotto o indice"
                        onChange={e => {
                          const v = e.target.value; setPersLabel(null);
                          if (v === "index") { if (idxObj) selectIndexSector(idxObj); }
                          else { const p = (entry?.products || []).find(x => x.id === v); if (p) selectMarketProduct(p); }
                        }}>
                        {idxObj && <option value="index">Indice di settore (PPI, base 2021=100)</option>}
                        {(entry?.products || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        {!idxObj && !(entry?.products || []).length && (
                          <option value="" disabled>{entry ? "Nessuna serie disponibile per questo settore" : "Scegli prima un settore"}</option>
                        )}
                      </select>
                    );
                  })()}
                  {persLabel && (
                    <div style={{ marginTop:7, display:"inline-flex", alignItems:"center", fontSize:11.5, color:"#0369A1", background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:100, padding:"2px 10px", fontWeight:600 }}>
                      {persLabel}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap" }}>
                {/* Niente JetBrains Mono qui: a 42px l'avanzamento monospace
                    staccava la virgola dalle cifre ("€0 , 27" — DAV-69). Inter
                    con cifre tabellari tiene i numeri allineati e la virgola
                    attaccata. */}
                <span style={{ fontSize:42, fontWeight:800, color:C.blue, fontVariantNumeric:"tabular-nums", letterSpacing:"-0.01em" }}>
                  {lastPrice != null ? (showingIndex ? fmt1(lastPrice) : `€${fmt2(lastPrice)}`) : "—"}
                </span>
                <span style={{ fontSize:14, color:C.muted }}>{showingIndex ? "indice PPI · base 2021=100 (non un prezzo)" : "/kg · prezzo di mercato"}</span>
              </div>
              {showingIndex ? (indexYoY != null && (
                <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:14, color:indexYoY<=0?C.green:C.red, marginTop:4 }}>
                  {indexYoY<=0 && <TrendingDown size={14} />} {indexYoY>0?"+":""}{fmt1(indexYoY)}% anno su anno
                </div>
              )) : (marketYtd != null && (
                <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:14, color:marketYtd<=0?C.green:C.red, marginTop:4 }}>
                  {marketYtd<=0 && <TrendingDown size={14} />} {marketYtd>0?"+":""}{fmt1(marketYtd)}% da gennaio
                </div>
              ))}
            </div>
            <div>
              {showingReal && realSeries.length === 0 ? (
                <div style={{ height:220, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:C.muted, border:`1px dashed ${C.border}`, borderRadius:12, textAlign:"center", padding:"0 16px" }}>
                  Storico prezzi in raccolta: i dati si popolano a ogni rilevazione.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="t" tick={{ fill:C.muted, fontSize:12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill:C.muted, fontSize:12, fontFamily:"JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={yAxis.fmt} domain={yAxis.domain} />
                    <Tooltip contentStyle={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:10 }} formatter={v=> showingIndex ? [fmt1(v),"Indice PPI"] : [`${yAxis.fmt(v)}/kg`,"Prezzo"]} />
                    <Line type="monotone" dataKey="v" stroke={C.blue} strokeWidth={2.5} dot={showingIndex ? false : { fill:C.blue, r:4, strokeWidth:0 }} activeDot={{ r:6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
              {/* Fonte + dicitura obbligatoria: prezzo reale (agri) o indice settoriale. */}
              {showingIndex ? (
                <div style={{ fontSize:11, color:C.muted, lineHeight:1.5, marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}` }}>
                  Indice di <b>tendenza settoriale</b>, non il prezzo diretto del prodotto: {indexSel.nace_label}. Fonte: {indexSel.fonte_url ? <a href={indexSel.fonte_url} target="_blank" rel="noopener noreferrer" style={{ color:C.blue }}>Eurostat</a> : "Eurostat"}{indexSel.last_month ? ` · ultimo mese ${(() => { const [y,m]=String(indexSel.last_month).slice(0,10).split("-"); return `${m}/${y}`; })()}` : ""}.
                </div>
              ) : (
                <PriceSourceNote fonte={marketData?.fonte} fonteUrl={marketData?.fonte_url} lastDate={marketData?.last_date} muted={C.muted} border={C.border} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <div id="come-funziona" className="bs-section">
        {/* Titolo a SINISTRA sopra tab+passaggi (allineato ai box); video grande a
            DESTRA, alzato fino in cima accanto al titolo. Impilati su mobile
            (titolo/testo sopra, video sotto). Il testo dei passaggi resta come
            alternativa accessibile e indicizzabile. */}
        <div className="cf-grid" style={{ display:"grid", gridTemplateColumns:"1fr minmax(0,500px)", gap:44, alignItems:"start", textAlign:"left" }}>
          <div>
            <div className="bs-label">Come funziona</div>
            <h2 className="bs-h2" style={{ marginBottom:28 }}>Semplice da entrambi i lati</h2>
            <div style={{ display:"flex", gap:8, marginBottom:24, flexWrap:"wrap" }}>
              {["acquirente","fornitore"].map(tab => (
                <button key={tab} className="bs-tab" onClick={() => setActiveTab(tab)}
                  style={{ background:activeTab===tab?"#0369A1":"transparent", color:activeTab===tab?"#fff":C.muted, borderColor:activeTab===tab?"#0369A1":C.border }}>
                  {tab==="acquirente"?"Sono un Acquirente":"Sono un Fornitore"}
                </button>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:14 }}>
              {(activeTab==="acquirente"?BUYER_STEPS:SELLER_STEPS).map((step,i) => (
                <div key={i} className="bs-card" style={{ textAlign:"left", display:"flex", gap:16, alignItems:"flex-start" }}>
                  <div className="bs-num" style={{ fontSize:34, fontWeight:900, color:"#E2E8F0", letterSpacing:"-0.03em", flexShrink:0, lineHeight:1 }}>{step.n}</div>
                  <div>
                    <h3 style={{ fontSize:16.5, fontWeight:700, marginBottom:6, color:C.text }}>{step.title}</h3>
                    <p style={{ fontSize:14, color:C.muted, lineHeight:1.65 }}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <PresentationVideo
            src="https://uufueekpxboygcotqvhu.supabase.co/storage/v1/object/public/marketing/Spot%20BulkStrike.mp4"
            poster="/video/spot-bulkstrike-poster.jpg"
            ariaLabel="Video di presentazione BulkStrike: come funziona il marketplace di materie prime sfuse"
            style={{ width:"100%", maxWidth:500, aspectRatio:"1080 / 1350", margin:"0 auto" }}
          />
        </div>
      </div>

      {/* ── AI ASSISTANT ── */}
      <div style={{ background:C.bg, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}` }}>
        <div className="bs-section">
          <div className="bs-grid-2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:56, alignItems:"center" }}>
            <div>
              <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#F3E8FF", border:"1px solid #D8B4FE", borderRadius:100, padding:"6px 14px", marginBottom:20 }}>
                <Bot size={14} color="#7C3AED" />
                <span style={{ fontSize:13, color:"#7C3AED", fontWeight:600 }}>AI-Powered</span>
              </div>
              <h2 className="bs-h2" style={{ marginBottom:12 }}>Il tuo assistente personale per le materie prime</h2>
              <p style={{ fontSize:15, color:C.muted, lineHeight:1.65, marginBottom:24 }}>
                Descrivi cosa cerchi in italiano. L'AI trova il prodotto, confronta i fornitori, calcola il risparmio e completa l'acquisto con la tua conferma.
              </p>
              {["Trova il fornitore più economico in Europa","Uniscimi all'asta più vantaggiosa","Aggiorna il mio listino prezzi","Quanto ho risparmiato questo mese?"].map(f => (
                <div key={f} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                  <div style={{ width:20, height:20, borderRadius:"50%", background:"#ECFDF5", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <Check size={11} color={C.green} />
                  </div>
                  <span style={{ fontSize:14, color:C.muted }}>{f}</span>
                </div>
              ))}
            </div>
            {/* Chat mockup */}
            <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,0.06)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, background:"#0369A1", padding:"14px 20px" }}>
                <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <Bot size={18} color="white" />
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:"white" }}>BulkStrike AI</div>
                  <div style={{ fontSize:12, color:"rgba(255,255,255,0.8)" }}>● Online</div>
                </div>
              </div>
              <div style={{ padding:"16px 16px 0", display:"flex", flexDirection:"column", gap:10 }}>
                {AI_MSGS.map((msg,i) => (
                  <div key={i} style={{ display:"flex", justifyContent:msg.u?"flex-end":"flex-start" }}>
                    <div style={{
                      maxWidth:"85%", padding:"10px 14px",
                      borderRadius:msg.u?"16px 16px 4px 16px":"16px 16px 16px 4px",
                      background:msg.u?"#0369A1":"#F1F5F9",
                      color:msg.u?"#fff":C.text,
                      fontSize:13, lineHeight:1.55, whiteSpace:"pre-line", wordBreak:"break-word"
                    }}>{msg.t}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:8, padding:"14px 16px", borderTop:`1px solid ${C.border}`, marginTop:14 }}>
                <input
                  value={heroChat}
                  onChange={e => setHeroChat(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendHeroChat(); } }}
                  placeholder="Scrivi un messaggio..."
                  style={{ flex:1, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", fontFamily:"inherit" }} />
                <button onClick={sendHeroChat} disabled={!heroChat.trim()} aria-label="Invia all'assistente"
                  style={{ background:"#0369A1", border:"none", borderRadius:8, width:36, cursor:heroChat.trim()?"pointer":"default", opacity:heroChat.trim()?1:0.5, color:"white", fontWeight:700, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}><ArrowUp size={16} /></button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <div style={{ background:"#07111E" }}>
        <div className="bs-section" style={{ textAlign:"center" }}>
          <h2 style={{ fontSize:40, fontWeight:900, letterSpacing:"-0.03em", marginBottom:14, color:"#F0F6FF" }}>
            Pronto a comprare al <span style={{ background:"linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>prezzo giusto?</span>
          </h2>
          <p style={{ fontSize:16, color:"#6B94B8", marginBottom:36, maxWidth:480, margin:"0 auto 36px" }}>
            Registrazione gratuita. Nessun abbonamento. Unisciti alle {stats?.companies ?? 197} aziende già registrate su BulkStrike.
          </p>
          <div className="bs-cta-btns" style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <button className="bs-btn" onClick={() => { window.location.href = "/registrati"; }} style={{ fontSize:17, padding:"15px 32px" }}>Crea account gratis <ArrowRight size={20} /></button>
            <button onClick={() => { document.getElementById("come-funziona")?.scrollIntoView({ behavior:"smooth" }); }} style={{ background:"transparent", color:"#F0F6FF", border:"1px solid #1A3454", borderRadius:10, padding:"15px 24px", fontSize:16, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Guarda come funziona</button>
          </div>
        </div>
      </div>

      {/* ── ERP INTEGRATION CTA ── */}
      <div style={{ background:"linear-gradient(135deg,#EFF6FF,#ECFEFF)", borderTop:"1px solid #E2E8F0", padding:"56px 24px" }}>
        <div style={{ maxWidth:820, margin:"0 auto", textAlign:"center" }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#fff", border:"1px solid #BAE6FD", borderRadius:100, padding:"6px 14px", fontSize:12, fontWeight:700, color:"#0369A1", marginBottom:18, letterSpacing:"0.03em" }}>
            <Bot size={14} /> INTEGRAZIONE GESTIONALE
            <span style={{ background:"#0369A1", color:"#fff", borderRadius:100, padding:"1px 8px", fontSize:11, letterSpacing:"0.02em" }}>IN ARRIVO</span>
          </div>
          <h2 style={{ fontSize:28, fontWeight:800, letterSpacing:"-0.02em", color:"#0F172A", marginBottom:14, lineHeight:1.25 }}>
            Collega il tuo gestionale a BulkStrike
          </h2>
          <p style={{ fontSize:16, lineHeight:1.6, color:"#475569", marginBottom:26, maxWidth:640, marginLeft:"auto", marginRight:"auto" }}>
            Ordini generati in automatico in base alle tue scadenze e necessità di produzione. È una funzione <b>in arrivo</b>: richiedi l'accesso anticipato per essere tra i primi quando sarà disponibile.
          </p>
          <a href="mailto:info@bulkstrike.com?subject=Accesso%20anticipato%20integrazione%20gestionale%20BulkStrike" style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#0369A1", color:"#fff", fontSize:16, fontWeight:700, padding:"14px 28px", borderRadius:10, textDecoration:"none" }}>
            Richiedi accesso anticipato <ArrowRight size={18} />
          </a>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ background:"#050D18", borderTop:"1px solid #1A3454", padding:"32px 24px" }}>
        <div style={{ maxWidth:1280, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:16 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
            <BSIcon size={28} uid="foot" />
            <div style={{ display:"flex", alignItems:"baseline" }}>
              <span style={{ fontSize:16, fontWeight:900, color:"#F0F6FF", letterSpacing:"-0.03em" }}>Bulk</span>
              <span style={{ fontSize:16, fontWeight:900, letterSpacing:"-0.03em", background:"linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>Strike</span>
            </div>
            <span style={{ fontSize:13, color:"#3B5A7A" }}>— Il mercato B2B delle materie prime sfuse</span>
          </div>
          <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
            {[["Termini","/legale#termini"],["Privacy","/legale#privacy"],["Cookie","/legale#cookie"],["Contatti","mailto:info@bulkstrike.com"]].map(([l,href]) => (
              <a key={l} href={href} style={{ fontSize:13, color:"#3B5A7A", cursor:"pointer", textDecoration:"none" }}>{l}</a>
            ))}
          </div>
          <div style={{ fontSize:13, color:"#3B5A7A" }}>© 2026 BulkStrike S.r.l.</div>
        </div>
      </div>

      {/* ── CHATBOT FISSO ── */}
      <BulkStrikeChatWidget ref={chatWidgetRef} />
      <CookieBanner />
    </div>
  );
}
