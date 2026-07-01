import { useState } from "react";
import { Search, Bot, ArrowRight, Check, Star, Shield, Truck, Clock, MapPin, Award, BadgeCheck, MessageSquare, Beaker, TrendingUp, X, ChevronRight } from "lucide-react";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", amber:"#D97706", purple:"#7C3AED" };

const SUPPLIER = {
  name:"Distillerie Mazzari",
  flag:"🇮🇹", country:"Italia", city:"Sant'Agata sul Santerno (RA)",
  type:"Produttore · Naturale da fecce di vino",
  since:"2024", rating:4.9, reviews:218, verified:true,
  desc:"Produttore italiano di acido tartarico naturale e derivati, ottenuti dalla lavorazione delle fecce e dei sottoprodotti della vinificazione. Forniamo cantine e industria alimentare con prodotti ad alta purezza, tracciabili e conformi agli standard OIV. Vendita sfusa in sacchi da 25 kg e big bag.",
  certs:["Food Grade","OIV","ISO 9001","Kosher"],
  stats:{ orders:"1.240+", onTime:"99,2%", response:"~2 ore", years:"dal 2024" },
};

const PRODUCTS = [
  { name:"Acido Tartarico L(+)", enum:"E334", grade:"Naturale · 99,8%", from:"2,10" },
  { name:"Acido Metatartarico", enum:"E353", grade:"Polvere · 99,5%", from:"6,80" },
  { name:"Bitartrato di Potassio", enum:"E336", grade:"Cremor tartaro · 99,7%", from:"3,40" },
  { name:"Tartrato di Calcio", enum:"—", grade:"Tecnico · 98%", from:"2,95" },
];

const REVIEWS = [
  { who:"Cantina in Toscana", rating:5, date:"2 settimane fa", text:"Acido tartarico naturale di qualità eccellente, consegna puntuale e documentazione completa. Perfetto per la nostra produzione bio." },
  { who:"Cooperativa in Puglia", rating:5, date:"1 mese fa", text:"Ottimo rapporto qualità-prezzo sullo sfuso. Big bag ben confezionati, nessun problema di umidità." },
  { who:"Azienda in Veneto", rating:4, date:"2 mesi fa", text:"Prodotto conforme e CoA sempre allegato. Tempi di consegna leggermente più lunghi in alta stagione, ma nella norma." },
];

