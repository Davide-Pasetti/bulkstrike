import { useState, useEffect } from "react";
import { getPoolDetail, getPoolBids, joinPool, joinPoolAtTarget, getMyTargetJoin, cancelTargetJoin, poolErrorMessage } from "@/lib/api";
import NavAuth from "@/components/BulkStrikeNavAuth";
import { Search, Bot, ArrowRight, Check, Clock, ChevronRight, Shield, Users, TrendingDown, X, Plus, Minus, Info, Gavel, Award } from "lucide-react";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706", purple:"#7C3AED" };

// ─── pool DATA (product-level reverse auction) ────────────────────────────────
const SEED_POOL = {
  product: "Acido Tartarico L(+)",
  enum: "E334",
  standard: "Reg. (UE) 231/2012 · Codex OIV · FCC",
  current: 13800,
  secondsLeft: 4*86400 + 9*3600 + 12*60,
  bestBid: 2.27,
  bestSupplier: "Fornitore #3",
  bids: 4,
};

const TIERS = [
  { max:5000,  price:2.80, label:"1–5 t" },
  { max:20000, price:2.55, label:"5–20 t" },
  { max:50000, price:2.30, label:"20–50 t" },
  { max:Infinity, price:2.10, label:"50 t+" },
];

const SEED_BIDDERS = [
  { tag:"Fornitore #3", origin:"Cina",      flag:"🇨🇳", bid:2.27, when:"12 min fa", leader:true },
  { tag:"Fornitore #1", origin:"Polonia",   flag:"🇵🇱", bid:2.33, when:"40 min fa", leader:false },
  { tag:"Fornitore #4", origin:"Argentina", flag:"🇦🇷", bid:2.41, when:"2 ore fa",  leader:false },
  { tag:"Fornitore #2", origin:"Italia",    flag:"🇮🇹", bid:2.48, when:"5 ore fa",  leader:false },
];

const SEED_PARTICIPANTS = [
  { who:"Azienda vinicola in Abruzzo", qty:3000, when:"2 ore fa" },
  { who:"Cantina in Chianti",          qty:2400, when:"5 ore fa" },
  { who:"Cooperativa in Puglia",       qty:2800, when:"8 ore fa" },
  { who:"Azienda in Sicilia",          qty:1800, when:"1 giorno fa" },
  { who:"Cantina in Veneto",           qty:1500, when:"1 giorno fa" },
  { who:"Cantina in Piemonte",         qty:1200, when:"2 giorni fa" },
  { who:"Azienda in Toscana",          qty:700,  when:"2 giorni fa" },
  { who:"Cantina in Friuli",           qty:400,  when:"3 giorni fa" },
];

const PALLET_KG = 1000;        // peso di 1 pallet di QUESTO prodotto (acido tartarico ≈ 40×25kg / 1 big bag)
const MIN_OPEN = PALLET_KG;    // minimo per aprire un pool = 1 pallet (varia da prodotto a prodotto)

function BSIcon({ size = 36, uid = "a" }) {
  // Logo: 3 parti (clienti, fornitori, corrieri) che convergono su un unico punto — l'incontro su BulkStrike.
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#0D2137" /><stop offset="100%" stopColor="#0C4A6E" /></linearGradient>
      </defs>
      <rect width="56" height="56" rx="13" fill={`url(#bg${uid})`} />
      <line x1="28" y1="33" x2="28" y2="14" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <line x1="28" y1="33" x2="14" y2="45" stroke="white" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.85" />
      <line x1="28" y1="33" x2="42" y2="45" stroke="white" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.85" />
      <circle cx="28" cy="14" r="4.2" fill="white" />
      <circle cx="14" cy="45" r="4.2" fill="white" fillOpacity="0.85" />
      <circle cx="42" cy="45" r="4.2" fill="white" fillOpacity="0.85" />
      <circle cx="28" cy="33" r="5.5" fill="white" />
    </svg>
  );
}

const eur = (n) => n.toLocaleString("it-IT", { style:"currency", currency:"EUR", maximumFractionDigits:0 });
const eurKg = (n) => "€" + n.toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });
const kg = (n) => n.toLocaleString("it-IT");
function tierCeiling(qty){ for(const t of TIERS) if(qty<=t.max) return t.price; return 2.10; }
function tierFor(vol){ for(let i=0;i<TIERS.length;i++) if(vol<=TIERS[i].max) return TIERS[i]; return TIERS[TIERS.length-1]; }

function relTime(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return "ora";
  if (s < 3600) return `${Math.floor(s / 60)} min fa`;
  if (s < 86400) return `${Math.floor(s / 3600)} ore fa`;
  return `${Math.floor(s / 86400)} giorni fa`;
}

