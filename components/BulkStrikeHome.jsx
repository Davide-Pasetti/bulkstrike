import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Bot, ArrowRight, Check, Clock, ChevronRight, TrendingDown, ChevronDown } from "lucide-react";
import { getMacroAreas, getMacroAreasCached, getSectorProducts, getActivePools, getMyFollowedProducts, getSession, getProductsWithMarketPrices, getMarketPriceSeries, getHomepageStats } from "@/lib/api";
import { TIERS, tierIndexFor } from "@/lib/tiers";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import PriceSourceNote from "@/components/PriceSourceNote";
import BulkStrikeChatWidget from "@/components/BulkStrikeChatWidget";
import { BSIcon } from "@/components/BSLogo";

// ─── DATA ───────────────────────────────────────────────────────────────────

// icona + colori per i settori reali (chiave = slug dal DB)
const SECTOR_ICONS = {
  "additivi-alimentari":        { icon:"🧂", bg:"#FEFCE8", border:"#FEF08A" },
  "adesivi-sigillanti":         { icon:"🩹", bg:"#FFF7ED", border:"#FED7AA" },
  "alimentare":                 { icon:"🍞", bg:"#FEFCE8", border:"#FDE68A" },
  "carta-cellulosa":            { icon:"📄", bg:"#F8FAFC", border:"#E2E8F0" },
  "chimica-base":               { icon:"🧪", bg:"#EFF6FF", border:"#BFDBFE" },
  "coloranti-pigmenti-vernici": { icon:"🎨", bg:"#FDF4FF", border:"#F5D0FE" },
  "cosmetica-cura-personale":   { icon:"💄", bg:"#FFF1F2", border:"#FECDD3" },
  "detergenti-tensioattivi":    { icon:"🧼", bg:"#ECFEFF", border:"#A5F3FC" },
  "enologia":                   { icon:"🍷", bg:"#FDF2F8", border:"#FBCFE8" },
  "fertilizzanti-agrochimica":  { icon:"🌾", bg:"#F0FDF4", border:"#BBF7D0" },
  "gas-tecnici":                { icon:"⚗️", bg:"#EFF6FF", border:"#BAE6FD" },
  "metalli-leghe":              { icon:"⚙️", bg:"#F1F5F9", border:"#CBD5E1" },
  "plastiche-polimeri":         { icon:"🧴", bg:"#FEF2F2", border:"#FECACA" },
  "sanificazione":              { icon:"🦠", bg:"#F0FDFA", border:"#99F6E4" },
  "solventi-intermedi":         { icon:"🧫", bg:"#F5F3FF", border:"#DDD6FE" },
  "trattamento-acque":          { icon:"💧", bg:"#EFF6FF", border:"#BFDBFE" },
};
const SECTOR_FALLBACK = { icon:"📦", bg:"#F1F5F9", border:"#E2E8F0" };

// ─── FORMATTER + LOGICA ASTA IN EVIDENZA ─────────────────────────────────────
const eurKg = (n) => "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });
const kgFmt = (n) => Number(n || 0).toLocaleString("it-IT");

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
  return { vol, barTarget, pct, toNext, effective, quick, savingsPct, almost, closeIso };
}

const TICKER = [
  { name:"Acido Citrico E330", price:"€0,81", change:-2.3 },
  { name:"Polipropilene GP",   price:"€1,12", change:+1.4 },
  { name:"Carbonato di Calcio",price:"€0,29", change:+3.1 },
  { name:"Acido Solforico 98%",price:"€0,22", change:-0.8 },
  { name:"Bicarbonato di Sodio",price:"€0,41",change:-1.5 },
  { name:"Ossido di Zinco",    price:"€2,45", change:+2.8 },
  { name:"Acido Acetico 99%",  price:"€0,67", change:-0.4 },
  { name:"Etanolo 96%",        price:"€0,58", change:+1.9 },
  { name:"Glicerina USP",      price:"€0,72", change:-0.2 },
  { name:"Cloruro di Sodio",   price:"€0,18", change:+0.5 },
];

