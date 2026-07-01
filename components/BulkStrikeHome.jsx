import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Search, Bot, ArrowRight, Check, Clock, ChevronRight, TrendingDown, X, ChevronDown } from "lucide-react";

// ─── DATA ─────────────────────────────────────────────────────────────────────
const SEARCH_CATS = ["Tutte le categorie","Chimica","Metallurgia","Agricoltura","Tessuti","Plastiche","Minerali","Alimentari","Farmaceutici","Carta","Energia","Gomma"];

const CATEGORIES = [
  { icon:"🧪", label:"Chimica",       bg:"#EFF6FF", border:"#BFDBFE" },
  { icon:"⚙️", label:"Metallurgia",   bg:"#F0FDF4", border:"#BBF7D0" },
  { icon:"🌾", label:"Agricoltura",   bg:"#FEFCE8", border:"#FEF08A" },
  { icon:"🧵", label:"Tessuti",       bg:"#FFF7ED", border:"#FED7AA" },
  { icon:"🧴", label:"Plastiche",     bg:"#F0F9FF", border:"#BAE6FD" },
  { icon:"💎", label:"Minerali",      bg:"#FDF4FF", border:"#E9D5FF" },
  { icon:"🥗", label:"Alimentari",    bg:"#ECFDF5", border:"#A7F3D0" },
  { icon:"💊", label:"Farmaceutici",  bg:"#FFF1F2", border:"#FECDD3" },
  { icon:"📄", label:"Carta",         bg:"#F8FAFC", border:"#CBD5E1" },
  { icon:"⚡", label:"Energia",       bg:"#FEFCE8", border:"#FDE047" },
  { icon:"🔩", label:"Gomma",         bg:"#F1F5F9", border:"#CBD5E1" },
  { icon:"🌊", label:"Petrolchimica", bg:"#EFF6FF", border:"#93C5FD" },
];

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
  { n:"02", title:"Scegli: Rapido o Pool",   desc:"Acquista subito al prezzo più basso, oppure unisciti a un Pool per sbloccare lo scaglione successivo." },
  { n:"03", title:"Ricevi la merce",         desc:"Pagamento protetto in escrow. Track & trace integrato. Confermi la consegna e il gioco è fatto." },
];
const SELLER_STEPS = [
  { n:"01", title:"Pubblica il listino",     desc:"Inserisci i prodotti con listino a scaglioni. L'AI ti guida nella creazione della scheda prodotto." },
  { n:"02", title:"Ricevi richieste",        desc:"Notifiche in tempo reale su Pool attivi, aste convocate e WantedBoard compatibili con il tuo catalogo." },
  { n:"03", title:"Vinci e spedisci",        desc:"Aggiudicati la fornitura, emetti i documenti in piattaforma e ricevi il pagamento in 5 giorni." },
];

const AI_MSGS = [
  { u:true,  t:"Ho bisogno di 4 tonnellate di acido citrico food grade entro fine mese" },
  { u:false, t:"Per 4 tonnellate di Acido Citrico E330 ho due opzioni:\n\n🟢 Acquisto Rapido — Supplier B — €1,14/kg all-in — 3 giorni\n\n⭐ Pool attivo — €0,99/kg all-in — 62% completato — ~4-6 giorni\n\nIl Pool ti fa risparmiare ~€60. Vuoi che ti iscriva?" },
  { u:true,  t:"Sì, uniscimi al pool" },
  { u:false, t:"✅ Iscritto. 4t · Acido Citrico E330 · €0,99/kg all-in.\nTi avviso quando il pool si completa. 🚀" },
];