function BSIcon({ size = 36, uid = "a" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#0D2137"/><stop offset="100%" stopColor="#0C4A6E"/></linearGradient>
        <linearGradient id={`ar${uid}`} x1="42" y1="12" x2="42" y2="40" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#38BDF8"/><stop offset="100%" stopColor="#22D3EE"/></linearGradient>
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

function Stars({ value, size=14 }) {
  return (
    <span style={{ display:"inline-flex", gap:1 }}>
      {[1,2,3,4,5].map(i => <Star key={i} size={size} fill={i<=Math.round(value)?C.amber:"#E2E8F0"} color={i<=Math.round(value)?C.amber:"#E2E8F0"}/>)}
    </span>
  );
}

export default function SupplierProfile() {
  const [chatOpen, setChatOpen] = useState(false);
  const initials = SUPPLIER.name.split(" ").slice(0,2).map(w=>w[0]).join("");

  return (
    <div style={{ background:C.bg, color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", overflowX:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .bs-num { font-family:'JetBrains Mono',monospace; }
        .bs-btn { background:#0EA5E9; color:#fff; border:none; border-radius:10px; padding:12px 22px; font-size:15px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:8px; font-family:'Inter',system-ui; transition:all 0.2s; }
        .bs-btn:hover { background:#0284C7; }
        .bs-btn-out { background:#fff; color:#0EA5E9; border:1.5px solid #0EA5E9; border-radius:10px; padding:11px 20px; font-size:15px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:8px; font-family:'Inter',system-ui; }
        .bs-card { background:#fff; border:1px solid #E2E8F0; border-radius:14px; padding:22px; }
        .bs-chip { border-radius:6px; padding:4px 10px; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:5px; }
        .bs-prod { display:flex; align-items:center; gap:14px; padding:14px; border:1px solid #E2E8F0; border-radius:12px; transition:all 0.15s; }
        .bs-prod:hover { border-color:#0EA5E9; box-shadow:0 4px 16px rgba(14,165,233,0.08); }
        @media (max-width:860px){ .bs-cols { grid-template-columns:1fr !important; } .bs-head { flex-direction:column !important; align-items:flex-start !important; } .bs-stats { grid-template-columns:repeat(2,1fr) !important; } .bs-nav-links { display:none !important; } }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ position:"sticky", top:0, zIndex:50, background:"rgba(255,255,255,0.96)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 20px", height:64, display:"flex", alignItems:"center", gap:18 }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, flexShrink:0 }}>
            <BSIcon size={34} uid="nav"/>
            <div style={{ display:"flex", alignItems:"baseline" }}>
              <span style={{ fontSize:19, fontWeight:900, letterSpacing:"-0.03em" }}>Bulk</span>
              <span style={{ fontSize:19, fontWeight:900, letterSpacing:"-0.03em", background:"linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>Strike</span>
            </div>
          </div>
          <div style={{ flex:1, display:"flex", justifyContent:"center" }}>
            <div style={{ display:"flex", border:`2px solid ${C.blue}`, borderRadius:10, overflow:"hidden", height:42, width:"100%", maxWidth:460, background:"#fff" }}>
              <input style={{ flex:1, border:"none", padding:"0 14px", fontSize:14, outline:"none", fontFamily:"Inter,system-ui" }} placeholder="Cerca materie prime, fornitori..."/>
              <button style={{ background:C.blue, border:"none", padding:"0 16px", cursor:"pointer" }}><Search size={18} color="#fff"/></button>
            </div>
          </div>
          <div className="bs-nav-links" style={{ display:"flex", gap:18, alignItems:"center" }}>
            {["Pool","Prezzi","Fornitori"].map(l=><span key={l} style={{ fontSize:14, color:C.muted, cursor:"pointer", fontWeight:500 }}>{l}</span>)}
            <button className="bs-btn" style={{ padding:"8px 16px", fontSize:14 }}>Accedi</button>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"20px 20px 60px" }}>

        {/* BREADCRUMB */}
        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.muted, marginBottom:18, flexWrap:"wrap" }}>
          <span>Home</span><ChevronRight size={13}/><span>Fornitori</span><ChevronRight size={13}/>
          <span style={{ color:C.text, fontWeight:600 }}>{SUPPLIER.name}</span>
        </div>

        {/* HEADER CARD */}
        <div className="bs-card" style={{ marginBottom:20 }}>
          <div className="bs-head" style={{ display:"flex", gap:20, alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", gap:18, alignItems:"center" }}>
              <div style={{ width:80, height:80, borderRadius:18, background:"linear-gradient(135deg,#0D2137,#0C4A6E)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, fontWeight:800, flexShrink:0 }}>
                {initials}
              </div>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4, flexWrap:"wrap" }}>
                  <h1 style={{ fontSize:26, fontWeight:800, letterSpacing:"-0.02em" }}>{SUPPLIER.name}</h1>
                  <span style={{ fontSize:20 }}>{SUPPLIER.flag}</span>
                  {SUPPLIER.verified && <span className="bs-chip" style={{ background:"#EFF6FF", color:C.blue }}><BadgeCheck size={14}/> Verificato</span>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:14, fontSize:14, color:C.muted, flexWrap:"wrap" }}>
                  <span style={{ display:"flex", alignItems:"center", gap:5 }}><Stars value={SUPPLIER.rating}/> <b style={{ color:C.text }}>{SUPPLIER.rating}</b> ({SUPPLIER.reviews})</span>
                  <span style={{ display:"flex", alignItems:"center", gap:4 }}><MapPin size={13}/> {SUPPLIER.city}</span>
                </div>
                <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>{SUPPLIER.type}</div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, flexShrink:0 }}>
              <button className="bs-btn"><MessageSquare size={16}/> Richiedi contatto</button>
              <button className="bs-btn-out" style={{ justifyContent:"center" }}>Vedi i prodotti</button>
            </div>
          </div>

          {/* STATS */}
          <div className="bs-stats" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginTop:22, paddingTop:20, borderTop:`1px solid ${C.border}` }}>
            {[
              { icon:<TrendingUp size={16} color={C.blue}/>, val:SUPPLIER.stats.orders, lab:"Ordini completati" },
              { icon:<Truck size={16} color={C.green}/>, val:SUPPLIER.stats.onTime, lab:"Consegne puntuali" },
              { icon:<Clock size={16} color={C.amber}/>, val:SUPPLIER.stats.response, lab:"Tempo di risposta" },
              { icon:<Award size={16} color={C.purple}/>, val:SUPPLIER.stats.years, lab:"Su BulkStrike" },
            ].map((s,i)=>(
              <div key={i} style={{ textAlign:"center" }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:6 }}>{s.icon}</div>
                <div className="bs-num" style={{ fontSize:20, fontWeight:800 }}>{s.val}</div>
                <div style={{ fontSize:12, color:C.muted }}>{s.lab}</div>
              </div>
            ))}
          </div>
        </div>

        {/* TWO COLUMNS */}
        <div className="bs-cols" style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:20, alignItems:"start" }}>

          {/* LEFT */}
          <div>
            {/* ABOUT */}
            <div className="bs-card" style={{ marginBottom:20 }}>
              <div style={{ fontSize:16, fontWeight:700, marginBottom:10 }}>Chi è {SUPPLIER.name}</div>
              <p style={{ fontSize:14, color:C.muted, lineHeight:1.7, marginBottom:16 }}>{SUPPLIER.desc}</p>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {SUPPLIER.certs.map(c=><span key={c} className="bs-chip" style={{ background:"#ECFDF5", color:C.green }}><Check size={12}/> {c}</span>)}
              </div>
            </div>

            {/* PRODUCTS */}
            <div className="bs-card" style={{ marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div style={{ fontSize:16, fontWeight:700 }}>Prodotti su BulkStrike</div>
                <span style={{ fontSize:12, color:C.muted }}>{PRODUCTS.length} prodotti</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {PRODUCTS.map((p,i)=>(
                  <div key={i} className="bs-prod">
                    <div style={{ width:44, height:44, borderRadius:11, background:"#EFF6FF", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <Beaker size={20} color={C.blue}/>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:15, fontWeight:700 }}>{p.name}</span>
                        {p.enum!=="—" && <span className="bs-chip" style={{ background:"#F1F5F9", color:C.muted }}>{p.enum}</span>}
                      </div>
                      <div style={{ fontSize:13, color:C.muted }}>{p.grade}</div>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontSize:11, color:C.muted }}>da</div>
                      <div className="bs-num" style={{ fontSize:16, fontWeight:800, color:C.blue }}>€{p.from}<span style={{ fontSize:11, fontWeight:400, color:C.muted }}>/kg</span></div>
                    </div>
                    <button className="bs-btn-out" style={{ padding:"8px 14px", fontSize:13, flexShrink:0 }}>Vedi <ArrowRight size={13}/></button>
                  </div>
                ))}
              </div>
            </div>

            {/* REVIEWS */}
            <div className="bs-card">
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18, flexWrap:"wrap" }}>
                <div style={{ fontSize:16, fontWeight:700 }}>Recensioni</div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <Stars value={SUPPLIER.rating}/>
                  <span style={{ fontSize:14 }}><b>{SUPPLIER.rating}</b> <span style={{ color:C.muted }}>su {SUPPLIER.reviews} recensioni verificate</span></span>
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                {REVIEWS.map((r,i)=>(
                  <div key={i} style={{ paddingBottom:16, borderBottom:i<REVIEWS.length-1?`1px solid #F1F5F9`:"none" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, flexWrap:"wrap", gap:6 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:14, fontWeight:600 }}>{r.who}</span>
                        <span className="bs-chip" style={{ background:"#ECFDF5", color:C.green, fontSize:11 }}><BadgeCheck size={11}/> Acquisto verificato</span>
                      </div>
                      <span style={{ fontSize:12, color:C.muted }}>{r.date}</span>
                    </div>
                    <Stars value={r.rating} size={13}/>
                    <p style={{ fontSize:14, color:C.muted, lineHeight:1.6, marginTop:6 }}>{r.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT STICKY */}
          <div style={{ position:"sticky", top:80, display:"flex", flexDirection:"column", gap:16 }}>
            <div className="bs-card" style={{ background:"#EFF6FF", borderColor:"#BFDBFE" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <BadgeCheck size={18} color={C.blue}/><span style={{ fontSize:14, fontWeight:700 }}>Fornitore verificato</span>
              </div>
              <p style={{ fontSize:13, color:C.muted, lineHeight:1.6 }}>Identità aziendale, P.IVA e certificazioni controllate dal team BulkStrike (screening sanzioni e AML superato).</p>
            </div>

            <div className="bs-card">
              <div style={{ display:"flex", gap:10, marginBottom:10 }}>
                <Shield size={22} color={C.green} style={{ flexShrink:0 }}/>
                <div>
                  <div style={{ fontSize:14, fontWeight:700 }}>Pagamenti in escrow</div>
                  <div style={{ fontSize:13, color:C.muted, lineHeight:1.5 }}>Il fornitore viene pagato solo dopo la tua conferma di consegna conforme.</div>
                </div>
              </div>
            </div>

            <div className="bs-card" style={{ textAlign:"center" }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Vuoi un preventivo?</div>
              <div style={{ fontSize:13, color:C.muted, marginBottom:12 }}>Acquista direttamente o richiedi una quotazione su misura.</div>
              <button className="bs-btn" style={{ width:"100%" }}><MessageSquare size={15}/> Richiedi contatto</button>
            </div>
          </div>
        </div>
      </div>

      {/* CHATBOT (AI-disclosed) */}
      <div style={{ position:"fixed", bottom:24, right:24, zIndex:1000 }}>
        {chatOpen && (
          <div style={{ position:"absolute", bottom:70, right:0, width:300, background:"#fff", borderRadius:16, border:`1px solid ${C.border}`, boxShadow:"0 20px 60px rgba(0,0,0,0.15)", overflow:"hidden" }}>
            <div style={{ background:C.blue, padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                <Bot size={18} color="#fff"/><div><div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>BulkStrike AI</div><div style={{ fontSize:11, color:"rgba(255,255,255,0.8)" }}>Assistente virtuale AI · ● Online</div></div>
              </div>
              <button onClick={()=>setChatOpen(false)} style={{ background:"none", border:"none", cursor:"pointer" }}><X size={16} color="#fff"/></button>
            </div>
            <div style={{ padding:12 }}>
              <div style={{ background:C.bg, borderRadius:"12px 12px 12px 4px", padding:"10px 12px", fontSize:13, color:C.text, lineHeight:1.5 }}>
                Sono l'assistente virtuale (AI) di BulkStrike, non una persona. Vuoi informazioni sui prodotti di {SUPPLIER.name} o confrontarli con altri fornitori? Per una persona: davide@bulkstrike.com.
              </div>
            </div>
            <div style={{ borderTop:`1px solid ${C.border}` }}>
              <div style={{ padding:"6px 12px 0", fontSize:10, color:C.muted, textAlign:"center" }}>Risposte generate da intelligenza artificiale</div>
              <div style={{ padding:10, display:"flex", gap:8 }}>
                <input placeholder="Scrivi un messaggio..." style={{ flex:1, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px", fontSize:13, outline:"none", fontFamily:"Inter,system-ui" }}/>
                <button style={{ background:C.blue, border:"none", borderRadius:8, width:34, cursor:"pointer", color:"#fff", fontWeight:700 }}>↑</button>
              </div>
            </div>
          </div>
        )}
        <button onClick={()=>setChatOpen(!chatOpen)} style={{ width:56, height:56, borderRadius:"50%", background:C.blue, border:"3px solid #fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 20px rgba(14,165,233,0.4)" }}>
          {chatOpen ? <X size={22} color="#fff"/> : <Bot size={24} color="#fff"/>}
        </button>
      </div>
    </div>
  );
}