const CHART_DATA = {
  "Acido Citrico":  [{t:"Gen",v:0.95},{t:"Feb",v:0.92},{t:"Mar",v:0.89},{t:"Apr",v:0.91},{t:"Mag",v:0.87},{t:"Giu",v:0.85},{t:"Lug",v:0.83},{t:"Ago",v:0.81}],
  "Polipropilene":  [{t:"Gen",v:1.18},{t:"Feb",v:1.15},{t:"Mar",v:1.14},{t:"Apr",v:1.16},{t:"Mag",v:1.13},{t:"Giu",v:1.11},{t:"Lug",v:1.09},{t:"Ago",v:1.12}],
  "Carbonato Ca.":  [{t:"Gen",v:0.36},{t:"Feb",v:0.35},{t:"Mar",v:0.34},{t:"Apr",v:0.35},{t:"Mag",v:0.33},{t:"Giu",v:0.32},{t:"Lug",v:0.31},{t:"Ago",v:0.29}],
};

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
        Usiamo cookie tecnici necessari al funzionamento del sito e, previo consenso, cookie di misurazione. Dettagli nella <a href="/legale#cookie" style={{ color:"#0EA5E9", fontWeight:600 }}>Cookie Policy</a>.
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={() => decide("rejected")} style={{ padding:"9px 16px", borderRadius:9, border:"1.5px solid #CBD5E1", background:"#fff", color:"#334155", fontSize:13, fontWeight:600, cursor:"pointer" }}>Rifiuta</button>
        <button onClick={() => decide("accepted")} style={{ padding:"9px 16px", borderRadius:9, border:"none", background:"#0EA5E9", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>Accetta</button>
      </div>
    </div>
  );
}

