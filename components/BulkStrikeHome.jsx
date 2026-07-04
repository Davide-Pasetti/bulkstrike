import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Search, Bot, ArrowRight, Check, Clock, ChevronRight, TrendingDown, X, ChevronDown } from "lucide-react";
import { getMacroAreas, getSectorProducts, searchProducts } from "@/lib/api";
import NavAuth from "@/components/BulkStrikeNavAuth";

// ─── DATA ─────────────────────────────────────────────────────────────────────
const SEARCH_CATS = ["Tutte le categorie","Chimica","Metallurgia","Agricoltura","Tessuti","Plastiche","Minerali","Alimentari","Farmaceutici","Carta","Energia","Gomma"];

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

const POOLS = [
  { id:1, name:"Acido Citrico E330", grade:"Food Grade · Anidro", target:20000, current:12400, price:"€0,81", savings:"13%", orig:"€0,93", expires:"4g 12h", flags:"🇨🇳 🇮🇹 🇩🇪", tag:"Chimica", hot:false },
  { id:2, name:"Polipropilene GP",   grade:"Vergine H030S",       target:10000, current:9100,  price:"€0,98", savings:"12%", orig:"€1,12", expires:"8h 30m",flags:"🇰🇷 🇩🇪 🇮🇹", tag:"Plastiche",hot:true  },
  { id:3, name:"Carbonato di Calcio",grade:"Industrial 98%",      target:50000, current:38200, price:"€0,29", savings:"15%", orig:"€0,34", expires:"1g 8h", flags:"🇨🇳 🇹🇷",    tag:"Minerali", hot:false },
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

// ─── LOGO ICON ────────────────────────────────────────────────────────────────
function BSIcon({ size = 36, uid = "a" }) {
  // Logo: 3 parti (clienti, fornitori, corrieri) che convergono su un unico punto — l'incontro su BulkStrike.
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0D2137"/><stop offset="100%" stopColor="#0C4A6E"/>
        </linearGradient>
      </defs>
      <rect width="56" height="56" rx="13" fill={`url(#bg${uid})`}/>
      <line x1="28" y1="33" x2="28" y2="14" stroke="white" strokeWidth="3" strokeLinecap="round"/>
      <line x1="28" y1="33" x2="14" y2="45" stroke="white" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.85"/>
      <line x1="28" y1="33" x2="42" y2="45" stroke="white" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.85"/>
      <circle cx="28" cy="14" r="4.2" fill="white"/>
      <circle cx="14" cy="45" r="4.2" fill="white" fillOpacity="0.85"/>
      <circle cx="42" cy="45" r="4.2" fill="white" fillOpacity="0.85"/>
      <circle cx="28" cy="33" r="5.5" fill="white"/>
    </svg>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
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
  const [searchCat, setSearchCat]   = useState("Tutte le categorie");
  const [showCatDd, setShowCatDd]   = useState(false);
  const [searchQ, setSearchQ]       = useState("");
  const [activeChart, setActiveChart] = useState("Acido Citrico");
  const [activeTab, setActiveTab]   = useState("acquirente");
  const [chatOpen, setChatOpen]     = useState(false);
  const [count, setCount]           = useState({ pools:0, materials:0, countries:0, volume:0 });
  const [macros, setMacros]               = useState([]);
  const [activeMacro, setActiveMacro]     = useState(null);
  const [activeSector, setActiveSector]   = useState(null);
  const [sectorProducts, setSectorProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen]       = useState(false);

  useEffect(() => {
    const targets = { pools:142, materials:2400, countries:38, volume:12 };
    let step = 0;
    const t = setInterval(() => {
      step++; const e = 1 - Math.pow(1 - step/60, 3);
      setCount({ pools:Math.round(targets.pools*e), materials:Math.round(targets.materials*e), countries:Math.round(targets.countries*e), volume:Math.round(targets.volume*e) });
      if (step >= 60) clearInterval(t);
    }, 1800/60);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { getMacroAreas().then(setMacros).catch(() => {}); }, []);

  // apre una sotto-area e carica SOLO i suoi prodotti (filtro rigoroso per settore)
  const openSector = (sec) => {
    if (activeSector?.id === sec.id) { setActiveSector(null); setSectorProducts([]); return; }
    setActiveSector(sec); setSectorProducts([]); setLoadingProducts(true);
    getSectorProducts(sec.id)
      .then((ps) => { setSectorProducts(ps); setLoadingProducts(false); })
      .catch(() => setLoadingProducts(false));
  };

  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) { setSearchResults([]); setSearchOpen(false); return; }
    const t = setTimeout(() => {
      searchProducts(q).then(rows => { setSearchResults(rows); setSearchOpen(true); }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [searchQ]);

  function runSearch() {
    const q = searchQ.trim();
    if (q.length < 2) { setSearchResults([]); setSearchOpen(false); return; }
    searchProducts(q).then(rows => { setSearchResults(rows); setSearchOpen(true); }).catch(() => {});
  }

  const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706" };

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
        .bs-search-wrap { display:flex; border:2px solid #0EA5E9; border-radius:10px; overflow:hidden; height:46px; flex:1; max-width:580px; background:#fff; }
        .bs-search-cat { background:#F1F5F9; border:none; border-right:1px solid #E2E8F0; padding:0 14px; font-size:13px; font-weight:600; cursor:pointer; color:#475569; white-space:nowrap; display:flex; align-items:center; gap:6px; font-family:'Inter',system-ui; min-width:170px; }
        .bs-search-input { flex:1; border:none; padding:0 16px; font-size:14px; outline:none; color:#0F172A; font-family:'Inter',system-ui; }
        .bs-search-btn { background:#0EA5E9; border:none; padding:0 18px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .bs-cat-dd { position:absolute; top:100%; left:0; background:#fff; border:1px solid #E2E8F0; border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.1); z-index:100; min-width:200px; overflow:hidden; }
        .bs-cat-dd-item { padding:9px 14px; font-size:13px; cursor:pointer; color:#374151; transition:background 0.1s; }
        .bs-cat-dd-item:hover { background:#EFF6FF; color:#0EA5E9; }
        .bs-chatbot { position:fixed; bottom:24px; right:24px; z-index:1000; }
        .bs-chatbot-panel { position:absolute; bottom:70px; right:0; width:300px; background:#fff; border-radius:16px; border:1px solid #E2E8F0; box-shadow:0 20px 60px rgba(0,0,0,0.15); overflow:hidden; }
        .bs-chatbot-btn { width:56px; height:56px; border-radius:50%; background:#0EA5E9; border:3px solid #fff; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 20px rgba(14,165,233,0.4); transition:transform 0.2s; }
        .bs-chatbot-btn:hover { transform:scale(1.08); }
        @media (max-width:768px) {
          .bs-grid-2 { grid-template-columns:1fr !important; gap:32px !important; }
          .bs-grid-3 { grid-template-columns:1fr !important; }
          .bs-grid-4 { grid-template-columns:repeat(2,1fr) !important; }
          .bs-h2 { font-size:26px; }
          .bs-hero-h1 { font-size:32px !important; }
          .bs-section { padding:48px 16px; }
          .bs-nav-links { display:none !important; }
          .bs-search-wrap { max-width:100% !important; }
          .bs-search-cat { min-width:120px !important; }
          .bs-cta-btns { flex-direction:column !important; }
          .bs-hero-grid { grid-template-columns:1fr !important; gap:32px !important; }
        }
      `}</style>

      {/* ── NAVBAR ── */}
      <nav style={{ position:"sticky", top:0, zIndex:50, background:"rgba(255,255,255,0.96)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1280, margin:"0 auto", padding:"0 24px", height:68, display:"flex", alignItems:"center", gap:20 }}>
          {/* Logo */}
          <div onClick={() => { window.location.href = "/"; }} style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0, cursor:"pointer" }}>
            <BSIcon size={36} uid="nav" />
            <div style={{ display:"flex", alignItems:"baseline", fontFamily:"Inter,system-ui,sans-serif" }}>
              <span style={{ fontSize:20, fontWeight:900, color:C.text, letterSpacing:"-0.03em" }}>Bulk</span>
              <span style={{ fontSize:20, fontWeight:900, letterSpacing:"-0.03em", background:"linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>Strike</span>
            </div>
          </div>

          {/* Search bar */}
          <div style={{ position:"relative", flex:1, display:"flex", justifyContent:"center" }}>
            <div className="bs-search-wrap">
              <div className="bs-search-cat" onClick={() => setShowCatDd(!showCatDd)}>
                <span style={{ overflow:"hidden", textOverflow:"ellipsis", maxWidth:110 }}>{searchCat}</span>
                <ChevronDown size={14} color="#64748B" />
              </div>
              {showCatDd && (
                <div className="bs-cat-dd" style={{ top:46 }}>
                  {SEARCH_CATS.map(c => (
                    <div key={c} className="bs-cat-dd-item" onClick={() => { setSearchCat(c); setShowCatDd(false); }}>{c}</div>
                  ))}
                </div>
              )}
              <input className="bs-search-input" placeholder="Cerca materie prime, fornitori, specifiche..." value={searchQ} onChange={e => setSearchQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") runSearch(); }} />
              <button className="bs-search-btn" onClick={runSearch}><Search size={20} color="white" /></button>
              {searchOpen && searchResults.length > 0 && (
                <div style={{ position:"absolute", top:46, left:0, right:0, background:"#fff", border:`1px solid ${C.border}`, borderRadius:10, boxShadow:"0 12px 30px rgba(0,0,0,0.12)", zIndex:60, maxHeight:340, overflowY:"auto" }}>
                  {searchResults.map(p => (
                    <div key={p.id} onClick={() => { window.location.href = `/prodotto?id=${p.id}`; }} style={{ padding:"10px 14px", cursor:"pointer", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", gap:10 }}>
                      <span style={{ fontSize:14, color:C.text }}>{p.canonical_name}</span>
                      <span style={{ fontSize:12, color:C.muted, whiteSpace:"nowrap" }}>{p.e_number || p.cas_number || ""}</span>
                    </div>
                  ))}
                </div>
              )}
              {searchOpen && searchResults.length === 0 && searchQ.trim().length >= 2 && (
                <div style={{ position:"absolute", top:46, left:0, right:0, background:"#fff", border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px", zIndex:60, fontSize:13, color:C.muted }}>Nessun prodotto trovato per “{searchQ}”.</div>
              )}
            </div>
          </div>

          {/* Nav right */}
          <div style={{ display:"flex", alignItems:"center", gap:20, flexShrink:0 }}>
            <div className="bs-nav-links" style={{ display:"flex", gap:20 }}>
              {[["Aste attive","/pool"],["Prodotti","/catalogo"],["Fornitori","/fornitori"],["Corrieri","/corriere"],["Come funziona","#come-funziona"]].map(([l,href]) => (
                <span key={l} onClick={() => { window.location.href = href; }} style={{ fontSize:14, color:C.muted, cursor:"pointer", fontWeight:500, whiteSpace:"nowrap" }}>{l}</span>
              ))}
            </div>
            <NavAuth />
          </div>
        </div>
      </nav>

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
          <div className="bs-cats">
            {macros.map(m => {
              const on = activeMacro?.id === m.id;
              return (
                <div key={m.id} className={`bs-cat${on?" active":""}`}
                     onClick={() => { const next = on ? null : m; setActiveMacro(next); setActiveSector(null); setSectorProducts([]); }}>
                  <div className="bs-cat-icon" style={{ background:on?"#EFF6FF":"#F1F5F9", borderColor:on?"#0EA5E9":"#E2E8F0" }}>
                    {m.icon || "📦"}
                  </div>
                  <span style={{ fontSize:11, color:on?"#0EA5E9":C.muted, textAlign:"center", lineHeight:1.2, fontWeight:on?700:400 }}>
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
              <span style={{ fontSize:13, color:"#1D4ED8", fontWeight:600 }}>142 aste attive in questo momento</span>
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
          {/* Hero pool card */}
          <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, padding:24, boxShadow:"0 4px 24px rgba(14,165,233,0.08)", position:"relative" }}>
            <div style={{ position:"absolute", top:-12, right:16, background:C.red, borderRadius:100, padding:"4px 12px", fontSize:12, fontWeight:700, color:"#fff" }}>🔥 Quasi completo</div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>Asta più vicina all'attivazione</div>
              <div style={{ fontSize:19, fontWeight:800, color:C.text, marginBottom:2 }}>Polipropilene GP H030S</div>
              <div style={{ fontSize:13, color:C.muted }}>Vergine · 4 fornitori · 🇰🇷 🇩🇪 🇮🇹</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18 }}>
              <div style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>Prezzo asta all-in</div>
                <div className="bs-num" style={{ fontSize:24, fontWeight:700, color:C.blue }}>€0,98<span style={{ fontSize:12, fontWeight:400 }}>/kg</span></div>
              </div>
              <div style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>Risparmio</div>
                <div className="bs-num" style={{ fontSize:24, fontWeight:700, color:C.green }}>-12%</div>
                <div style={{ fontSize:11, color:C.muted }}>vs €1,12/kg singolo</div>
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:13, color:C.muted }}>Volume raccolto</span>
                <span className="bs-num" style={{ fontSize:13, fontWeight:600 }}>9.100 / 10.000 kg</span>
              </div>
              <div className="bs-progress">
                <div className="bs-progress-bar" style={{ background:`linear-gradient(90deg,${C.amber},${C.red})`, width:"91%" }} />
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:5 }}>
                <span style={{ fontSize:12, color:C.amber, fontWeight:600 }}>91% — quasi pieno!</span>
                <span style={{ fontSize:12, color:C.muted }}>Mancano 900 kg</span>
              </div>
            </div>
            <button className="bs-btn" onClick={() => { window.location.href = "/pool?id=7191a826-ac9c-404b-8001-8e8fc8f08100"; }} style={{ width:"100%", justifyContent:"center" }}>Visualizza l'asta a ribasso <ArrowRight size={16} /></button>
          </div>
        </div>
      </div>

      {/* ── STATS BAR ── */}
      <div style={{ background:C.bg, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1280, margin:"0 auto", padding:"36px 24px" }}>
          <div className="bs-grid-4" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:24 }}>
            {[
              { label:"Aste attive ora",    val:count.pools,     suffix:"",   color:"#0EA5E9" },
              { label:"Materie prime",      val:count.materials, suffix:"+",  color:"#0284C7" },
              { label:"Paesi coperti",      val:count.countries, suffix:"",   color:C.green },
              { label:"Mln € / mese",       val:count.volume,    suffix:"M€", color:C.amber },
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
        <div className="bs-grid-3" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
          {POOLS.map(pool => {
            const pct = Math.round((pool.current/pool.target)*100);
            return (
              <div key={pool.id} className="bs-card">
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                  <div>
                    <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
                      <span style={{ background:"#EFF6FF", color:"#1D4ED8", borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600 }}>{pool.tag}</span>
                      {pool.hot && <span style={{ background:"#FFF1F2", color:C.red, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600 }}>🔥 Quasi pieno</span>}
                    </div>
                    <h3 style={{ fontSize:17, fontWeight:700, marginBottom:2, color:C.text }}>{pool.name}</h3>
                    <p style={{ fontSize:13, color:C.muted }}>{pool.grade}</p>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:4, justifyContent:"flex-end", fontSize:12, color:C.muted }}>
                      <Clock size={11} /> {pool.expires}
                    </div>
                    <div style={{ fontSize:14, marginTop:4 }}>{pool.flags}</div>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                  <div style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:11, color:C.muted, marginBottom:2 }}>Prezzo asta</div>
                    <div className="bs-num" style={{ fontSize:20, fontWeight:700, color:C.blue }}>{pool.price}<span style={{ fontSize:11 }}>/kg</span></div>
                  </div>
                  <div style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:11, color:C.muted, marginBottom:2 }}>Risparmio</div>
                    <div className="bs-num" style={{ fontSize:20, fontWeight:700, color:C.green }}>-{pool.savings}</div>
                    <div style={{ fontSize:11, color:C.muted }}>vs {pool.orig}/kg</div>
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                    <span style={{ fontSize:12, color:C.muted }}>Volume</span>
                    <span className="bs-num" style={{ fontSize:12, fontWeight:600 }}>{(pool.current/1000).toFixed(1)}t / {pool.target/1000}t</span>
                  </div>
                  <div className="bs-progress">
                    <div className="bs-progress-bar" style={{ background:pct>=80?`linear-gradient(90deg,${C.amber},${C.red})`:`linear-gradient(90deg,${C.blue},#22D3EE)`, width:`${pct}%` }} />
                  </div>
                  <div style={{ fontSize:12, color:pct>=80?C.amber:C.muted, marginTop:4, textAlign:"right" }}>{pct}%</div>
                </div>
                <button className="bs-pool-btn" onClick={() => { window.location.href = "/pool?id=7191a826-ac9c-404b-8001-8e8fc8f08100"; }}>Visualizza l'asta a ribasso <ArrowRight size={14} /></button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── PRICE CHARTS ── */}
      <div style={{ background:C.bg, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}` }}>
        <div className="bs-section">
          <div className="bs-grid-2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:56, alignItems:"start" }}>
            <div>
              <div className="bs-label">Market Intelligence</div>
              <h2 className="bs-h2" style={{ marginBottom:12 }}>Andamento prezzi in tempo reale</h2>
              <p style={{ fontSize:15, color:C.muted, lineHeight:1.65, marginBottom:24 }}>
                Ogni transazione su BulkStrike alimenta l'indice prezzi. Un dato proprietario che non trovi da nessuna altra parte.
              </p>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:24 }}>
                {Object.keys(CHART_DATA).map(name => (
                  <button key={name} className="bs-chart-tab" onClick={() => setActiveChart(name)}
                    style={{ background:activeChart===name?C.blue:"#fff", color:activeChart===name?"#fff":C.muted, borderColor:activeChart===name?C.blue:C.border }}>
                    {name}
                  </button>
                ))}
              </div>
              <div style={{ display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap" }}>
                <span className="bs-num" style={{ fontSize:42, fontWeight:800, color:C.blue }}>
                  €{CHART_DATA[activeChart][CHART_DATA[activeChart].length-1].v.toFixed(2)}
                </span>
                <span style={{ fontSize:14, color:C.muted }}>/kg · prezzo asta attuale</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:14, color:C.green, marginTop:4 }}>
                <TrendingDown size={14} /> -14,7% rispetto a gennaio
              </div>
            </div>
            <div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={CHART_DATA[activeChart]}>
                  <XAxis dataKey="t" tick={{ fill:C.muted, fontSize:12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill:C.muted, fontSize:12, fontFamily:"JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={v=>`€${v}`} domain={["auto","auto"]} />
                  <Tooltip contentStyle={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:10 }} formatter={v=>[`€${v.toFixed(2)}/kg`,"Prezzo"]} />
                  <Line type="monotone" dataKey="v" stroke={C.blue} strokeWidth={2.5} dot={{ fill:C.blue, r:4, strokeWidth:0 }} activeDot={{ r:6 }} />
                </LineChart>
              </ResponsiveContainer>
              <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
                {["1M","3M","6M","1A"].map(t => (
                  <button key={t} style={{ flex:1, minWidth:36, padding:"6px 4px", background:t==="6M"?"#EFF6FF":"transparent", border:`1px solid ${t==="6M"?C.blue:C.border}`, borderRadius:6, fontSize:12, color:t==="6M"?C.blue:C.muted, cursor:"pointer", fontFamily:"Inter,system-ui" }}>{t}</button>
                ))}
              </div>
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
            Registrazione gratuita. Nessun abbonamento. Unisciti a 2.400+ aziende che già comprano e vendono su BulkStrike.
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
          </div>
          <h2 style={{ fontSize:28, fontWeight:800, letterSpacing:"-0.02em", color:"#0F172A", marginBottom:14, lineHeight:1.25 }}>
            Collega il tuo gestionale a BulkStrike
          </h2>
          <p style={{ fontSize:16, lineHeight:1.6, color:"#475569", marginBottom:26, maxWidth:640, marginLeft:"auto", marginRight:"auto" }}>
            Ordini generati in automatico in base alle tue scadenze e necessità di produzione. Contattaci per scoprire se il tuo gestionale supporta questa funzione.
          </p>
          <a href="mailto:info@bulkstrike.com?subject=Integrazione%20gestionale%20BulkStrike" style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#0EA5E9", color:"#fff", fontSize:16, fontWeight:700, padding:"14px 28px", borderRadius:10, textDecoration:"none" }}>
            Contattaci <ArrowRight size={18} />
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
      <div className="bs-chatbot">
        {chatOpen && (
          <div className="bs-chatbot-panel">
            <div style={{ background:C.blue, padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <Bot size={18} color="white" />
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:"white" }}>BulkStrike AI</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.8)" }}>Assistente virtuale AI · ● Online</div>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.7)", display:"flex" }}>
                <X size={16} color="white" />
              </button>
            </div>
            <div style={{ padding:12, display:"flex", flexDirection:"column", gap:8, maxHeight:180, overflowY:"auto" }}>
              <div style={{ background:C.bg, borderRadius:"12px 12px 12px 4px", padding:"10px 12px", fontSize:13, maxWidth:"85%", color:C.text, lineHeight:1.5 }}>
                Ciao! Sono l'assistente virtuale (AI) di BulkStrike — non una persona. Posso aiutarti a trovare materie prime, confrontare fornitori o unirti a un'asta a ribasso. Per parlare con una persona, scrivi a davide@bulkstrike.com. Come posso aiutarti?
              </div>
            </div>
            <div style={{ borderTop:`1px solid ${C.border}` }}>
              <div style={{ padding:"6px 12px 0", fontSize:10, color:C.muted, textAlign:"center" }}>Risposte generate da intelligenza artificiale</div>
              <div style={{ padding:10, display:"flex", gap:8 }}>
                <input placeholder="Scrivi un messaggio..." style={{ flex:1, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px", fontSize:13, outline:"none", fontFamily:"Inter,system-ui" }} />
                <button style={{ background:C.blue, border:"none", borderRadius:8, width:34, cursor:"pointer", color:"white", fontWeight:700, flexShrink:0, fontFamily:"Inter,system-ui" }}>↑</button>
              </div>
            </div>
          </div>
        )}
        <button className="bs-chatbot-btn" onClick={() => setChatOpen(!chatOpen)}>
          {chatOpen ? <X size={22} color="white" /> : <Bot size={24} color="white" />}
        </button>
        <CookieBanner />
      </div>
    </div>
  );
}