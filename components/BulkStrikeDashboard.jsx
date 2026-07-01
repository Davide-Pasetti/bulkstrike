import { useState, useEffect } from "react";
import {
  getMyCompany, updateCompany,
  getWatchedMaterials, addWatchedMaterial, removeWatchedMaterial, updateMaterialAlert,
  getNotifications, markNotificationRead, markAllNotificationsRead, subscribeNotifications,
} from "@/lib/api";
import { Bell, Search, Plus, TrendingDown, Zap, Factory, Check, X, Gavel, LayoutGrid, Inbox, Clock, Boxes, ChevronRight, Users, Settings, Trophy, Send } from "lucide-react";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", amber:"#D97706", red:"#DC2626", purple:"#7C3AED" };

const SECTORS = ["Enologia / Vino","Alimentare","Chimica","Cosmetica","Farmaceutica","Mangimistica","Altro"];
const SECTOR_PRODUCTS = {
  "Enologia / Vino": ["Acido tartarico L(+)","Acido malico","Acido lattico","Acido citrico","Acido metatartarico","Metabisolfito di potassio","Bentonite","Tannini enologici","Mannoproteine","Gomma arabica","CMC","Lieviti enologici","Bitartrato di potassio","Gas tecnici (N2/CO2/O2)"],
  "Alimentare": ["Acido citrico","Acido lattico","Saccarosio","Maltodestrine","Amido","Pectine","Acido ascorbico"],
  "Chimica": ["Acido solforico","Soda caustica","Acido acetico","Glicerina","Perossido di idrogeno"],
  "Cosmetica": ["Glicerina","Acido ialuronico","Oli vegetali","Vitamina E","Burro di karité"],
  "Farmaceutica": ["Eccipienti","Lattosio farmaceutico","Cellulosa microcristallina","Mannitolo"],
  "Mangimistica": ["Amminoacidi","Carbonato di calcio","Premiscele vitaminiche","Sali minerali"],
  "Altro": [],
};
const ALL_MATERIALS = [...new Set(Object.values(SECTOR_PRODUCTS).flat())];

const ALERT_DEFS = {
  buyer: [
    { k:"pool",     icon:Bell,         label:"Apre un pool",    desc:"Avvisami quando apre un pool per questo articolo — per partecipare" },
    { k:"price",    icon:TrendingDown, label:"Prezzo in calo",  desc:"Avvisami su nuove offerte più basse" },
    { k:"supplier", icon:Factory,      label:"Nuovo fornitore", desc:"Avvisami quando si aggiunge un fornitore certificato" },
  ],
  supplier: [
    { k:"pool",    icon:Bell,   label:"Apre un pool",      desc:"Avvisami quando apre un pool — per fare un'offerta a ribasso" },
    { k:"closing", icon:Clock,  label:"In chiusura (30 min)", desc:"Avvisami 30 minuti prima della chiusura di un pool a cui partecipi" },
    { k:"request", icon:Search, label:"Richiesta cliente", desc:"Avvisami quando un cliente cerca questo prodotto" },
    { k:"outbid",  icon:Zap,    label:"Offerta superata",  desc:"Avvisami se un concorrente offre un prezzo più basso del tuo" },
  ],
};
const DEFAULT_ALERTS = { buyer:{ pool:true, price:false, supplier:false }, supplier:{ pool:true, closing:true, request:false, outbid:false } };

const SEED_MATS = {
  buyer: { "Acido tartarico L(+)":{pool:true,price:true,supplier:false}, "Bentonite":{pool:true,price:false,supplier:true}, "Metabisolfito di potassio":{pool:true,price:false,supplier:false} },
  supplier: { "Acido tartarico L(+)":{pool:true,closing:true,request:true,outbid:true}, "Acido metatartarico":{pool:true,closing:true,request:false,outbid:true}, "Bitartrato di potassio":{pool:true,closing:false,request:true,outbid:false} },
};
const SEED_NOTIFS = {
  buyer: [
    { id:1, type:"pool",     mat:"Acido tartarico L(+)",        text:"È aperto un nuovo pool — miglior prezzo €1,68/kg, può solo scendere", time:"5 min fa", unread:true,  action:"Partecipa" },
    { id:2, type:"price",    mat:"Acido tartarico L(+)",        text:"Prezzo sceso del 6% nel pool attivo: ora €1,62/kg", time:"2 ore fa", unread:true,  action:"Vedi pool" },
    { id:3, type:"supplier", mat:"Bentonite",                   text:"Nuovo fornitore certificato disponibile: Laviosa (IT)", time:"1 giorno fa", unread:false, action:"Vedi" },
    { id:4, type:"pool",     mat:"Metabisolfito di potassio",   text:"Un pool sta per chiudere tra 8 ore", time:"1 giorno fa", unread:false, action:"Partecipa" },
  ],
  supplier: [
    { id:5, type:"closing", mat:"Acido tartarico L(+)",  text:"Un pool a cui partecipi chiude tra 30 min — preparati a difendere o ribassare", time:"ora", unread:true,  action:"Vai al pool" },
    { id:1, type:"pool",    mat:"Acido tartarico L(+)",   text:"Nuovo pool aperto: 9 aziende, 13.800 kg aggregati — fai la tua offerta", time:"12 min fa", unread:true,  action:"Fai un'offerta" },
    { id:2, type:"outbid",  mat:"Acido tartarico L(+)",   text:"Sei stato superato: un concorrente offre €1,62/kg", time:"1 ora fa", unread:true,  action:"Rilancia" },
    { id:3, type:"request", mat:"Bitartrato di potassio", text:"Una cantina cerca questo prodotto (5t)", time:"3 ore fa", unread:false, action:"Rispondi" },
    { id:4, type:"pool",    mat:"Acido metatartarico",    text:"Pool in chiusura tra 6 ore — ultima occasione per offrire", time:"1 giorno fa", unread:false, action:"Fai un'offerta" },
  ],
};
const SEED_POOLS = {
  buyer: [
    { mat:"Acido tartarico L(+)", price:"1,62", companies:9, suppliers:4, closesIn:"3g 11h", status:{ label:"Stai partecipando · 8t", tone:C.blue } },
    { mat:"Bentonite",            price:"0,94", companies:5, suppliers:3, closesIn:"1g 4h",  status:{ label:"Stai partecipando · 3t", tone:C.blue } },
  ],
  supplier: [
    { mat:"Acido tartarico L(+)",  price:"1,62", companies:9, suppliers:4, closesIn:"3g 11h", status:{ label:"Sei stato superato", tone:C.red } },
    { mat:"Bitartrato di potassio",price:"3,10", companies:4, suppliers:2, closesIn:"2g 2h",  status:{ label:"Sei in testa", tone:C.green } },
  ],
};