export default function PoolAuctionPage() {
  const [pool, setPool] = useState(SEED_POOL);
  const [bidders, setBidders] = useState(SEED_BIDDERS);
  const [participants, setParticipants] = useState(SEED_PARTICIPANTS);
  const [poolId, setPoolId] = useState(null);
  const [joining, setJoining] = useState(false);
  const [joinMsg, setJoinMsg] = useState(null);
  const [userQty, setUserQty] = useState(2000);
  const [chatOpen, setChatOpen] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [secs, setSecs] = useState(pool.secondsLeft);
  const [joined, setJoined] = useState(false);
  const [targetJoin, setTargetJoin] = useState(null);   // { id, quantity_kg, target_price_per_kg } | null
  const [showTargetInput, setShowTargetInput] = useState(false);
  const [targetPrice, setTargetPrice] = useState("");

  useEffect(() => {
    const t = setInterval(() => setSecs(s => s>0 ? s-1 : 0), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;            // nessun id → resta il pool dimostrativo
    setPoolId(id);
    loadPool(id);
    getMyTargetJoin(id).then(setTargetJoin).catch(() => {});
  }, []);

  async function loadPool(id) {
    try {
      const [detail, bids] = await Promise.all([getPoolDetail(id), getPoolBids(id)]);
      const bd = (bids || []).map((b, i) => ({ tag: b.anon_label, origin: "", flag: "", bid: b.price_per_kg, when: relTime(b.created_at), leader: i === 0 }));
      const count = detail.participants?.[0]?.count || 0;
      const total = detail.total_volume_kg || 0;
      const share = count ? Math.round(total / count) : 0;
      setBidders(bd);
      setParticipants(Array.from({ length: count }, () => ({ who: "Azienda partecipante", qty: share, when: "" })));
      setPool({
        product: detail.product?.canonical_name || "",
        enum: detail.product?.e_number || "",
        standard: SEED_POOL.standard,
        current: total,
        secondsLeft: 0,
        bestBid: detail.best_price_per_kg ?? (bd[0]?.bid ?? tierFor(total).price),
        bestSupplier: bd[0]?.tag || "—",
        bids: bd.length,
      });
      setSecs(Math.max(0, Math.floor((new Date(detail.closes_at) - Date.now()) / 1000)));
    } catch (e) {
      setJoinMsg(poolErrorMessage(e));
    }
  }

  async function joinTheAuction() {
    if (!poolId) { setJoinMsg("Questa è l'asta dimostrativa. Apri /pool?id=… con un'asta reale per partecipare."); return; }
    setJoining(true); setJoinMsg(null);
    try {
      await joinPool(poolId, userQty, true);
      setJoinMsg("✓ Adesione registrata: sei nell'asta.");
      setJoined(true);
      loadPool(poolId);
    } catch (e) {
      setJoinMsg(poolErrorMessage(e));
    } finally {
      setJoining(false);
    }
  }

  // Aderisci quando il prezzo raggiunge la soglia scelta. Se il prezzo attuale
  // è già a quel livello o sotto, il server unisce subito (stessa cosa di joinTheAuction).
  async function joinAtTarget() {
    if (!poolId) { setJoinMsg("Questa è l'asta dimostrativa. Apri /pool?id=… con un'asta reale per partecipare."); return; }
    const price = parseFloat(String(targetPrice).replace(",", "."));
    if (!price || price <= 0) { setJoinMsg("Inserisci un prezzo soglia valido."); return; }
    setJoining(true); setJoinMsg(null);
    try {
      const res = await joinPoolAtTarget(poolId, userQty, price, true);
      if (res?.status === "joined_now") {
        setJoinMsg("✓ Adesione registrata: sei nell'asta.");
        setJoined(true);
      } else {
        setTargetJoin({ quantity_kg: userQty, target_price_per_kg: price });
        setShowTargetInput(false);
      }
      loadPool(poolId);
    } catch (e) {
      setJoinMsg(poolErrorMessage(e));
    } finally {
      setJoining(false);
    }
  }

  async function cancelTarget() {
    if (targetJoin?.id) { try { await cancelTargetJoin(targetJoin.id); } catch (e) {} }
    setTargetJoin(null);
  }

  const d = Math.floor(secs/86400), h = Math.floor((secs%86400)/3600), m = Math.floor((secs%3600)/60), s = secs%60;

  const projected = pool.current + userQty;
  const currentTier = tierFor(pool.current);
  const projectedTier = tierFor(projected);
  const ceilingNow = currentTier.price;
  const effectiveNow = Math.min(pool.bestBid, ceilingNow);
  const nextThreshold = currentTier.max === Infinity ? null : currentTier.max;
  const toNext = nextThreshold ? Math.max(0, nextThreshold - pool.current) : 0;
  const crossesTier = projectedTier.max !== currentTier.max;
  const aloneCeiling = tierCeiling(userQty);
  const savings = Math.max(0, (aloneCeiling - effectiveNow) * userQty);
  const setQtySafe = (v) => setUserQty(Math.max(100, Math.min(40000, v)));
  const belowMin = userQty < MIN_OPEN;

  return (
    <div style={{ background:"#fff", color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", overflowX:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .bs-num { font-family:'JetBrains Mono',monospace; }
        .bs-ticker-wrap { overflow:hidden; width:100%; }
        .bs-ticker { display:flex; width:max-content; animation:tick 45s linear infinite; }
        .bs-ticker:hover { animation-play-state:paused; }
        @keyframes tick { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes fill { from{width:0} }
        .bs-btn { background:#7C3AED; color:#fff; border:none; border-radius:10px; padding:14px 24px; font-size:16px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:8px; transition:all 0.2s; font-family:'Inter',system-ui; }
        .bs-btn:hover:not(:disabled){ background:#6D28D9; transform:translateY(-1px); box-shadow:0 6px 20px rgba(124,58,237,0.3); }
        .bs-btn:disabled { background:#CBD5E1; cursor:not-allowed; }
        .bs-btn-blue { background:#0EA5E9; }
        .bs-btn-blue:hover { background:#0284C7; box-shadow:0 6px 20px rgba(14,165,233,0.3); }
        .bs-qty-btn { width:38px; height:38px; border:1px solid #E2E8F0; background:#fff; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#475569; }
        .bs-qty-btn:hover { border-color:#7C3AED; color:#7C3AED; }
        .bs-chip { border-radius:6px; padding:3px 9px; font-size:11px; font-weight:600; display:inline-flex; align-items:center; gap:4px; }
        .bs-card { border:1px solid #E2E8F0; border-radius:14px; padding:20px; }
        .bs-live-dot { width:8px; height:8px; border-radius:50%; background:#DC2626; animation:pulse 1.5s infinite; }
        .bs-search-wrap { display:flex; border:2px solid #0EA5E9; border-radius:10px; overflow:hidden; height:44px; flex:1; max-width:520px; background:#fff; }
        @media (max-width:880px){
          .bs-hero-grid { grid-template-columns:1fr !important; gap:24px !important; }
          .bs-cols { grid-template-columns:1fr !important; }
          .bs-two { grid-template-columns:1fr !important; }
          .bs-nav-links { display:none !important; }
          .bs-search-wrap { max-width:100% !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ position:"sticky", top:0, zIndex:50, background:"rgba(255,255,255,0.96)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"0 20px", height:64, display:"flex", alignItems:"center", gap:18 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display:"flex", alignItems:"center", gap:9, flexShrink:0, cursor:"pointer" }}>
            <BSIcon size={34} uid="nav" />
            <div style={{ display:"flex", alignItems:"baseline" }}>
              <span style={{ fontSize:19, fontWeight:900, letterSpacing:"-0.03em" }}>Bulk</span>
              <span style={{ fontSize:19, fontWeight:900, letterSpacing:"-0.03em", background:"linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>Strike</span>
            </div>
          </div>
          <div style={{ flex:1, display:"flex", justifyContent:"center" }}>
            <div className="bs-search-wrap">
              <input style={{ flex:1, border:"none", padding:"0 14px", fontSize:14, outline:"none", fontFamily:"Inter,system-ui" }} placeholder="Cerca materie prime, fornitori, specifiche..." onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) window.location.href = "/"; }} />
              <button style={{ background:C.blue, border:"none", padding:"0 16px", cursor:"pointer" }}><Search size={18} color="#fff" /></button>
            </div>
          </div>
          <div className="bs-nav-links" style={{ display:"flex", gap:18, alignItems:"center" }}>
            {[["Aste a ribasso","/pool"],["Prodotti","/catalogo"],["Fornitori","/registrati"]].map(([l,href]) => <span key={l} onClick={() => { window.location.href = href; }} style={{ fontSize:14, color:C.muted, cursor:"pointer", fontWeight:500 }}>{l}</span>)}
            <NavAuth />
          </div>
        </div>
      </nav>

      {/* TICKER */}
      <div style={{ background:"#07111E", padding:"9px 0" }}>
        <div className="bs-ticker-wrap"><div className="bs-ticker">
          {[...Array(2)].flatMap((_,k) => [
            ["Acido Tartarico","€2,27",-3.1],["Acido Citrico","€0,81",-2.3],["Metabisolfito K","€1,95",1.1],["Bentonite","€0,42",-0.6],["Acido Malico","€3,10",0.9],["Gomma Arabica","€8,40",2.2],["Mannoproteine","€14,20",-0.3],["MCR","€0,95",1.7]
          ].map(([n,p,c],i) => (
            <div key={k+"-"+i} style={{ display:"flex", alignItems:"center", gap:8, padding:"0 22px", whiteSpace:"nowrap" }}>
              <span style={{ fontSize:13, color:"#6B94B8" }}>{n}</span>
              <span className="bs-num" style={{ fontSize:13, fontWeight:600, color:"#F0F6FF" }}>{p}/kg</span>
              <span className="bs-num" style={{ fontSize:12, color:c>=0?"#10B981":"#F43F5E" }}>{c>=0?"▲":"▼"} {Math.abs(c)}%</span>
              <span style={{ color:"#1A3454", margin:"0 4px" }}>·</span>
            </div>
          )))}
        </div></div>
      </div>

      <div style={{ maxWidth:1200, margin:"0 auto", padding:"20px 20px 60px" }}>

        {/* BREADCRUMB */}
        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.muted, marginBottom:18, flexWrap:"wrap" }}>
          <span>Home</span><ChevronRight size={13}/><span>Asta a ribasso · attive</span><ChevronRight size={13}/>
          <span style={{ color:C.text, fontWeight:600 }}>{pool.product}</span>
        </div>

        {/* HEADER */}
        <div style={{ display:"flex", justifyContent:"space-between", gap:16, flexWrap:"wrap", marginBottom:20 }}>
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap", alignItems:"center" }}>
              <span className="bs-chip" style={{ background:"#FBF7FF", color:C.purple }}><Gavel size={12}/> Asta a ribasso · per prodotto</span>
              <span className="bs-chip" style={{ background:"#FEF2F2", color:C.red }}><span className="bs-live-dot"/> Live</span>
              <span className="bs-chip" style={{ background:"#EFF6FF", color:"#1D4ED8" }}>{pool.enum}</span>
            </div>
            <h1 style={{ fontSize:30, fontWeight:800, letterSpacing:"-0.02em", marginBottom:6 }}>{pool.product}</h1>
            <div style={{ fontSize:14, color:C.muted, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              <Award size={14} color={C.green}/> Standard garantito: <b style={{ color:C.text }}>{pool.standard}</b>
            </div>
          </div>
          <div style={{ textAlign:"center", background:C.bg, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 18px" }}>
            <div style={{ fontSize:11, color:C.muted, marginBottom:6, display:"flex", alignItems:"center", gap:4, justifyContent:"center" }}><Clock size={12}/> Chiusura tra (ciclo 7 giorni)</div>
            <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
              {[[d,"g"],[h,"h"],[m,"m"],[s,"s"]].map(([val,lab],i) => (
                <div key={i} style={{ minWidth:42 }}>
                  <div className="bs-num" style={{ fontSize:24, fontWeight:800, color:C.text }}>{String(val).padStart(2,"0")}</div>
                  <div style={{ fontSize:10, color:C.muted }}>{lab}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* TWO LEVERS */}
        <div className="bs-two" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:24 }}>
          <div style={{ background:"#FBF7FF", border:`1px solid ${C.purple}33`, borderRadius:12, padding:"14px 16px", display:"flex", gap:12, alignItems:"flex-start" }}>
            <div style={{ width:34, height:34, borderRadius:9, background:C.purple, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Users size={17} color="#fff"/></div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:2 }}>Leva 1 · Volume aggregato</div>
              <div style={{ fontSize:13, color:C.muted, lineHeight:1.5 }}>Più richieste di prodotto si aggregano, più si sblocca uno scaglione di prezzo più basso per tutti.</div>
            </div>
          </div>
          <div style={{ background:"#EFF6FF", border:`1px solid #BFDBFE`, borderRadius:12, padding:"14px 16px", display:"flex", gap:12, alignItems:"flex-start" }}>
            <div style={{ width:34, height:34, borderRadius:9, background:C.blue, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Gavel size={17} color="#fff"/></div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:2 }}>Leva 2 · Ribasso fornitori</div>
              <div style={{ fontSize:13, color:C.muted, lineHeight:1.5 }}>Tutti i fornitori certificati di questa materia prima competono al ribasso. Vince il più economico.</div>
            </div>
          </div>
        </div>

        {/* HERO: live auction + join */}
        <div className="bs-hero-grid" style={{ display:"grid", gridTemplateColumns:"1.5fr 1fr", gap:24, border:`2px solid ${C.purple}`, borderRadius:18, padding:28, marginBottom:24, background:"#FBF9FF" }}>

          {/* LEFT */}
          <div>
            <div style={{ display:"flex", gap:24, flexWrap:"wrap", marginBottom:22 }}>
              <div>
                <div style={{ fontSize:12, color:C.muted, marginBottom:2 }}>Miglior prezzo attuale</div>
                <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                  <span className="bs-num" style={{ fontSize:38, fontWeight:800, color:C.purple }}>{eurKg(effectiveNow)}</span>
                  <span style={{ fontSize:14, color:C.muted }}>/kg</span>
                  <span style={{ fontSize:12, color:C.green, display:"flex", alignItems:"center", gap:2 }}><TrendingDown size={12}/> in calo</span>
                </div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>offerto da <b style={{ color:C.text }}>{pool.bestSupplier}</b> · {pool.bids} fornitori in gara</div>
              </div>
              <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:24 }}>
                <div style={{ fontSize:12, color:C.muted, marginBottom:2 }}>Volume aggregato</div>
                <div className="bs-num" style={{ fontSize:38, fontWeight:800, color:C.text }}>{kg(pool.current)}<span style={{ fontSize:14, fontWeight:400, color:C.muted }}> kg</span></div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{participants.length} aziende · scaglione {currentTier.label}</div>
              </div>
            </div>

            {nextThreshold && (
              <div style={{ marginBottom:20 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:6 }}>
                  <span style={{ color:C.muted }}>Prossimo scaglione: <b style={{ color:C.text }}>{kg(nextThreshold)} kg → tetto {eurKg(tierFor(nextThreshold+1).price)}/kg</b></span>
                  <span className="bs-num" style={{ color:C.purple, fontWeight:700 }}>{kg(pool.current)} / {kg(nextThreshold)}</span>
                </div>
                <div style={{ height:16, background:"#EDE4F7", borderRadius:100, overflow:"hidden", display:"flex" }}>
                  <div style={{ width:`${pool.current/nextThreshold*100}%`, height:"100%", background:`linear-gradient(90deg,${C.purple},#A855F7)`, animation:"fill 1s ease" }}/>
                  {crossesTier && userQty>0 && (
                    <div style={{ width:`${Math.min((projected-pool.current)/nextThreshold*100, 100-pool.current/nextThreshold*100)}%`, height:"100%", background:`repeating-linear-gradient(45deg,${C.blue},${C.blue} 6px,#38BDF8 6px,#38BDF8 12px)` }}/>
                  )}
                </div>
                <div style={{ fontSize:12, color:C.muted, marginTop:6 }}>
                  Mancano <b className="bs-num" style={{ color:C.purple }}>{kg(toNext)} kg</b> per abbassare il tetto a {eurKg(tierFor(nextThreshold+1).price)}/kg.
                  {crossesTier && <span style={{ color:C.blue, fontWeight:600 }}> Con la tua quantità lo sblocchi! 🎉</span>}
                </div>
              </div>
            )}

            <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:12, padding:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <span style={{ fontSize:13, fontWeight:700, display:"flex", alignItems:"center", gap:6 }}><Gavel size={14} color={C.purple}/> Offerte dei fornitori (live)</span>
                <span style={{ fontSize:11, color:C.muted }}>identità svelata alla chiusura</span>
              </div>
              {bidders.map((b,i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:i<bidders.length-1?`1px solid #F1F5F9`:"none" }}>
                  <span style={{ fontSize:13, fontWeight:600, minWidth:96 }}>{b.tag}</span>
                  <span style={{ fontSize:13 }}>{b.flag}</span>
                  <span style={{ fontSize:12, color:C.muted, flex:1 }}>{b.when}</span>
                  {b.leader && <span className="bs-chip" style={{ background:"#DCFCE7", color:C.green }}>★ leader</span>}
                  <span className="bs-num" style={{ fontSize:15, fontWeight:700, color:b.leader?C.green:C.text, minWidth:64, textAlign:"right" }}>{eurKg(b.bid)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: join */}
          <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:20 }}>
            {joined ? (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                  <div style={{ width:34, height:34, borderRadius:"50%", background:"#DCFCE7", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Check size={18} color={C.green}/></div>
                  <div style={{ fontSize:15, fontWeight:700 }}>Ti sei unito all'asta a ribasso!</div>
                </div>
                <div style={{ fontSize:13, color:C.muted, marginBottom:16, lineHeight:1.5 }}>La tua quantità è entrata nel volume aggregato. Segui l'andamento dell'asta dal tuo profilo.</div>
                <button onClick={() => { window.location.href = "/dashboard?section=pools"; }} className="bs-btn" style={{ width:"100%" }}>Visualizza le tue aste <ArrowRight size={18}/></button>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:12, fontSize:12, color:C.muted }}>
                  <Shield size={20} color={C.green} style={{ flexShrink:0 }}/>
                  <span>Pagamento in escrow al prezzo di chiusura. Mai più dell'Acquisto Rapido.</span>
                </div>
              </>
            ) : targetJoin ? (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                  <div style={{ width:34, height:34, borderRadius:"50%", background:"#FFF7ED", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Clock size={18} color={C.amber}/></div>
                  <div style={{ fontSize:15, fontWeight:700 }}>Adesione in attesa</div>
                </div>
                <div style={{ fontSize:13, color:C.muted, marginBottom:16, lineHeight:1.5 }}>
                  Ti aggiungeremo automaticamente con <b style={{color:C.text}}>{kg(targetJoin.quantity_kg)} kg</b> non appena un fornitore scende a <b style={{color:C.text}}>{eurKg(targetJoin.target_price_per_kg)}/kg</b> o sotto. Nessuna azione richiesta da parte tua.
                </div>
                <button onClick={cancelTarget} style={{ width:"100%", background:"transparent", color:C.muted, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"12px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Annulla adesione in attesa</button>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:12, fontSize:12, color:C.muted }}>
                  <Shield size={20} color={C.green} style={{ flexShrink:0 }}/>
                  <span>Pagamento in escrow al prezzo di chiusura. Mai più dell'Acquisto Rapido.</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>Aderisci all'asta</div>
                <div style={{ fontSize:13, color:C.muted, marginBottom:14 }}>La tua quantità entra subito nel volume aggregato</div>

                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                  <button className="bs-qty-btn" onClick={() => setQtySafe(userQty-500)}><Minus size={16}/></button>
                  <div style={{ flex:1, display:"flex", alignItems:"baseline", justifyContent:"center", gap:6, background:C.bg, border:`1px solid ${belowMin?C.amber:C.border}`, borderRadius:8, padding:"9px 12px" }}>
                    <input className="bs-num" style={{ width:80, border:"none", outline:"none", background:"transparent", fontSize:20, fontWeight:700, textAlign:"center", color:C.text }} value={userQty} onChange={e => setQtySafe(parseInt(e.target.value.replace(/\D/g,"")||"0"))}/>
                    <span style={{ fontSize:14, color:C.muted }}>kg</span>
                  </div>
                  <button className="bs-qty-btn" onClick={() => setUserQty(userQty+500)}><Plus size={16}/></button>
                </div>

                <div style={{ display:"flex", gap:6, marginBottom:14 }}>
                  {[PALLET_KG,2000,5000].map(q => (
                    <button key={q} onClick={() => setUserQty(q)} style={{ flex:1, padding:"7px", borderRadius:7, border:`1px solid ${userQty===q?C.purple:C.border}`, background:userQty===q?"#FBF7FF":"#fff", color:userQty===q?C.purple:C.muted, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>{q===PALLET_KG?"1 pallet":`${q/1000}t`}</button>
                  ))}
                </div>

                {belowMin && (
                  <div style={{ background:"#FFFBEB", border:`1px solid ${C.amber}55`, borderRadius:9, padding:"10px 12px", marginBottom:14, fontSize:12, color:"#92400E", display:"flex", gap:8 }}>
                    <Info size={26} color={C.amber} style={{ flexShrink:0 }}/>
                    <span>Sotto i <b>{kg(MIN_OPEN)} kg (1 pallet di questo prodotto)</b> non puoi aprire un pool, ma puoi aggiungerti a questo già attivo oppure fare l'<b>Acquisto Rapido</b>.</span>
                  </div>
                )}

                <div style={{ background:C.bg, borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
                    <span style={{ fontSize:13, color:C.muted }}>Prezzo stimato (live)</span>
                    <span className="bs-num" style={{ fontSize:24, fontWeight:800, color:C.purple }}>{eurKg(effectiveNow)}<span style={{ fontSize:13, fontWeight:400, color:C.muted }}>/kg</span></span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", paddingTop:8, borderTop:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:13, color:C.muted }}>Risparmio vs Acquisto Rapido</span>
                    <span className="bs-num" style={{ fontSize:18, fontWeight:800, color:C.green }}>{eur(savings)}</span>
                  </div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>Il prezzo finale può solo scendere fino alla chiusura.</div>
                </div>

                <label style={{ display:"flex", gap:10, alignItems:"flex-start", background:"#FFF7ED", border:`1px solid ${C.amber}44`, borderRadius:9, padding:"11px 12px", marginBottom:14, cursor:"pointer" }}>
                  <input type="checkbox" checked={acceptTerms} onChange={e => setAcceptTerms(e.target.checked)} style={{ marginTop:2, width:16, height:16, accentColor:C.purple, flexShrink:0 }}/>
                  <span style={{ fontSize:12, color:"#7C2D12", lineHeight:1.5 }}>
                    Partecipando all'asta accetto l'acquisto della specifica materia prima dal fornitore che offrirà il prezzo più basso tra quelli certificati allo standard sopra indicato.
                  </span>
                </label>

                {showTargetInput && (
                  <div style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:12, marginBottom:12, background:C.bg }}>
                    <div style={{ fontSize:12.5, fontWeight:600, color:C.muted, marginBottom:8 }}>A quale prezzo vuoi aderire?</div>
                    <div style={{ display:"flex", alignItems:"center", gap:6, background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px" }}>
                      <span style={{ color:C.muted }}>€</span>
                      <input value={targetPrice} onChange={e => setTargetPrice(e.target.value.replace(/[^0-9,.]/g,""))} placeholder={String(effectiveNow.toFixed(2)).replace(".",",")} className="bs-num" style={{ flex:1, border:"none", outline:"none", fontSize:16, fontWeight:700, color:C.text }}/>
                      <span style={{ color:C.muted, fontSize:13 }}>/kg</span>
                    </div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>Prezzo attuale: {eurKg(effectiveNow)}/kg. Ti aggiungeremo in automatico se e quando un fornitore arriva a questa cifra.</div>
                  </div>
                )}

                <button onClick={joinTheAuction} className="bs-btn" style={{ width:"100%", marginBottom:8 }} disabled={!acceptTerms || joining}>{joining ? "Adesione in corso…" : <>Aderisci all'asta a ribasso all'attuale prezzo <ArrowRight size={18}/></>}</button>
                <button
                  onClick={() => { if (showTargetInput) joinAtTarget(); else setShowTargetInput(true); }}
                  style={{ width:"100%", background:"transparent", color:C.purple, border:`1.5px solid ${C.purple}`, borderRadius:10, padding:"12px", fontSize:14, fontWeight:700, cursor:(!acceptTerms||joining)?"default":"pointer", opacity:(!acceptTerms||joining)?0.5:1, fontFamily:"Inter,system-ui", display:"flex", alignItems:"center", justifyContent:"center", gap:6, textAlign:"center" }}
                  disabled={!acceptTerms || joining}
                >
                  {joining ? "Attivazione in corso…" : showTargetInput ? "Conferma soglia e attiva adesione" : "Aderisci all'asta a ribasso quando il prezzo raggiunge una cifra stabilita"}
                </button>
                {joinMsg && <div style={{ marginTop:10, fontSize:13, textAlign:"center", color: joinMsg.startsWith("✓") ? C.green : C.red }}>{joinMsg}</div>}
                <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:12, fontSize:12, color:C.muted }}>
                  <Shield size={20} color={C.green} style={{ flexShrink:0 }}/>
                  <span>Pagamento in escrow al prezzo di chiusura. Mai più dell'Acquisto Rapido.</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* GUARANTEE STRIP */}
        <div style={{ background:"#07111E", borderRadius:14, padding:"18px 24px", marginBottom:28, display:"flex", gap:14, alignItems:"center", flexWrap:"wrap" }}>
          <Shield size={22} color="#22D3EE" style={{ flexShrink:0 }}/>
          <div style={{ flex:1, minWidth:220 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#F0F6FF" }}>L'asta si chiude sempre · a rischio zero</div>
            <div style={{ fontSize:13, color:"#6B94B8", lineHeight:1.5 }}>Anche se l'asta resta deserta e sei l'unico partecipante, alla scadenza acquisti comunque la tua quantità al prezzo del tuo volume. Non paghi mai più dell'Acquisto Rapido: l'unico costo è l'attesa.</div>
          </div>
        </div>

        {/* TWO COLUMNS */}
        <div className="bs-cols" style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:24, alignItems:"start" }}>

          {/* LEFT */}
          <div>
            <div className="bs-card" style={{ marginBottom:20 }}>
              <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Scaglioni di volume (prezzo tetto)</div>
              <div style={{ fontSize:13, color:C.muted, marginBottom:14 }}>È il prezzo massimo per fascia di volume. I fornitori possono ribassare sotto questi valori in asta.</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {TIERS.map((t,i) => {
                  const reached = pool.current >= (i===0?0:TIERS[i-1].max);
                  const isCurrent = t.max===currentTier.max;
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:10, border:`1px solid ${isCurrent?C.purple:C.border}`, background:isCurrent?"#FBF7FF":"#fff" }}>
                      <div style={{ width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", background:reached?C.green:"#F1F5F9", flexShrink:0 }}>
                        {reached ? <Check size={15} color="#fff"/> : <span style={{ fontSize:12, fontWeight:700, color:C.muted }}>{i+1}</span>}
                      </div>
                      <div style={{ flex:1 }}>
                        <span style={{ fontSize:14, fontWeight:600 }}>{t.label}</span>
                        {isCurrent && <span className="bs-chip" style={{ background:C.purple, color:"#fff", marginLeft:8 }}>Scaglione attuale</span>}
                      </div>
                      <span className="bs-num" style={{ fontSize:18, fontWeight:800, color:isCurrent?C.purple:C.text }}>{eurKg(t.price)}<span style={{ fontSize:11, fontWeight:400, color:C.muted }}>/kg tetto</span></span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bs-card" style={{ marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div style={{ fontSize:16, fontWeight:700 }}>Chi ha aderito</div>
                <span style={{ fontSize:12, color:C.muted }}>{participants.length} aziende · {kg(pool.current)} kg</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column" }}>
                {participants.map((p,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:i<participants.length-1?`1px solid #F1F5F9`:"none" }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", background:"#EFF6FF", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Users size={15} color={C.blue}/></div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600 }}>{p.who}</div>
                      <div style={{ fontSize:12, color:C.muted }}>{p.when}</div>
                    </div>
                    <span className="bs-num" style={{ fontSize:14, fontWeight:700 }}>{kg(p.qty)} kg</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bs-card">
              <div style={{ fontSize:16, fontWeight:700, marginBottom:14 }}>Come funziona l'asta a ribasso</div>
              {[
                ["Apri o unisciti",`Apri un'asta a ribasso (minimo 1 pallet, ${kg(PALLET_KG)} kg per questo prodotto) o unisciti a una già attiva. La tua quantità entra subito nel volume aggregato.`],
                ["Doppio ribasso per 7 giorni","Per una settimana il prezzo scende in due modi: i fornitori certificati competono al ribasso e ogni nuova adesione può sbloccare uno scaglione di volume più basso."],
                ["Vince il più economico","Alla chiusura si aggiudica il fornitore con l'offerta più bassa tra quelli conformi allo standard. La sua identità viene svelata."],
                ["Chiusura garantita","L'asta chiude sempre. Anche da solo acquisti al prezzo del tuo volume. Pagamento in escrow, spedizione separata per ogni azienda."],
              ].map(([t,desc],i) => (
                <div key={i} style={{ display:"flex", gap:12, marginBottom:i<3?14:0 }}>
                  <div style={{ width:24, height:24, borderRadius:"50%", background:C.purple, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>{i+1}</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, marginBottom:2 }}>{t}</div>
                    <div style={{ fontSize:13, color:C.muted, lineHeight:1.55 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT STICKY */}
          <div style={{ position:"sticky", top:80, display:"flex", flexDirection:"column", gap:16 }}>
            <div className="bs-card">
              <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Fornitori in gara</div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>Tutti certificati allo standard richiesto. Identità svelata alla chiusura.</div>
              {bidders.map((b,i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderBottom:i<bidders.length-1?`1px solid #F1F5F9`:"none" }}>
                  <span style={{ fontSize:14 }}>{b.flag}</span>
                  <span style={{ fontSize:13, fontWeight:600, flex:1 }}>{b.tag}</span>
                  <span style={{ fontSize:12, color:C.muted }}>{b.origin}</span>
                  {b.leader && <Award size={14} color={C.green}/>}
                </div>
              ))}
            </div>

            <div className="bs-card">
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
                <span className="bs-live-dot"/><span style={{ fontSize:14, fontWeight:700 }}>Attività recente</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
                <Activity icon={<Gavel size={12} color={C.blue}/>} text={<><b>Fornitore #3</b> ha ribassato a <b className="bs-num" style={{color:C.green}}>€2,27/kg</b></>} when="12 min fa"/>
                {participants.slice(0,4).map((p,i) => (
                  <Activity key={i} icon={<Users size={12} color={C.purple}/>} text={<><b>{p.who}</b> ha aggiunto <b className="bs-num" style={{color:C.purple}}>{kg(p.qty)} kg</b></>} when={p.when}/>
                ))}
              </div>
            </div>

            <div className="bs-card" style={{ background:"#EFF6FF", borderColor:"#BFDBFE", textAlign:"center" }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Vuoi scegliere il fornitore?</div>
              <div style={{ fontSize:13, color:C.muted, marginBottom:12 }}>Con l'Acquisto Rapido scegli qualità, origine e tempi — non solo prezzo.</div>
              <button className="bs-btn bs-btn-blue" style={{ width:"100%", fontSize:14, padding:"11px" }}>Vai all'Acquisto Rapido <ArrowRight size={15}/></button>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ background:"#050D18", padding:"28px 20px" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:14 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display:"flex", alignItems:"center", gap:9, cursor:"pointer" }}>
            <BSIcon size={26} uid="foot"/><span style={{ fontSize:15, fontWeight:900, color:"#F0F6FF" }}>BulkStrike</span>
          </div>
          <div style={{ display:"flex", gap:18, flexWrap:"wrap" }}>
            {[["Termini","/legale#termini"],["Privacy","/legale#privacy"],["Cookie","/legale#cookie"],["Contatti","mailto:info@bulkstrike.com"]].map(([l,href]) => <a key={l} href={href} style={{ fontSize:13, color:"#3B5A7A", cursor:"pointer", textDecoration:"none" }}>{l}</a>)}
          </div>
          <div style={{ fontSize:13, color:"#3B5A7A" }}>© 2026 BulkStrike S.r.l.</div>
        </div>
      </div>

      {/* CHATBOT */}
      <div style={{ position:"fixed", bottom:24, right:24, zIndex:1000 }}>
        {chatOpen && (
          <div style={{ position:"absolute", bottom:70, right:0, width:300, background:"#fff", borderRadius:16, border:`1px solid ${C.border}`, boxShadow:"0 20px 60px rgba(0,0,0,0.15)", overflow:"hidden" }}>
            <div style={{ background:C.purple, padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                <Bot size={18} color="#fff"/><div><div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>BulkStrike AI</div><div style={{ fontSize:11, color:"rgba(255,255,255,0.8)" }}>Assistente virtuale AI · ● Online</div></div>
              </div>
              <button onClick={() => setChatOpen(false)} style={{ background:"none", border:"none", cursor:"pointer" }}><X size={16} color="#fff"/></button>
            </div>
            <div style={{ padding:12 }}>
              <div style={{ background:C.bg, borderRadius:"12px 12px 12px 4px", padding:"10px 12px", fontSize:13, color:C.text, lineHeight:1.5 }}>
                Sono l'assistente virtuale (AI) di BulkStrike, non una persona. Questa è un'asta a ribasso: il prezzo ora è €2,27/kg e può solo scendere fino alla chiusura. Vuoi che ti spieghi la differenza con l'Acquisto Rapido? Per parlare con una persona, scrivi a davide@bulkstrike.com.
              </div>
            </div>
            <div style={{ borderTop:`1px solid ${C.border}` }}>
              <div style={{ padding:"6px 12px 0", fontSize:10, color:C.muted, textAlign:"center" }}>Risposte generate da intelligenza artificiale</div>
              <div style={{ padding:10, display:"flex", gap:8 }}>
                <input placeholder="Scrivi un messaggio..." style={{ flex:1, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px", fontSize:13, outline:"none", fontFamily:"Inter,system-ui" }}/>
                <button style={{ background:C.purple, border:"none", borderRadius:8, width:34, cursor:"pointer", color:"#fff", fontWeight:700 }}>→</button>
              </div>
            </div>
          </div>
        )}
        <button onClick={() => setChatOpen(!chatOpen)} style={{ width:56, height:56, borderRadius:"50%", background:C.purple, border:"3px solid #fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 20px rgba(124,58,237,0.4)" }}>
          {chatOpen ? <X size={22} color="#fff"/> : <Bot size={24} color="#fff"/>}
        </button>
      </div>
    </div>
  );
}

function Activity({ icon, text, when }) {
  return (
    <div style={{ display:"flex", gap:9, fontSize:13 }}>
      <div style={{ marginTop:2, flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ color:"#0F172A", lineHeight:1.4 }}>{text}</div>
        <div style={{ fontSize:11, color:"#64748B" }}>{when}</div>
      </div>
    </div>
  );
}