export default function BulkStrikeLight() {
  const [sectorsExpanded, setSectorsExpanded] = useState(false); // solo mobile: mostra tutte le icone settore
  const [activeChart, setActiveChart] = useState("Acido Citrico");
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
  // Grafico "Andamento prezzi": prodotti con storico reale (ISMEA/CUN) affiancati
  // ai prodotti mock. marketSel = prodotto reale selezionato (null = mock).
  const [marketProducts, setMarketProducts] = useState([]);   // [{id,name,fonte}]
  const [marketSel, setMarketSel]           = useState(null);  // {id,name} | null
  const [marketData, setMarketData]         = useState(null);  // {series,fonte,fonte_url,last_date}

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
        setCount({
          pools: Math.round(targets.pools*e), materials: Math.round(targets.materials*e),
          suppliers: Math.round(targets.suppliers*e), countries: Math.round(targets.countries*e),
        });
        if (step >= 60) { clearInterval(timer); setCount(targets); }
      }, 1800/60);
    }).catch(() => {});
    return () => { if (timer) clearInterval(timer); };
  }, []);

  useEffect(() => { getMacroAreas().then(setMacros).catch(() => {}); }, []);

  // Prodotti con storico prezzi reale, per i tab del grafico Market Intelligence.
  useEffect(() => { getProductsWithMarketPrices().then(setMarketProducts).catch(() => {}); }, []);

  // Seleziona un prodotto reale nel grafico → carica la sua serie storica.
  const selectMarketProduct = (p) => {
    setMarketSel(p); setMarketData(null);
    getMarketPriceSeries(p.id).then(setMarketData).catch(() => setMarketData(null));
  };
  const selectMockChart = (name) => { setMarketSel(null); setActiveChart(name); };

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

  // Grafico prezzi: serie reale (se un prodotto reale è selezionato) o mock.
  const showingReal = !!marketSel;
  const realSeries = (marketData?.series || []).map(pt => {
    const [, m, d] = String(pt.t).slice(0, 10).split("-");
    return { t: `${d}/${m}`, v: Number(pt.v) };
  });
  const chartData = showingReal ? realSeries : CHART_DATA[activeChart];
  const lastPrice = showingReal
    ? (realSeries.length ? realSeries[realSeries.length - 1].v : null)
    : CHART_DATA[activeChart][CHART_DATA[activeChart].length - 1].v;
  const realChange = (showingReal && realSeries.length >= 2)
    ? ((realSeries[realSeries.length - 1].v - realSeries[0].v) / realSeries[0].v) * 100
    : null;

  return (
    <div style={{ backgroundColor:"#FFFFFF", color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", overflowX:"hidden", colorScheme:"light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .bs-ticker-wrap { overflow:hidden; width:100%; }
        .bs-ticker { display:flex; width:max-content; animation:tick 45s linear infinite; }
        .bs-ticker:hover { animation-play-state:paused; }
        @keyframes tick { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        .bs-num { font-family:'JetBrains Mono',monospace; }
        .bs-cats { display:flex; gap:12px; overflow-x:auto; padding:20px 24px; scrollbar-width:none; }
        .bs-cats::-webkit-scrollbar { display:none; }
        .bs-cat { display:flex; flex-direction:column; align-items:center; gap:8px; cursor:pointer; flex-shrink:0; width:76px; transition:transform 0.15s; }
        .bs-cat:hover { transform:translateY(-2px); }
        .bs-cat-label { text-align:center; line-height:1.25; }
        .bs-cat-icon { width:56px; height:56px; border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:26px; border:1.5px solid; transition:all 0.15s; }
        .bs-cat.active .bs-cat-icon { outline:2px solid #0EA5E9; outline-offset:2px; }
        .bs-section { max-width:1280px; margin:0 auto; padding:64px 24px; }
        .bs-card { background:#FFFFFF; border:1px solid ${C.border}; border-radius:16px; padding:24px; transition:box-shadow 0.2s,transform 0.2s; }
        .bs-card:hover { box-shadow:0 8px 32px rgba(14,165,233,0.10); transform:translateY(-2px); }
        .bs-btn { background:#0EA5E9; color:#fff; border:none; border-radius:10px; padding:13px 24px; font-size:15px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:8px; transition:all 0.2s; font-family:'Inter',system-ui; }
        .bs-btn:hover { background:#0284C7; transform:translateY(-1px); box-shadow:0 6px 20px rgba(14,165,233,0.3); }
        .bs-btn-out { background:transparent; color:#0EA5E9; border:1.5px solid #0EA5E9; border-radius:10px; padding:12px 24px; font-size:15px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:8px; font-family:'Inter',system-ui; transition:all 0.2s; }
        .bs-btn-out:hover { background:#EFF6FF; }
        .bs-pool-btn { width:100%; background:transparent; color:#0EA5E9; border:1.5px solid #E2E8F0; border-radius:8px; padding:10px; font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; font-family:'Inter',system-ui; transition:all 0.2s; }
        .bs-pool-btn:hover { border-color:#0EA5E9; background:#EFF6FF; }
        .bs-tab { padding:9px 22px; border-radius:100px; font-size:14px; font-weight:600; cursor:pointer; border:1.5px solid; transition:all 0.2s; font-family:'Inter',system-ui; }
        .bs-chart-tab { padding:7px 14px; border-radius:8px; font-size:13px; font-weight:600; border:1px solid; cursor:pointer; transition:all 0.2s; font-family:'Inter',system-ui; }
        .bs-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#0EA5E9; margin-bottom:8px; }
        .bs-h2 { font-size:34px; font-weight:800; letter-spacing:-0.02em; }
        .bs-progress { height:6px; background:#E2E8F0; border-radius:100px; overflow:hidden; }
        .bs-progress-bar { height:100%; border-radius:100px; transition:width 1.2s ease; }
        .bs-chatbot { position:fixed; bottom:24px; right:24px; z-index:1000; }
        .bs-chatbot-panel { position:absolute; bottom:70px; right:0; width:300px; background:#fff; border-radius:16px; border:1px solid #E2E8F0; box-shadow:0 20px 60px rgba(0,0,0,0.15); overflow:hidden; }
        .bs-chatbot-btn { width:56px; height:56px; border-radius:50%; background:#0EA5E9; border:3px solid #fff; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 20px rgba(14,165,233,0.4); transition:transform 0.2s; }
        .bs-chatbot-btn:hover { transform:scale(1.08); }
        .bs-hamburger-btn { display:none; background:none; border:none; cursor:pointer; padding:6px; margin:-6px; flex-shrink:0; }
        .bs-search-mobile-row { display:none; }
        .bs-mobile-menu-panel { display:none; }
        .bs-cats-expand-btn { display:none; }
        @media (max-width:768px) {
          .bs-grid-2 { grid-template-columns:1fr !important; gap:32px !important; }
          .bs-grid-3 { grid-template-columns:1fr !important; }
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
          .bs-cats { flex-wrap:wrap !important; overflow:hidden !important; max-height:140px; gap:8px !important; padding:16px 16px 0 16px !important; }
          .bs-cats.expanded { max-height:none !important; }
          .bs-cat { width:calc((100% - 24px) / 4) !important; }
          .bs-cat-icon { width:100% !important; height:auto !important; aspect-ratio:1/1; font-size:38px !important; border-radius:12px !important; }
          .bs-cat-label { font-size:10.5px !important; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; }
          .bs-cats-expand-btn { display:flex !important; align-items:center; justify-content:center; width:100%; background:none; border:none; border-top:1px solid ${C.border}; padding:8px 0; cursor:pointer; }
        }
      `}</style>

      {/* ── NAVBAR ── */}
      <BulkStrikeNav />

      {/* ── TICKER TAPE ── */}
      <div style={{ background:"#07111E", borderBottom:`1px solid #1A3454`, padding:"10px 0" }}>
        <div className="bs-ticker-wrap">
          <div className="bs-ticker">
            {[...TICKER,...TICKER].map((item,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"0 24px", whiteSpace:"nowrap" }}>
                <span style={{ fontSize:13, color:"#6B94B8" }}>{item.name}</span>
                <span className="bs-num" style={{ fontSize:13, fontWeight:600, color:"#F0F6FF" }}>{item.price}/kg</span>
                <span className="bs-num" style={{ fontSize:12, color:item.change>=0?"#10B981":"#F43F5E" }}>
                  {item.change>=0?"▲":"▼"} {Math.abs(item.change)}%
                </span>
                <span style={{ color:"#1A3454", margin:"0 4px" }}>·</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── DISCOVERY a due livelli: macro-aree → sotto-aree → prodotti ── */}
      <div style={{ borderBottom:`1px solid ${C.border}`, background:"#fff" }}>
        <div style={{ maxWidth:1280, margin:"0 auto" }}>
          {/* livello 1: macro-aree */}
          <div className={`bs-cats${sectorsExpanded ? " expanded" : ""}`}>
            {macros.map(m => {
              const on = activeMacro?.id === m.id;
              return (
                <div key={m.id} className={`bs-cat${on?" active":""}`}
                     onClick={() => { const next = on ? null : m; setActiveMacro(next); setActiveSector(null); setSectorProducts([]); }}>
                  <div className="bs-cat-icon" style={{ background:on?"#EFF6FF":"#F1F5F9", borderColor:on?"#0EA5E9":"#E2E8F0" }}>
                    {m.icon || "📦"}
                  </div>
                  <span className="bs-cat-label" style={{ fontSize:11, color:on?"#0EA5E9":C.muted, textAlign:"center", lineHeight:1.2, fontWeight:on?700:400 }}>
                    {m.name}
                  </span>
                </div>
              );
            })}
          </div>
          {/* freccia per espandere tutte le categorie — solo mobile */}
          <button className="bs-cats-expand-btn" onClick={() => setSectorsExpanded(e => !e)}>
            <ChevronDown size={18} color={C.muted} style={{ transform: sectorsExpanded ? "rotate(180deg)" : "none", transition:"transform 0.2s" }}/>
          </button>

          {/* livello 2: sotto-aree della macro selezionata */}
          {activeMacro && (
            <div style={{ padding:"12px 16px", display:"flex", flexWrap:"wrap", gap:8, borderTop:`1px solid ${C.border}`, background:"#FAFCFF" }}>
              {(activeMacro.sub_areas || []).filter(s => (s.product_count||0) > 0).map(s => {
                const on = activeSector?.id === s.id;
                return (
                  <div key={s.id} onClick={() => openSector(s)}
                       style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"8px 14px", borderRadius:100, cursor:"pointer",
                                border:`1.5px solid ${on?"#0EA5E9":C.border}`, background:on?"#EFF6FF":"#fff",
                                fontSize:13, fontWeight:on?700:500, color:on?"#0369A1":C.text, whiteSpace:"nowrap" }}>
                    <span style={{ fontSize:15 }}>{s.icon || "📦"}</span>
                    {s.name}
                    <span style={{ fontSize:11, color:on?"#0EA5E9":C.muted, background:on?"#DBEAFE":"#F1F5F9", borderRadius:100, padding:"1px 7px", fontWeight:700 }}>{s.product_count}</span>
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
                {stats && stats.active_pools > 0
                  ? `${count.pools} ${count.pools === 1 ? "asta attiva" : "aste attive"} in questo momento`
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
              {["✓ Registrazione gratuita","✓ Nessun abbonamento","✓ Asta senza impegno"].map(t => (
                <span key={t} style={{ fontSize:13, color:C.muted }}>{t}</span>
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
                  <div style={{ position:"absolute", top:-12, right:16, background:C.red, borderRadius:100, padding:"4px 12px", fontSize:12, fontWeight:700, color:"#fff" }}>🔥 Quasi completo</div>
                )}
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>Asta più vicina alla chiusura</div>
                  <div style={{ fontSize:19, fontWeight:800, color:C.text, marginBottom:2 }}>{fp.product_name}</div>
                  <div style={{ fontSize:13, color:C.muted }}>
                    {[
                      fp.product_enum,
                      `${fp.num_bids} ${Number(fp.num_bids) === 1 ? "fornitore" : "fornitori"} in gara`,
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
                {box.barTarget ? (
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
                      <span style={{ fontSize:12, color:C.muted }}>Mancano {kgFmt(box.toNext)} kg</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom:16, fontSize:12.5, color:C.blue, fontWeight:600, background:"#EFF6FF", border:`1px solid #BFDBFE`, borderRadius:10, padding:"10px 12px" }}>
                    🎉 Scaglione massimo raggiunto: miglior tetto già sbloccato.
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
                <div className="bs-num" style={{ fontSize:40, fontWeight:800, color, letterSpacing:"-0.02em" }}>{val.toLocaleString("it-IT")}{suffix}</div>
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
          <button onClick={() => { window.location.href = "/pool"; }} style={{ display:"flex", alignItems:"center", gap:6, color:C.blue, background:"none", border:"none", fontSize:14, fontWeight:600, cursor:"pointer" }}>
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
          // Nessuna asta attiva in piattaforma
          <div style={{ border:`1px dashed ${C.border}`, borderRadius:16, padding:"40px 24px", textAlign:"center", color:C.muted }}>
            <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:6 }}>Nessuna asta attiva in questo momento</div>
            <div style={{ fontSize:14, marginBottom:16 }}>Apri tu la prossima asta a ribasso dalla pagina di un prodotto del catalogo.</div>
            <button className="bs-btn" onClick={() => { window.location.href = "/catalogo"; }} style={{ display:"inline-flex" }}>Vai al catalogo <ArrowRight size={16} /></button>
          </div>
        ) : (
          <div className="bs-grid-3" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
            {top3.map(pool => {
              const b = deriveFeatured(pool);
              const cat = macroLabel(pool);
              return (
                <div key={pool.id} className="bs-card">
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                    <div>
                      <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
                        {cat && <span style={{ background:"#EFF6FF", color:"#1D4ED8", borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600 }}>{cat}</span>}
                        {b.almost && <span style={{ background:"#FFF1F2", color:C.red, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600 }}>🔥 Quasi pieno</span>}
                      </div>
                      <h3 style={{ fontSize:17, fontWeight:700, marginBottom:2, color:C.text }}>{pool.product_name}</h3>
                      {/* niente grado/purezza inventati: solo il n° reale di fornitori in gara */}
                      <p style={{ fontSize:13, color:C.muted }}>{pool.num_bids} {Number(pool.num_bids) === 1 ? "fornitore in gara" : "fornitori in gara"}</p>
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
                  {b.barTarget ? (
                    <div style={{ marginBottom:14 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                        <span style={{ fontSize:12, color:C.muted }}>Volume</span>
                        <span className="bs-num" style={{ fontSize:12, fontWeight:600 }}>{kgFmt(b.vol)} / {kgFmt(b.barTarget)} kg</span>
                      </div>
                      <div className="bs-progress">
                        <div className="bs-progress-bar" style={{ background:b.pct>=80?`linear-gradient(90deg,${C.amber},${C.red})`:`linear-gradient(90deg,${C.blue},#22D3EE)`, width:`${b.pct}%` }} />
                      </div>
                      <div style={{ fontSize:12, color:b.pct>=80?C.amber:C.muted, marginTop:4, textAlign:"right" }}>{b.pct}%</div>
                    </div>
                  ) : (
                    <div style={{ marginBottom:14, fontSize:12, color:C.blue, fontWeight:600 }}>🎉 Scaglione massimo raggiunto</div>
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
          <div className="bs-grid-2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:56, alignItems:"start" }}>
            <div>
              <div className="bs-label">Market Intelligence</div>
              <h2 className="bs-h2" style={{ marginBottom:12 }}>Andamento prezzi in tempo reale</h2>
              <p style={{ fontSize:15, color:C.muted, lineHeight:1.65, marginBottom:24 }}>
                L'andamento dei prezzi delle materie prime, aggiornato di continuo. Per le materie prime agricole i dati provengono dalle fonti ufficiali (ISMEA, CUN Grano Duro).
              </p>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:24 }}>
                {Object.keys(CHART_DATA).map(name => (
                  <button key={name} className="bs-chart-tab" onClick={() => selectMockChart(name)}
                    style={{ background:(!showingReal && activeChart===name)?C.blue:"#fff", color:(!showingReal && activeChart===name)?"#fff":C.muted, borderColor:(!showingReal && activeChart===name)?C.blue:C.border }}>
                    {name}
                  </button>
                ))}
                {marketProducts.map(p => (
                  <button key={p.id} className="bs-chart-tab" onClick={() => selectMarketProduct(p)}
                    style={{ background:marketSel?.id===p.id?C.blue:"#fff", color:marketSel?.id===p.id?"#fff":C.muted, borderColor:marketSel?.id===p.id?C.blue:C.border }}>
                    {p.name}
                  </button>
                ))}
              </div>
              <div style={{ display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap" }}>
                <span className="bs-num" style={{ fontSize:42, fontWeight:800, color:C.blue }}>
                  {lastPrice != null ? `€${lastPrice.toFixed(2)}` : "—"}
                </span>
                <span style={{ fontSize:14, color:C.muted }}>/kg · {showingReal ? "prezzo di mercato" : "prezzo asta attuale"}</span>
              </div>
              {showingReal ? (
                realChange != null && (
                  <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:14, color:realChange<=0?C.green:C.red, marginTop:4 }}>
                    {realChange<=0 && <TrendingDown size={14} />} {realChange>0?"+":""}{realChange.toFixed(1)}% nel periodo rilevato
                  </div>
                )
              ) : (
                <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:14, color:C.green, marginTop:4 }}>
                  <TrendingDown size={14} /> -14,7% rispetto a gennaio
                </div>
              )}
            </div>
            <div>
              {showingReal && realSeries.length === 0 ? (
                <div style={{ height:220, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:C.muted, border:`1px dashed ${C.border}`, borderRadius:12 }}>
                  Storico prezzi in raccolta: i dati si popolano a ogni rilevazione settimanale.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="t" tick={{ fill:C.muted, fontSize:12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill:C.muted, fontSize:12, fontFamily:"JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={v=>`€${v}`} domain={["auto","auto"]} />
                    <Tooltip contentStyle={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:10 }} formatter={v=>[`€${Number(v).toFixed(2)}/kg`,"Prezzo"]} />
                    <Line type="monotone" dataKey="v" stroke={C.blue} strokeWidth={2.5} dot={{ fill:C.blue, r:4, strokeWidth:0 }} activeDot={{ r:6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
              {/* Solo per il grafico mock: selettore periodo decorativo. Per i dati reali
                  la fonte + dicitura informativa obbligatoria stanno qui sotto. */}
              {showingReal ? (
                <PriceSourceNote fonte={marketData?.fonte} fonteUrl={marketData?.fonte_url} lastDate={marketData?.last_date} muted={C.muted} border={C.border} />
              ) : (
                <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
                  {["1M","3M","6M","1A"].map(t => (
                    <button key={t} style={{ flex:1, minWidth:36, padding:"6px 4px", background:t==="6M"?"#EFF6FF":"transparent", border:`1px solid ${t==="6M"?C.blue:C.border}`, borderRadius:6, fontSize:12, color:t==="6M"?C.blue:C.muted, cursor:"pointer", fontFamily:"Inter,system-ui" }}>{t}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <div id="come-funziona" className="bs-section" style={{ textAlign:"center" }}>
        <div className="bs-label" style={{ textAlign:"center" }}>Come funziona</div>
        <h2 className="bs-h2" style={{ marginBottom:32 }}>Semplice da entrambi i lati</h2>
        <div style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:40, flexWrap:"wrap" }}>
          {["acquirente","fornitore"].map(tab => (
            <button key={tab} className="bs-tab" onClick={() => setActiveTab(tab)}
              style={{ background:activeTab===tab?C.blue:"transparent", color:activeTab===tab?"#fff":C.muted, borderColor:activeTab===tab?C.blue:C.border }}>
              {tab==="acquirente"?"Sono un Acquirente":"Sono un Fornitore"}
            </button>
          ))}
        </div>
        <div className="bs-grid-3" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
          {(activeTab==="acquirente"?BUYER_STEPS:SELLER_STEPS).map((step,i) => (
            <div key={i} className="bs-card" style={{ textAlign:"left" }}>
              <div className="bs-num" style={{ fontSize:44, fontWeight:900, color:"#E2E8F0", letterSpacing:"-0.03em", marginBottom:14 }}>{step.n}</div>
              <h3 style={{ fontSize:17, fontWeight:700, marginBottom:8, color:C.text }}>{step.title}</h3>
              <p style={{ fontSize:14, color:C.muted, lineHeight:1.7 }}>{step.desc}</p>
            </div>
          ))}
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
              <div style={{ display:"flex", alignItems:"center", gap:10, background:"#0EA5E9", padding:"14px 20px" }}>
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
                      background:msg.u?C.blue:"#F1F5F9",
                      color:msg.u?"#fff":C.text,
                      fontSize:13, lineHeight:1.55, whiteSpace:"pre-line", wordBreak:"break-word"
                    }}>{msg.t}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:8, padding:"14px 16px", borderTop:`1px solid ${C.border}`, marginTop:14 }}>
                <input placeholder="Scrivi un messaggio..." style={{ flex:1, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", fontFamily:"Inter,system-ui" }} />
                <button style={{ background:C.blue, border:"none", borderRadius:8, width:36, cursor:"pointer", color:"white", fontWeight:700, flexShrink:0 }}>↑</button>
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
            <button onClick={() => { document.getElementById("come-funziona")?.scrollIntoView({ behavior:"smooth" }); }} style={{ background:"transparent", color:"#F0F6FF", border:"1px solid #1A3454", borderRadius:10, padding:"15px 24px", fontSize:16, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Guarda come funziona</button>
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
          <a href="mailto:info@bulkstrike.com?subject=Accesso%20anticipato%20integrazione%20gestionale%20BulkStrike" style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#0EA5E9", color:"#fff", fontSize:16, fontWeight:700, padding:"14px 28px", borderRadius:10, textDecoration:"none" }}>
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
      <BulkStrikeChatWidget />
      <CookieBanner />
    </div>
  );
}