const NOTIF_STYLE = {
  pool:     { icon:Bell,         color:C.purple, bg:"#F5F0FF" },
  closing:  { icon:Clock,        color:C.amber,  bg:"#FFF7ED" },
  price:    { icon:TrendingDown, color:C.green,  bg:"#ECFDF5" },
  supplier: { icon:Factory,      color:C.blue,   bg:"#EFF6FF" },
  request:  { icon:Search,       color:C.blue,   bg:"#EFF6FF" },
  outbid:   { icon:Zap,          color:C.red,    bg:"#FEF2F2" },
};

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

const chipStyle = (on) => ({ padding:"7px 13px", borderRadius:100, border:`1.5px solid ${on?C.blue:C.border}`, background:on?"#EFF6FF":"#fff", color:on?C.blue:C.muted, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui", display:"flex", alignItems:"center", gap:5 });

function Countdown({ from, tone=C.amber, big }) {
  const [s, setS] = useState(from);
  useEffect(() => { const t=setInterval(()=>setS(x=>x>0?x-1:0),1000); return ()=>clearInterval(t); }, []);
  const mm=String(Math.floor(s/60)).padStart(2,"0"), ss=String(s%60).padStart(2,"0");
  return <span className="bs-num" style={{ color:s>0?tone:C.muted, fontWeight:800, fontSize:big?20:14 }}>{mm}:{ss}</span>;
}

function AField({ label, v, on, full }) {
  return (
    <div style={{ marginBottom:16, ...(full?{gridColumn:"1 / -1"}:{}) }}>
      <label style={{ display:"block", fontSize:13, fontWeight:600, marginBottom:6 }}>{label}</label>
      <input value={v} onChange={e=>on(e.target.value)} style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:9, padding:"11px 13px", fontSize:14, outline:"none", fontFamily:"Inter,system-ui", color:C.text }}/>
    </div>
  );
}

function relTime(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return "ora";
  if (s < 3600) return `${Math.floor(s / 60)} min fa`;
  if (s < 86400) return `${Math.floor(s / 3600)} ore fa`;
  return `${Math.floor(s / 86400)} giorni fa`;
}
function toUiNotif(r) {
  return {
    id: r.id,
    type: ({ pool_open:"pool", pool_closing:"closing", new_supplier:"supplier", price_drop:"price" })[r.type] || r.type,
    mat: r.title || "",
    text: r.body,
    time: relTime(r.created_at),
    unread: !r.is_read,
    action: r.action_label,
  };
}