// ─── LOGO ICON ────────────────────────────────────────────────────────────────
function BSIcon({ size = 36, uid = "a" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0D2137"/><stop offset="100%" stopColor="#0C4A6E"/>
        </linearGradient>
        <linearGradient id={`ar${uid}`} x1="42" y1="12" x2="42" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8"/><stop offset="100%" stopColor="#22D3EE"/>
        </linearGradient>
      </defs>
      <rect width="56" height="56" rx="13" fill={`url(#bg${uid})`}/>
      <rect x="10" y="14" width="22" height="5.5" rx="2.75" fill="white"/>
      <rect x="10" y="23" width="16" height="5.5" rx="2.75" fill="white" fillOpacity="0.65"/>
      <rect x="10" y="32" width="10" height="5.5" rx="2.75" fill="white" fillOpacity="0.35"/>
      <rect x="36" y="12" width="1" height="32" fill="white" fillOpacity="0.07"/>
      <path d="M42 12 L42 34" stroke={`url(#ar${uid})`} strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M35.5 28.5 L42 38 L48.5 28.5" stroke={`url(#ar${uid})`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function BulkStrikeLight() {
  const [searchCat, setSearchCat]   = useState("Tutte le categorie");
  const [showCatDd, setShowCatDd]   = useState(false);
  const [searchQ, setSearchQ]       = useState("");
  const [activeChart, setActiveChart] = useState("Acido Citrico");
  const [activeTab, setActiveTab]   = useState("acquirente");
  const [chatOpen, setChatOpen]     = useState(false);
  const [count, setCount]           = useState({ pools:0, materials:0, countries:0, volume:0 });
  const [activeCat, setActiveCat]   = useState(null);

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

  const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706" };

  return (
    <div style={{ backgroundColor:"#FFFFFF", color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", overflowX:"hidden" }}>
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
          <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
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
              <input className="bs-search-input" placeholder="Cerca materie prime, fornitori, specifiche..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
              <button className="bs-search-btn"><Search size={20} color="white" /></button>
            </div>
          </div>

          {/* Nav right */}
          <div style={{ display:"flex", alignItems:"center", gap:20, flexShrink:0 }}>
            <div className="bs-nav-links" style={{ display:"flex", gap:20 }}>
              {["Pool Attivi","Prezzi","Fornitori","Come funziona"].map(l => (
                <span key={l} style={{ fontSize:14, color:C.muted, cursor:"pointer", fontWeight:500, whiteSpace:"nowrap" }}>{l}</span>
              ))}
            </div>
            <span style={{ fontSize:14, color:C.muted, cursor:"pointer", fontWeight:500, whiteSpace:"nowrap" }}>Accedi</span>
            <button className="bs-btn" style={{ padding:"9px 18px", fontSize:14 }}>Registrati</button>
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

      {/* ── CATEGORIES ── */}
      <div style={{ borderBottom:`1px solid ${C.border}`, background:"#fff" }}>
        <div style={{ maxWidth:1280, margin:"0 auto" }}>
          <div className="bs-cats">
            {CATEGORIES.map(cat => (
              <div key={cat.label} className={`bs-cat${activeCat===cat.label?" active":""}`} onClick={() => setActiveCat(activeCat===cat.label?null:cat.label)}>
                <div className="bs-cat-icon" style={{ background:cat.bg, borderColor:activeCat===cat.label?"#0EA5E9":cat.border }}>
                  {cat.icon}
                </div>
                <span style={{ fontSize:11, color:activeCat===cat.label?"#0EA5E9":C.muted, textAlign:"center", lineHeight:1.2, fontWeight:activeCat===cat.label?700:400 }}>
                  {cat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── HERO ── */}
      <div className="bs-section" style={{ paddingTop:56, paddingBottom:56 }}>
        <div className="bs-hero-grid" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:56, alignItems:"center" }}>
          <div>
            <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:100, padding:"6px 14px", marginBottom:20 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:C.green, boxShadow:`0 0 6px ${C.green}` }} />
              <span style={{ fontSize:13, color:"#1D4ED8", fontWeight:600 }}>142 Pool attivi in questo momento</span>
            </div>
            <h1 className="bs-hero-h1" style={{ fontSize:52, fontWeight:900, lineHeight:1.06, letterSpacing:"-0.03em", marginBottom:18 }}>
              Il mercato delle{" "}
              <span style={{ background:"linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>materie prime</span>{" "}
              a prezzi industriali
            </h1>
            <p style={{ fontSize:17, color:C.muted, lineHeight:1.65, marginBottom:28, maxWidth:460 }}>
              Acquista sfuso insieme ad altri. Vendi a chi vuole davvero comprare. Pool di acquisto collettivo, aste a ribasso, prezzi in tempo reale. Da 1 kg a 50 tonnellate.
            </p>
            <div className="bs-cta-btns" style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
              <button className="bs-btn">Inizia ad acquistare <ArrowRight size={18} /></button>
              <button className="bs-btn-out">Diventa fornitore</button>
            </div>
            <div style={{ display:"flex", gap:20, marginTop:20, flexWrap:"wrap" }}>
              {["✓ Registrazione gratuita","✓ Nessun abbonamento","✓ Pool senza impegno"].map(t => (
                <span key={t} style={{ fontSize:13, color:C.muted }}>{t}</span>
              ))}
            </div>
          </div>
          {/* Hero pool card */}
          <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, padding:24, boxShadow:"0 4px 24px rgba(14,165,233,0.08)", position:"relative" }}>
            <div style={{ position:"absolute", top:-12, right:16, background:C.red, borderRadius:100, padding:"4px 12px", fontSize:12, fontWeight:700, color:"#fff" }}>🔥 Quasi completo</div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>Pool più vicino all'attivazione</div>
              <div style={{ fontSize:19, fontWeight:800, color:C.text, marginBottom:2 }}>Polipropilene GP H030S</div>
              <div style={{ fontSize:13, color:C.muted }}>Vergine · 4 fornitori · 🇰🇷 🇩🇪 🇮🇹</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18 }}>
              <div style={{ background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>Prezzo pool all-in</div>
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
            <button className="bs-btn" style={{ width:"100%", justifyContent:"center" }}>Unisciti al Pool <ArrowRight size={16} /></button>
          </div>
        </div>
      </div>

      {/* ── STATS BAR ── */}
      <div style={{ background:C.bg, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1280, margin:"0 auto", padding:"36px 24px" }}>
          <div className="bs-grid-4" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:24 }}>
            {[
              { label:"Pool attivi ora",    val:count.pools,     suffix:"",   color:"#0EA5E9" },
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
            <h2 className="bs-h2">Pool attivi ora</h2>
            <p style={{ fontSize:15, color:C.muted, marginTop:8 }}>Risparmia fino al 20% rispetto ai prezzi singoli</p>
          </div>
          <button style={{ display:"flex", alignItems:"center", gap:6, color:C.blue, background:"none", border:"none", fontSize:14, fontWeight:600, cursor:"pointer" }}>
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
                    <div style={{ fontSize:11, color:C.muted, marginBottom:2 }}>Prezzo pool</div>
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
                <button className="bs-pool-btn">Unisciti al Pool <ArrowRight size={14} /></button>
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
                <span style={{ fontSize:14, color:C.muted }}>/kg · prezzo pool attuale</span>
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
      <div className="bs-section" style={{ textAlign:"center" }}>
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
              {["Trova il fornitore più economico in Europa","Uniscimi al pool più vantaggioso","Aggiorna il mio listino prezzi","Quanto ho risparmiato questo mese?"].map(f => (
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
            <button className="bs-btn" style={{ fontSize:17, padding:"15px 32px" }}>Crea account gratis <ArrowRight size={20} /></button>
            <button style={{ background:"transparent", color:"#F0F6FF", border:"1px solid #1A3454", borderRadius:10, padding:"15px 24px", fontSize:16, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Guarda come funziona</button>
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ background:"#050D18", borderTop:"1px solid #1A3454", padding:"32px 24px" }}>
        <div style={{ maxWidth:1280, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <BSIcon size={28} uid="foot" />
            <div style={{ display:"flex", alignItems:"baseline" }}>
              <span style={{ fontSize:16, fontWeight:900, color:"#F0F6FF", letterSpacing:"-0.03em" }}>Bulk</span>
              <span style={{ fontSize:16, fontWeight:900, letterSpacing:"-0.03em", background:"linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>Strike</span>
            </div>
            <span style={{ fontSize:13, color:"#3B5A7A" }}>— Il mercato B2B delle materie prime sfuse</span>
          </div>
          <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
            {["Termini","Privacy","Cookie","Contatti"].map(l => (
              <span key={l} style={{ fontSize:13, color:"#3B5A7A", cursor:"pointer" }}>{l}</span>
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
                Ciao! Sono l'assistente virtuale (AI) di BulkStrike — non una persona. Posso aiutarti a trovare materie prime, confrontare fornitori o unirti a un pool. Per parlare con una persona, scrivi a davide@bulkstrike.com. Come posso aiutarti?
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
      </div>
    </div>
  );
}