function NotifRow({ n, onRead, compact }) {
  const st = NOTIF_STYLE[n.type] || NOTIF_STYLE.pool; const Ico = st.icon;
  return (
    <div style={{ display:"flex", gap:12, padding:compact?"12px 0":"14px 16px", borderRadius:compact?0:12, background:n.unread&&!compact?"#FBFCFE":"transparent", border:compact?"none":`1px solid ${n.unread?"#DBEAFE":C.border}`, alignItems:"flex-start" }}>
      <div style={{ width:36, height:36, borderRadius:10, background:st.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Ico size={17} color={st.color}/></div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:2, flexWrap:"wrap" }}>
          <span style={{ fontSize:13, fontWeight:700 }}>{n.mat}</span>
          {n.unread && <span style={{ width:7, height:7, borderRadius:"50%", background:C.blue }}/>}
          <span style={{ marginLeft:"auto", fontSize:11, color:C.muted }}>{n.time}</span>
        </div>
        <div style={{ fontSize:13, color:C.muted, lineHeight:1.5, marginBottom:8 }}>{n.text}</div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button style={{ background:C.blue, color:"#fff", border:"none", borderRadius:7, padding:"6px 13px", fontSize:12.5, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui", display:"flex", alignItems:"center", gap:5 }}>{n.action} <ChevronRight size={13}/></button>
          {n.unread && <button onClick={()=>onRead(n.id)} style={{ background:"none", border:"none", color:C.muted, fontSize:12, cursor:"pointer", fontFamily:"Inter,system-ui" }}>segna come letto</button>}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [role, setRole] = useState("buyer");
  const [section, setSection] = useState("overview");
  const [mats, setMats] = useState(SEED_MATS);
  const [notifs, setNotifs] = useState(SEED_NOTIFS);
  const [q, setQ] = useState("");
  const [company, setCompany] = useState(null);
  const [acctSaved, setAcctSaved] = useState(false);

  // account form (demo, example values — non dati reali)
  const [acct, setAcct] = useState({
    company:"Cantina Pasetti", vat:"IT01234567890", country:"Italia", city:"Francavilla al Mare (CH)", address:"Via Esempio 1", phone:"+39 085 000000", website:"www.esempio.it", contact:"Nome Cognome",
    emailMgmt:"acquisti@esempio.it", emailAdmin:"amministrazione@esempio.it", pec:"azienda@pec.esempio.it", sdi:"XXXXXXX",
    ibanHolder:"Cantina Pasetti", iban:"IT00 X000 0000 0000 0000 0000 000", bic:"XXXXXXXX",
    chEmail:true, chSms:false, chPush:true,
  });
  const setA = (k,v) => setAcct(s => ({ ...s, [k]:v }));

  // final phase (post-close counter-offer) demo
  const [finalView, setFinalView] = useState("challenger");
  const [chSent, setChSent] = useState(false);
  const [chPrice, setChPrice] = useState("");
  const [wIncoming, setWIncoming] = useState(false);
  const [wResponded, setWResponded] = useState(false);
  const [wPrice, setWPrice] = useState("");

  const cur = mats[role];
  const curNotifs = notifs[role];
  const defs = ALERT_DEFS[role];
  const pools = SEED_POOLS[role];
  const unread = curNotifs.filter(n=>n.unread).length;
  const activeAlerts = Object.values(cur).reduce((sum,a)=>sum+Object.values(a).filter(Boolean).length,0);

  const setMatsRole = (obj) => setMats(m => ({ ...m, [role]:obj }));
  const ALERT_COL = { pool:"alert_pool", price:"alert_price", supplier:"alert_new_supplier", closing:"alert_closing", request:"alert_request", outbid:"alert_outbid" };
  const addMat = (mt) => {
    if (cur[mt]) return;
    setMatsRole({ ...cur, [mt]:{ ...DEFAULT_ALERTS[role] } });
    addWatchedMaterial({ name: mt }, DEFAULT_ALERTS[role])
      .then(row => setMats(m => ({ ...m, [role]: { ...m[role], [mt]: { ...m[role][mt], _id: row.id, _pid: row.product_id } } })))
      .catch(()=>{});
  };
  const removeMat = (mt) => {
    const id = cur[mt]?._id;
    const c={...cur}; delete c[mt]; setMatsRole(c);
    if (id) removeWatchedMaterial(id).catch(()=>{});
  };
  const toggleMat = (mt) => cur[mt] ? removeMat(mt) : addMat(mt);
  const toggleAlert = (mt,k) => {
    const next = !cur[mt][k];
    setMatsRole({ ...cur, [mt]:{ ...cur[mt], [k]:next } });
    if (cur[mt]._id) updateMaterialAlert(cur[mt]._id, ALERT_COL[k], next).catch(()=>{});
  };
  const markRead = (id) => {
    setNotifs(n => ({ ...n, [role]: n[role].map(x=>x.id===id?{...x,unread:false}:x) }));
    markNotificationRead(id).catch(()=>{});
  };
  const markAll = () => {
    setNotifs(n => ({ ...n, [role]: n[role].map(x=>({...x,unread:false})) }));
    markAllNotificationsRead().catch(()=>{});
  };

  // ── load the real company (drives role + account prefill) ──
  useEffect(() => {
    getMyCompany().then(c => {
      if (!c) return;
      setCompany(c);
      setRole(c.is_supplier ? "supplier" : "buyer");
      setAcct(a => ({
        ...a,
        company:c.legal_name||"", vat:c.vat||"", country:c.country||"", city:c.city||"",
        address:c.address||"", phone:c.phone||"", website:c.website||"", contact:c.contact_name||"",
        emailMgmt:c.email_mgmt||"", emailAdmin:c.email_admin||"", pec:c.pec||"", sdi:c.sdi||"",
        ibanHolder:c.iban_holder||"", iban:c.iban||"", bic:c.bic||"",
      }));
    }).catch(()=>{});
  }, []);

  // ── load watched materials + notifications for the current role ──
  useEffect(() => {
    if (!company) return;
    getWatchedMaterials().then(rows => {
      const obj = {};
      for (const r of rows) {
        obj[r.name] = role === "buyer"
          ? { pool:r.alert_pool, price:r.alert_price, supplier:r.alert_new_supplier, _id:r.id, _pid:r.product_id }
          : { pool:r.alert_pool, closing:r.alert_closing, request:r.alert_request, outbid:r.alert_outbid, _id:r.id, _pid:r.product_id };
      }
      setMats(m => ({ ...m, [role]: obj }));
    }).catch(()=>{});
    getNotifications().then(rows => {
      setNotifs(n => ({ ...n, [role]: rows.map(toUiNotif) }));
    }).catch(()=>{});
  }, [company, role]);

  // ── realtime: new notifications arrive without reload ──
  useEffect(() => {
    if (!company) return;
    const unsub = subscribeNotifications(company.id, (row) => {
      setNotifs(n => ({ ...n, [role]: [toUiNotif(row), ...n[role]] }));
    });
    return unsub;
  }, [company, role]);

  // ── persist account changes to the company ──
  async function saveAccount() {
    await updateCompany({
      legal_name: acct.company, vat: acct.vat, country: acct.country, city: acct.city,
      address: acct.address, phone: acct.phone, website: acct.website, contact_name: acct.contact,
      email_mgmt: acct.emailMgmt, email_admin: acct.emailAdmin, pec: acct.pec, sdi: acct.sdi,
      iban_holder: acct.ibanHolder, iban: acct.iban, bic: acct.bic,
    });
    setAcctSaved(true);
    setTimeout(() => setAcctSaved(false), 2500);
  }

  const query = q.trim().toLowerCase();
  const searchHits = query ? ALL_MATERIALS.filter(m=>m.toLowerCase().includes(query)) : [];
  const exact = query && ALL_MATERIALS.some(m=>m.toLowerCase()===query);

  const NAV = [
    { id:"overview", label:"Panoramica", icon:LayoutGrid },
    { id:"alerts",   label:"Avvisi & materie prime", icon:Bell },
    { id:"pools",    label:"Pool attivi", icon:Gavel },
    { id:"notifs",   label:"Notifiche", icon:Inbox },
  ];

  return (
    <div style={{ background:C.bg, color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .bs-num { font-family:'JetBrains Mono',monospace; }
        input:focus { border-color:#0EA5E9 !important; }
        .bs-card { background:#fff; border:1px solid #E2E8F0; border-radius:14px; }
        .bs-nav { display:flex; align-items:center; gap:11px; padding:10px 12px; border-radius:10px; cursor:pointer; font-size:14px; font-weight:600; font-family:'Inter',system-ui; transition:all 0.15s; }
        @media (max-width:820px){ .bs-shell { grid-template-columns:1fr !important; } .bs-side { position:static !important; flex-direction:row !important; overflow-x:auto; } .bs-side .bs-nav span { display:none; } .bs-stats4 { grid-template-columns:repeat(2,1fr) !important; } .bs-2col { grid-template-columns:1fr !important; } .bs-form2 { grid-template-columns:1fr !important; } }
      `}</style>

      {/* HEADER */}
      <header style={{ background:"#fff", borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, zIndex:50 }}>
        <div style={{ maxWidth:1180, margin:"0 auto", padding:"0 20px", height:62, display:"flex", alignItems:"center", gap:16 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display:"flex", alignItems:"center", gap:9, cursor:"pointer" }}>
            <BSIcon size={32} uid="nav"/>
            <div style={{ display:"flex", alignItems:"baseline" }}>
              <span style={{ fontSize:18, fontWeight:900, letterSpacing:"-0.03em" }}>Bulk</span>
              <span style={{ fontSize:18, fontWeight:900, letterSpacing:"-0.03em", background:"linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>Strike</span>
            </div>
          </div>

          {/* role toggle (demo only — hidden once the real company loads) */}
          {!company ? (
            <div style={{ marginLeft:"auto", display:"flex", background:C.bg, border:`1px solid ${C.border}`, borderRadius:9, padding:3 }}>
              {[["buyer","Acquirente"],["supplier","Fornitore"]].map(([id,lab])=>(
                <button key={id} onClick={()=>setRole(id)} style={{ padding:"6px 14px", borderRadius:7, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"Inter,system-ui", background:role===id?"#fff":"transparent", color:role===id?C.blue:C.muted, boxShadow:role===id?"0 1px 3px rgba(0,0,0,0.08)":"none" }}>{lab}</button>
              ))}
            </div>
          ) : <div style={{ marginLeft:"auto" }}/>}

          {/* bell */}
          <button onClick={()=>setSection("notifs")} style={{ position:"relative", width:40, height:40, borderRadius:10, border:`1px solid ${C.border}`, background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Bell size={18} color={C.text}/>
            {unread>0 && <span style={{ position:"absolute", top:-5, right:-5, minWidth:18, height:18, padding:"0 4px", borderRadius:9, background:C.red, color:"#fff", fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", border:"2px solid #fff" }}>{unread}</span>}
          </button>

          {/* avatar */}
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"linear-gradient(135deg,#0D2137,#0C4A6E)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800 }}>CP</div>
          </div>
        </div>
      </header>

      <div className="bs-shell" style={{ maxWidth:1180, margin:"0 auto", padding:"22px 20px 60px", display:"grid", gridTemplateColumns:"230px 1fr", gap:22, alignItems:"start" }}>
        {/* SIDEBAR */}
        <aside className="bs-side" style={{ position:"sticky", top:84, display:"flex", flexDirection:"column", gap:4 }}>
          {NAV.map(n=>{
            const on=section===n.id; const Ico=n.icon;
            return (
              <div key={n.id} className="bs-nav" onClick={()=>setSection(n.id)} style={{ background:on?"#EFF6FF":"transparent", color:on?C.blue:C.muted }}>
                <Ico size={18}/><span>{n.label}</span>
                {n.id==="notifs" && unread>0 && <span style={{ marginLeft:"auto", minWidth:18, height:18, padding:"0 5px", borderRadius:9, background:C.red, color:"#fff", fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{unread}</span>}
              </div>
            );
          })}
          <div className="bs-nav" onClick={()=>setSection("account")} style={{ background:section==="account"?"#EFF6FF":"transparent", color:section==="account"?C.blue:C.muted }}><Settings size={18}/><span>Account</span></div>
        </aside>

        {/* MAIN */}
        <main>
          {/* ===== OVERVIEW ===== */}
          {section==="overview" && (
            <>
              <h1 style={{ fontSize:23, fontWeight:800, marginBottom:4 }}>Ciao, Cantina Pasetti 👋</h1>
              <p style={{ fontSize:14, color:C.muted, marginBottom:20 }}>{role==="buyer"?"Ecco cosa si muove sulle materie prime che segui.":"Ecco le opportunità sui prodotti che vendi."}</p>

              <div className="bs-stats4" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:22 }}>
                {[
                  { icon:Boxes, color:C.blue,   val:Object.keys(cur).length, lab:"Materie monitorate" },
                  { icon:Bell,  color:C.purple, val:activeAlerts, lab:"Avvisi attivi" },
                  { icon:Gavel, color:C.amber,  val:pools.length, lab:"Pool in corso" },
                  { icon:Inbox, color:C.red,    val:unread, lab:"Notifiche non lette" },
                ].map((s,i)=>{ const Ico=s.icon; return (
                  <div key={i} className="bs-card" style={{ padding:16 }}>
                    <div style={{ width:34, height:34, borderRadius:9, background:`${s.color}14`, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:10 }}><Ico size={17} color={s.color}/></div>
                    <div className="bs-num" style={{ fontSize:24, fontWeight:800 }}>{s.val}</div>
                    <div style={{ fontSize:12.5, color:C.muted }}>{s.lab}</div>
                  </div>
                );})}
              </div>

              <div className="bs-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
                {/* recent notifications */}
                <div className="bs-card" style={{ padding:18 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                    <div style={{ fontSize:15, fontWeight:700 }}>Notifiche recenti</div>
                    <button onClick={()=>setSection("notifs")} style={{ background:"none", border:"none", color:C.blue, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Vedi tutte</button>
                  </div>
                  <div>{curNotifs.slice(0,3).map((n,i)=>(
                    <div key={n.id} style={{ borderBottom:i<2?`1px solid #F1F5F9`:"none" }}><NotifRow n={n} onRead={markRead} compact/></div>
                  ))}</div>
                </div>

                {/* active pools */}
                <div className="bs-card" style={{ padding:18 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                    <div style={{ fontSize:15, fontWeight:700 }}>Pool attivi</div>
                    <button onClick={()=>setSection("pools")} style={{ background:"none", border:"none", color:C.blue, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Gestisci</button>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {pools.map((p,i)=>(
                      <div key={i} style={{ border:`1px solid ${C.border}`, borderRadius:11, padding:"12px 14px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                          <span style={{ fontSize:13.5, fontWeight:700 }}>{p.mat}</span>
                          <span style={{ fontSize:11, color:C.muted, display:"flex", alignItems:"center", gap:3 }}><Clock size={11}/> {p.closesIn}</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <span className="bs-num" style={{ fontSize:16, fontWeight:800, color:C.purple }}>€{p.price}<span style={{ fontSize:10, color:C.muted, fontWeight:400 }}>/kg</span></span>
                          <span style={{ fontSize:11.5, fontWeight:700, color:p.status.tone, background:`${p.status.tone}14`, padding:"3px 8px", borderRadius:6 }}>{p.status.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ===== ALERTS & MATERIALS ===== */}
          {section==="alerts" && (
            <>
              <h1 style={{ fontSize:23, fontWeight:800, marginBottom:4 }}>Avvisi & materie prime</h1>
              <p style={{ fontSize:14, color:C.muted, marginBottom:20 }}>Le materie prime che segui e gli avvisi che vuoi ricevere. {role==="buyer"?"Gli avvisi ti fanno cogliere i pool e i cali di prezzo.":"Gli avvisi ti segnalano dove puoi offrire e competere."}</p>

              {/* ADD */}
              <div className="bs-card" style={{ padding:18, marginBottom:18 }}>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Aggiungi una materia prima</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
                  {SECTORS.filter(s=>SECTOR_PRODUCTS[s].length).map(s=>(
                    <details key={s} style={{ width:"100%" }}>
                      <summary style={{ cursor:"pointer", fontSize:12.5, fontWeight:700, color:C.muted, marginBottom:8, listStyle:"none", display:"flex", alignItems:"center", gap:6 }}><ChevronRight size={13}/> {s}</summary>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:8, padding:"4px 0 12px 18px" }}>
                        {SECTOR_PRODUCTS[s].map(m=>{ const on=!!cur[m]; return <button key={m} onClick={()=>toggleMat(m)} style={chipStyle(on)}>{on&&<Check size={13}/>}{m}</button>; })}
                      </div>
                    </details>
                  ))}
                </div>
                <div style={{ position:"relative", marginBottom:query?12:0 }}>
                  <Search size={15} color={C.muted} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)" }}/>
                  <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cerca o aggiungi una materia prima, anche fuori dai tuoi settori..." style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:9, padding:"11px 13px 11px 36px", fontSize:14, outline:"none", fontFamily:"Inter,system-ui" }}/>
                </div>
                {query && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {searchHits.map(m=>{ const on=!!cur[m]; return <button key={m} onClick={()=>toggleMat(m)} style={chipStyle(on)}>{on&&<Check size={13}/>}{m}</button>; })}
                    {!exact && <button onClick={()=>{ addMat(q.trim()); setQ(""); }} style={{ padding:"7px 13px", borderRadius:100, border:`1.5px dashed ${C.blue}`, background:"#fff", color:C.blue, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui", display:"flex", alignItems:"center", gap:5 }}><Plus size={14}/> Aggiungi “{q.trim()}”</button>}
                  </div>
                )}
              </div>

              {/* MANAGE LIST */}
              <div className="bs-card" style={{ overflow:"hidden" }}>
                <div style={{ background:"#FBFCFE", padding:"13px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:8 }}>
                  <Bell size={15} color={C.blue}/><span style={{ fontSize:13.5, fontWeight:700 }}>Materie monitorate · {Object.keys(cur).length}</span>
                  <span style={{ fontSize:12, color:C.muted }}>attiva/disattiva gli avvisi per ciascuna</span>
                </div>
                {Object.keys(cur).length===0 ? (
                  <div style={{ padding:30, textAlign:"center", color:C.muted, fontSize:14 }}>Nessuna materia prima monitorata. Aggiungine una qui sopra.</div>
                ) : Object.keys(cur).map((m,i,arr)=>(
                  <div key={m} style={{ padding:"14px 16px", borderBottom:i<arr.length-1?`1px solid #F1F5F9`:"none" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                      <span style={{ fontSize:14, fontWeight:700 }}>{m}</span>
                      <button onClick={()=>removeMat(m)} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted, display:"flex", alignItems:"center", gap:4, fontSize:12, fontFamily:"Inter,system-ui" }}><X size={13}/> rimuovi</button>
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                      {defs.map(d=>{ const on=cur[m][d.k]; const Ico=d.icon; return (
                        <button key={d.k} onClick={()=>toggleAlert(m,d.k)} title={d.desc} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 11px", borderRadius:8, cursor:"pointer", fontFamily:"Inter,system-ui", fontSize:12.5, fontWeight:600, border:`1.5px solid ${on?C.blue:C.border}`, background:on?"#EFF6FF":"#fff", color:on?C.blue:C.muted }}>
                          <Ico size={14}/> {d.label} {on && <Check size={12}/>}
                        </button>
                      );})}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ===== POOLS ===== */}
          {section==="pools" && (
            <>
              <h1 style={{ fontSize:23, fontWeight:800, marginBottom:4 }}>Pool attivi</h1>
              <p style={{ fontSize:14, color:C.muted, marginBottom:20 }}>{role==="buyer"?"I pool a cui stai partecipando. Il prezzo può solo scendere fino alla chiusura.":"I pool in cui stai competendo. Rilancia per restare il più conveniente."}</p>

              {/* FINAL PHASE — post-close counter-offers (supplier only) */}
              {role==="supplier" && (
                <div className="bs-card" style={{ marginBottom:18, borderColor:`${C.purple}55`, overflow:"hidden" }}>
                  <div style={{ background:"linear-gradient(135deg,#F5F0FF,#EDE4F7)", padding:"14px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                    <Gavel size={18} color={C.purple}/>
                    <span style={{ fontSize:15, fontWeight:800 }}>Fase finale · contro-offerte</span>
                    <span style={{ fontSize:12, color:C.purple, background:"#fff", borderRadius:100, padding:"3px 10px", fontWeight:700 }}>Acido tartarico L(+)</span>
                    <div style={{ marginLeft:"auto", display:"flex", background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:2 }}>
                      {[["challenger","Sfidante"],["winner","Vincitore"]].map(([id,lab])=>(
                        <button key={id} onClick={()=>setFinalView(id)} style={{ padding:"5px 11px", borderRadius:6, border:"none", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"Inter,system-ui", background:finalView===id?"#F5F0FF":"transparent", color:finalView===id?C.purple:C.muted }}>{lab}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:18 }}>
                    <div style={{ fontSize:12.5, color:C.muted, lineHeight:1.6, marginBottom:16, background:C.bg, borderRadius:10, padding:"12px 14px" }}>
                      Il pool è chiuso. Per <b style={{color:C.text}}>5 minuti</b> chi ha perso può fare <b style={{color:C.text}}>una sola</b> contro-offerta a ribasso. Per ogni contro-offerta, il vincitore ha <b style={{color:C.text}}>5 minuti</b> (dal momento della contro-offerta) per rispondere <b style={{color:C.text}}>una sola volta</b> e restare vincitore. Nel caso peggiore il pool si chiude dopo <b style={{color:C.text}}>10 minuti</b>.
                    </div>

                    {finalView==="challenger" ? (
                      <div>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                          <div style={{ fontSize:14 }}>Hai partecipato ma <b style={{color:C.red}}>non hai vinto</b>. Prezzo vincente: <b className="bs-num">€1,62/kg</b></div>
                          <div style={{ fontSize:12, color:C.muted, display:"flex", alignItems:"center", gap:6 }}>Finestra contro-offerta: <Countdown from={300}/></div>
                        </div>
                        {!chSent ? (
                          <div style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:16 }}>
                            <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>La tua unica contro-offerta</div>
                            <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                              <div style={{ position:"relative" }}>
                                <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, color:C.muted }}>€</span>
                                <input value={chPrice} onChange={e=>setChPrice(e.target.value)} placeholder="1,58" style={{ width:140, border:`1px solid ${C.border}`, borderRadius:9, padding:"11px 13px 11px 26px", fontSize:14, outline:"none", fontFamily:"'JetBrains Mono',monospace" }}/>
                              </div>
                              <span style={{ fontSize:12, color:C.muted }}>/kg · sotto €1,62</span>
                              <button onClick={()=>setChSent(true)} style={{ background:C.purple, color:"#fff", border:"none", borderRadius:9, padding:"11px 18px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui", display:"inline-flex", alignItems:"center", gap:7 }}><Send size={15}/> Invia (1 sola volta)</button>
                            </div>
                            <div style={{ fontSize:11.5, color:C.amber, marginTop:10, display:"flex", gap:6, alignItems:"center" }}><Zap size={13}/> Hai un solo tentativo: una volta inviata non potrai modificarla.</div>
                          </div>
                        ) : (
                          <div style={{ border:`1px solid ${C.green}44`, background:"#ECFDF5", borderRadius:12, padding:16 }}>
                            <div style={{ fontSize:14, fontWeight:700, color:"#065F46", marginBottom:8, display:"flex", alignItems:"center", gap:7 }}><Check size={16}/> Contro-offerta inviata a €{chPrice||"1,58"}/kg</div>
                            <div style={{ fontSize:13, color:"#065F46", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>Il vincitore ha 5 minuti per rispondere: <Countdown from={300} tone={C.green}/></div>
                            <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>Se non risponde con un prezzo più basso, <b>vinci tu</b>.</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                          <Trophy size={18} color={C.amber}/><span style={{ fontSize:14 }}>Hai <b style={{color:C.green}}>vinto</b> il pool a <b className="bs-num">€1,62/kg</b></span>
                        </div>
                        {!wIncoming ? (
                          <div style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:16, textAlign:"center" }}>
                            <div style={{ fontSize:13, color:C.muted, marginBottom:6, display:"flex", justifyContent:"center", alignItems:"center", gap:6 }}>Finestra contro-offerte: <Countdown from={300}/></div>
                            <div style={{ fontSize:13, marginBottom:12 }}>Nessuna contro-offerta per ora. Se uno sfidante ribassa, avrai 5 minuti per rispondere una sola volta.</div>
                            <button onClick={()=>setWIncoming(true)} style={{ background:"#fff", color:C.purple, border:`1.5px solid ${C.purple}`, borderRadius:9, padding:"9px 16px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui" }}>[Demo] Simula una contro-offerta in arrivo</button>
                          </div>
                        ) : !wResponded ? (
                          <div style={{ border:`1px solid ${C.red}44`, background:"#FEF2F2", borderRadius:12, padding:16 }}>
                            <div style={{ fontSize:14, fontWeight:700, color:"#991B1B", marginBottom:8, display:"flex", alignItems:"center", gap:7 }}><Zap size={16}/> Contro-offerta ricevuta: uno sfidante offre €1,58/kg</div>
                            <div style={{ fontSize:13, color:"#991B1B", marginBottom:12, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>Hai 5 minuti per rispondere (1 sola volta): <Countdown from={300} tone={C.red}/></div>
                            <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                              <div style={{ position:"relative" }}>
                                <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, color:C.muted }}>€</span>
                                <input value={wPrice} onChange={e=>setWPrice(e.target.value)} placeholder="1,55" style={{ width:140, border:`1px solid ${C.border}`, borderRadius:9, padding:"11px 13px 11px 26px", fontSize:14, outline:"none", fontFamily:"'JetBrains Mono',monospace" }}/>
                              </div>
                              <span style={{ fontSize:12, color:C.muted }}>/kg · sotto €1,58</span>
                              <button onClick={()=>setWResponded(true)} style={{ background:C.purple, color:"#fff", border:"none", borderRadius:9, padding:"11px 18px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui", display:"inline-flex", alignItems:"center", gap:7 }}><Send size={15}/> Rispondi (1 sola volta)</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ border:`1px solid ${C.green}44`, background:"#ECFDF5", borderRadius:12, padding:16 }}>
                            <div style={{ fontSize:14, fontWeight:700, color:"#065F46", display:"flex", alignItems:"center", gap:7 }}><Trophy size={16}/> Hai risposto a €{wPrice||"1,55"}/kg — hai vinto definitivamente questo confronto.</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {pools.map((p,i)=>(
                  <div key={i} className="bs-card" style={{ padding:18 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                      <div>
                        <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>{p.mat}</div>
                        <span style={{ fontSize:12, fontWeight:700, color:p.status.tone, background:`${p.status.tone}14`, padding:"3px 9px", borderRadius:6 }}>{p.status.label}</span>
                      </div>
                      <span style={{ fontSize:12, color:C.muted, display:"flex", alignItems:"center", gap:4 }}><Clock size={12}/> chiude tra {p.closesIn}</span>
                    </div>
                    <div style={{ display:"flex", gap:24, flexWrap:"wrap", marginBottom:16 }}>
                      <div><div style={{ fontSize:11, color:C.muted }}>Miglior prezzo ora</div><div className="bs-num" style={{ fontSize:18, fontWeight:800, color:C.purple }}>€{p.price}/kg</div></div>
                      <div><div style={{ fontSize:11, color:C.muted }}>Aziende aggregate</div><div className="bs-num" style={{ fontSize:18, fontWeight:800 }}>{p.companies}</div></div>
                      <div><div style={{ fontSize:11, color:C.muted }}>Fornitori in gara</div><div className="bs-num" style={{ fontSize:18, fontWeight:800 }}>{p.suppliers}</div></div>
                    </div>
                    <button style={{ background:C.purple, color:"#fff", border:"none", borderRadius:9, padding:"10px 18px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui", display:"inline-flex", alignItems:"center", gap:7 }}>
                      {role==="buyer" ? <>Vai al pool <ChevronRight size={15}/></> : <><Zap size={15}/> Rilancia offerta</>}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ===== NOTIFICATIONS ===== */}
          {section==="notifs" && (
            <>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6, flexWrap:"wrap", gap:8 }}>
                <h1 style={{ fontSize:23, fontWeight:800 }}>Notifiche</h1>
                {unread>0 && <button onClick={markAll} style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui", color:C.muted }}>Segna tutte come lette</button>}
              </div>
              <p style={{ fontSize:14, color:C.muted, marginBottom:20 }}>Gli avvisi generati dalle tue materie prime monitorate.</p>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {curNotifs.map(n=><NotifRow key={n.id} n={n} onRead={markRead}/>)}
              </div>
            </>
          )}

          {/* ===== ACCOUNT ===== */}
          {section==="account" && (
            <>
              <h1 style={{ fontSize:23, fontWeight:800, marginBottom:4 }}>Account</h1>
              <p style={{ fontSize:14, color:C.muted, marginBottom:20 }}>Dati aziendali, contatti per la fatturazione e preferenze di notifica.</p>

              <div className="bs-card" style={{ padding:20, marginBottom:18 }}>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:14 }}>Dati dell'azienda</div>
                <div className="bs-form2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
                  <AField label="Ragione sociale" v={acct.company} on={v=>setA("company",v)} full/>
                  <AField label="P.IVA / VAT" v={acct.vat} on={v=>setA("vat",v)}/>
                  <AField label="Paese" v={acct.country} on={v=>setA("country",v)}/>
                  <AField label="Città" v={acct.city} on={v=>setA("city",v)}/>
                  <AField label="Indirizzo" v={acct.address} on={v=>setA("address",v)}/>
                  <AField label="Telefono" v={acct.phone} on={v=>setA("phone",v)}/>
                  <AField label="Sito web" v={acct.website} on={v=>setA("website",v)}/>
                  <AField label="Persona di riferimento" v={acct.contact} on={v=>setA("contact",v)} full/>
                </div>
              </div>

              <div className="bs-card" style={{ padding:20, marginBottom:18 }}>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>Contatti e fatturazione</div>
                <div style={{ fontSize:12.5, color:C.muted, marginBottom:14 }}>Dove ricevi comunicazioni e documenti fiscali</div>
                <div className="bs-form2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
                  <AField label={role==="supplier"?"Email gestione clienti / ordini":"Email gestione acquisti"} v={acct.emailMgmt} on={v=>setA("emailMgmt",v)}/>
                  <AField label="Email amministrazione (documenti)" v={acct.emailAdmin} on={v=>setA("emailAdmin",v)}/>
                  <AField label="PEC" v={acct.pec} on={v=>setA("pec",v)}/>
                  <AField label="Codice Destinatario (SDI)" v={acct.sdi} on={v=>setA("sdi",v)}/>
                </div>
              </div>

              {role==="supplier" && (
                <div className="bs-card" style={{ padding:20, marginBottom:18 }}>
                  <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>Coordinate bancarie (incassi)</div>
                  <div style={{ fontSize:12.5, color:C.muted, marginBottom:14 }}>Dove ricevi i pagamenti rilasciati dall'escrow</div>
                  <div className="bs-form2" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }}>
                    <AField label="Intestatario del conto" v={acct.ibanHolder} on={v=>setA("ibanHolder",v)} full/>
                    <AField label="IBAN" v={acct.iban} on={v=>setA("iban",v)}/>
                    <AField label="BIC / SWIFT" v={acct.bic} on={v=>setA("bic",v)}/>
                  </div>
                </div>
              )}

              <div className="bs-card" style={{ padding:20, marginBottom:18 }}>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>Come ricevere gli avvisi</div>
                <div style={{ fontSize:12.5, color:C.muted, marginBottom:8 }}>Canali per le notifiche delle tue materie prime monitorate</div>
                {[["chEmail","Email","Avvisi via email"],["chSms","SMS","Avvisi urgenti via SMS"],["chPush","Push","Notifiche nell'app"]].map(([k,t,d],i,arr)=>(
                  <div key={k} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 0", borderBottom:i<arr.length-1?`1px solid #F1F5F9`:"none" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600 }}>{t}</div>
                      <div style={{ fontSize:12, color:C.muted }}>{d}</div>
                    </div>
                    <button onClick={()=>setA(k,!acct[k])} style={{ width:42, height:24, borderRadius:100, border:"none", cursor:"pointer", padding:2, background:acct[k]?C.blue:"#CBD5E1" }}>
                      <div style={{ width:20, height:20, borderRadius:"50%", background:"#fff", transform:acct[k]?"translateX(18px)":"translateX(0)", transition:"transform 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                <button onClick={saveAccount} style={{ background:C.blue, color:"#fff", border:"none", borderRadius:10, padding:"12px 22px", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Salva modifiche</button>
                <button style={{ background:"#fff", color:C.muted, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 20px", fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Annulla</button>
                {acctSaved && <span style={{ color:C.green, fontSize:14, fontWeight:600, display:"flex", alignItems:"center", gap:5 }}><Check size={16}/> Salvato</span>}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
