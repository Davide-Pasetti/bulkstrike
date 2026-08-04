import { useState, useEffect } from "react";
import {
  getMyCompany, updateCompany, signOut, requestAccountDeletionCode, confirmAccountDeletion,
  getWatchedMaterials, addWatchedMaterial, removeWatchedMaterial, updateMaterialAlert,
  getNotifications, markNotificationRead, markAllNotificationsRead, subscribeNotifications,
  getMyPools,
} from "@/lib/api";
import { Bell, Search, Plus, TrendingDown, Zap, Factory, Check, X, Gavel, Inbox, Clock, Boxes, ChevronRight, Trophy, Send, Package, Truck, LogOut, AlertTriangle } from "lucide-react";
import ProfileShell from "@/components/BulkStrikeProfileShell";
import BulkStrikeBachecaNotifiche from "@/components/BulkStrikeBachecaNotifiche";

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
    { k:"pool",     icon:Bell,         label:"Apre un'asta a ribasso",    desc:"Avvisami quando apre un'asta a ribasso per questo articolo — per partecipare" },
    { k:"price",    icon:TrendingDown, label:"Prezzo in calo",  desc:"Avvisami su nuove offerte più basse" },
    { k:"supplier", icon:Factory,      label:"Nuovo fornitore", desc:"Avvisami quando si aggiunge un fornitore certificato" },
  ],
  supplier: [
    { k:"pool",    icon:Bell,   label:"Apre un'asta a ribasso",      desc:"Avvisami quando apre un'asta a ribasso — per fare un'offerta a ribasso" },
    { k:"closing", icon:Clock,  label:"In chiusura (30 min)", desc:"Avvisami 30 minuti prima della chiusura di un'asta a ribasso a cui partecipi" },
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
    { id:1, type:"pool",     mat:"Acido tartarico L(+)",        text:"È aperta una nuova asta a ribasso — miglior prezzo €1,68/kg, può solo scendere", time:"5 min fa", unread:true,  action:"Partecipa" },
    { id:2, type:"price",    mat:"Acido tartarico L(+)",        text:"Prezzo sceso del 6% nell'asta a ribasso attiva: ora €1,62/kg", time:"2 ore fa", unread:true,  action:"Vedi asta" },
    { id:3, type:"supplier", mat:"Bentonite",                   text:"Nuovo fornitore certificato disponibile: Laviosa (IT)", time:"1 giorno fa", unread:false, action:"Vedi" },
    { id:4, type:"pool",     mat:"Metabisolfito di potassio",   text:"Un'asta a ribasso sta per chiudere tra 8 ore", time:"1 giorno fa", unread:false, action:"Partecipa" },
  ],
  supplier: [
    { id:5, type:"closing", mat:"Acido tartarico L(+)",  text:"Un'asta a ribasso a cui partecipi chiude tra 30 min — preparati a difendere o ribassare", time:"ora", unread:true,  action:"Vai all'asta" },
    { id:1, type:"pool",    mat:"Acido tartarico L(+)",   text:"Nuova asta a ribasso aperta: 9 aziende, 13.800 kg aggregati — fai la tua offerta", time:"12 min fa", unread:true,  action:"Fai un'offerta" },
    { id:2, type:"outbid",  mat:"Acido tartarico L(+)",   text:"Sei stato superato: un concorrente offre €1,62/kg", time:"1 ora fa", unread:true,  action:"Rilancia" },
    { id:3, type:"request", mat:"Bitartrato di potassio", text:"Una cantina cerca questo prodotto (5t)", time:"3 ore fa", unread:false, action:"Rispondi" },
    { id:4, type:"pool",    mat:"Acido metatartarico",    text:"Asta a ribasso in chiusura tra 6 ore — ultima occasione per offrire", time:"1 giorno fa", unread:false, action:"Fai un'offerta" },
  ],
};
// Formattazioni per la lista "Aste personali" (dati reali via getMyPools).
const eurKg = (n) => n == null ? "—" : Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tonnes = (kg) => `${(Number(kg) / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} t`;
const closesInLabel = (iso) => {
  if (!iso) return "—";
  const s = Math.floor((new Date(iso) - Date.now()) / 1000);
  if (s <= 0) return "conclusa";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}g ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const NOTIF_STYLE = {
  pool:     { icon:Bell,         color:C.purple, bg:"#F5F0FF" },
  closing:  { icon:Clock,        color:C.amber,  bg:"#FFF7ED" },
  price:    { icon:TrendingDown, color:C.green,  bg:"#ECFDF5" },
  supplier: { icon:Factory,      color:C.blue,   bg:"#EFF6FF" },
  request:  { icon:Search,       color:C.blue,   bg:"#EFF6FF" },
  outbid:   { icon:Zap,          color:C.red,    bg:"#FEF2F2" },
};

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
      <input value={v} onChange={e=>on(e.target.value)} style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:9, padding:"11px 13px", fontSize:14, outline:"none", fontFamily:"Inter,system-ui", background:"#fff", color:C.text }}/>
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
          <button style={{ background:"#0369A1", color:"#fff", border:"none", borderRadius:7, padding:"6px 13px", fontSize:12.5, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui", display:"flex", alignItems:"center", gap:5 }}>{n.action} <ChevronRight size={13}/></button>
          {n.unread && <button onClick={()=>onRead(n.id)} style={{ background:"none", border:"none", color:C.muted, fontSize:12, cursor:"pointer", fontFamily:"Inter,system-ui" }}>segna come letto</button>}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [role, setRole] = useState("buyer");
  const [myPools, setMyPools] = useState(null); // null = in caricamento; [] = nessuna asta
  const [section, setSection] = useState("overview");
  // La sezione reale è nel querystring (?section=), ma si conosce solo lato client:
  // finché non è risolta mostriamo uno skeleton, così non si vede per un istante la
  // sezione di default (Panoramica) prima di quella richiesta (Avvisi/Aste/Account).
  const [ready, setReady] = useState(false);
  const [mats, setMats] = useState(SEED_MATS);
  const [notifs, setNotifs] = useState(SEED_NOTIFS);
  const [q, setQ] = useState("");
  const [company, setCompany] = useState(null);
  const [acctSaved, setAcctSaved] = useState(false);
  const [delStep, setDelStep] = useState("idle"); // idle | code
  const [delEmail, setDelEmail] = useState("");
  const [delCode, setDelCode] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");

  // account form (demo, example values — non dati reali)
  const [acct, setAcct] = useState({
    company:"Cantina Pasetti", vat:"IT01234567890", country:"Italia", city:"Francavilla al Mare (CH)", address:"Via Esempio 1", phone:"+39 085 000000", website:"www.esempio.it", contact:"Nome Cognome",
    emailMgmt:"acquisti@esempio.it", emailAdmin:"amministrazione@esempio.it", pec:"azienda@pec.esempio.it", sdi:"XXXXXXX",
    erpSystem:"", erpOther:"",
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

  // Apertura diretta di una sezione via querystring (es. /dashboard?section=pools,
  // usato dal pulsante "Visualizza le tue aste" dopo l'adesione a un'asta).
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("section");
    // Le notifiche sono state accorpate in "alerts": i vecchi link ?section=notifs
    // devono continuare a funzionare.
    if (s) setSection(s === "notifs" ? "alerts" : s);
    setReady(true); // sezione risolta: si può mostrare il contenuto
  }, []);

  // Aste reali dell'azienda (sostituisce i dati demo): fonte unica con la pagina
  // asta, così "Aste personali" e "Hai già aderito" restano sempre coerenti.
  useEffect(() => {
    getMyPools().then(setMyPools).catch(() => setMyPools([]));
  }, []);

  const cur = mats[role];
  const curNotifs = notifs[role];
  const defs = ALERT_DEFS[role];
  const poolsLoading = myPools === null;
  // Compratore: aste a cui partecipo (my_quantity_kg). Fornitore: aste su cui ho
  // offerto (my_bid_price). Mappate nella forma attesa dalle card.
  const pools = (myPools || [])
    .filter(p => role === "supplier" ? p.my_bid_price != null : p.my_quantity_kg != null)
    .map(p => {
      const concluded = p.status === "closed" || p.status === "cancelled";
      const cancelled = p.status === "cancelled";
      return {
        id: p.pool_id,
        mat: p.product_name,
        price: eurKg(p.best_price_per_kg),
        companies: Number(p.participants) || 0,
        suppliers: Number(p.suppliers) || 0,
        closesIn: concluded ? (cancelled ? "annullata" : "conclusa") : closesInLabel(p.closes_at),
        concluded,
        status: concluded
          ? { label: cancelled ? "Annullata" : `Conclusa · €${eurKg(p.best_price_per_kg)}/kg`, tone: C.muted }
          : role === "supplier"
            ? { label: `Tua offerta €${eurKg(p.my_bid_price)}/kg`, tone: C.blue }
            : { label: `Stai partecipando · ${tonnes(p.my_quantity_kg)}`, tone: C.blue },
      };
    });
  const activePools = pools.filter(p => !p.concluded);
  const concludedPools = pools.filter(p => p.concluded);
  const renderPoolCard = (p, i) => (
    <div key={p.id || i} className="bs-card" style={{ padding:18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14, flexWrap:"wrap", gap:8 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>{p.mat}</div>
          <span style={{ fontSize:12, fontWeight:700, color:p.status.tone, background:`${p.status.tone}14`, padding:"3px 9px", borderRadius:6 }}>{p.status.label}</span>
        </div>
        <span style={{ fontSize:12, color:C.muted, display:"flex", alignItems:"center", gap:4 }}>
          {p.concluded ? <><Check size={12}/> Conclusa</> : <><Clock size={12}/> chiude tra {p.closesIn}</>}
        </span>
      </div>
      <div style={{ display:"flex", gap:24, flexWrap:"wrap", marginBottom:16 }}>
        <div><div style={{ fontSize:11, color:C.muted }}>{p.concluded ? "Prezzo di chiusura" : "Miglior prezzo ora"}</div><div className="bs-num" style={{ fontSize:18, fontWeight:800, color:C.purple }}>€{p.price}/kg</div></div>
        <div><div style={{ fontSize:11, color:C.muted }}>Aziende aggregate</div><div className="bs-num" style={{ fontSize:18, fontWeight:800 }}>{p.companies}</div></div>
        <div><div style={{ fontSize:11, color:C.muted }}>Fornitori in gara</div><div className="bs-num" style={{ fontSize:18, fontWeight:800 }}>{p.suppliers}</div></div>
      </div>
      <button onClick={() => { window.location.href = p.id ? `/pool?id=${p.id}` : "/pool"; }} style={{ background:C.purple, color:"#fff", border:"none", borderRadius:9, padding:"10px 18px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui", display:"inline-flex", alignItems:"center", gap:7 }}>
        {p.concluded ? <>Vedi esito <ChevronRight size={15}/></> : role==="buyer" ? <>Vai all'asta <ChevronRight size={15}/></> : <><Zap size={15}/> Rilancia offerta</>}
      </button>
    </div>
  );
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
      setRole(!c.is_buyer && c.is_supplier ? "supplier" : "buyer");
      setAcct(a => ({
        ...a,
        company:c.legal_name||"", vat:c.vat||"", country:c.country||"", city:c.city||"",
        address:c.address||"", phone:c.phone||"", website:c.website||"", contact:c.contact_name||"",
        emailMgmt:c.email_mgmt||"", emailAdmin:c.email_admin||"", pec:c.pec||"", sdi:c.sdi||"",
        erpSystem:c.erp_system||"", erpOther:c.erp_system_other||"",
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
      erp_system: acct.erpSystem || null,
      erp_system_other: acct.erpSystem === "Altro" ? acct.erpOther || null : null,
      iban_holder: acct.ibanHolder, iban: acct.iban, bic: acct.bic,
    });
    setAcctSaved(true);
    setTimeout(() => setAcctSaved(false), 2500);
  }

  async function handleLogout() {
    try { await signOut(); } catch (e) {}
    window.location.href = "/";
  }

  async function handleRequestDeletion() {
    setDelErr(""); setDelBusy(true);
    try {
      const email = await requestAccountDeletionCode();
      setDelEmail(email);
      setDelStep("code");
    } catch (e) { setDelErr("Non è stato possibile inviare il codice. Riprova."); }
    finally { setDelBusy(false); }
  }

  async function handleConfirmDeletion() {
    if (!delCode.trim()) { setDelErr("Inserisci il codice ricevuto per email."); return; }
    setDelErr(""); setDelBusy(true);
    try {
      await confirmAccountDeletion(delEmail, delCode.trim());
      window.location.href = "/";
    } catch (e) { setDelErr("Codice non valido o scaduto. Richiedine uno nuovo."); }
    finally { setDelBusy(false); }
  }

  const query = q.trim().toLowerCase();
  const searchHits = query ? ALL_MATERIALS.filter(m=>m.toLowerCase().includes(query)) : [];
  const exact = query && ALL_MATERIALS.some(m=>m.toLowerCase()===query);

  // La sidebar e l'header sono ora forniti da BulkStrikeProfileShell (shell
  // condivisa da TUTTE le voci del profilo: la sidebar resta ferma, cambia solo
  // il contenuto). Qui resta solo il toggle ruolo, passato all'header della
  // shell: visibile in demo (nessun account reale) o per un account che è
  // davvero sia cliente sia fornitore.
  const roleToggle = (!company || (company.is_buyer && company.is_supplier)) ? (
    <div style={{ display:"flex", background:C.bg, border:`1px solid ${C.border}`, borderRadius:9, padding:3 }}>
      {[["buyer","Acquirente"],["supplier","Fornitore"]].map(([id,lab])=>(
        <button key={id} onClick={()=>setRole(id)} style={{ padding:"6px 14px", borderRadius:7, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"Inter,system-ui", background:role===id?"#fff":"transparent", color:role===id?C.blue:C.muted, boxShadow:role===id?"0 1px 3px rgba(0,0,0,0.08)":"none" }}>{lab}</button>
      ))}
    </div>
  ) : null;

  return (
    <ProfileShell active={section} headerCenter={roleToggle}>
      <style>{`
        .bs-num { font-family:'JetBrains Mono',monospace; }
        input:focus { border-color:#0EA5E9 !important; }
        .bs-card { background:#fff; border:1px solid #E2E8F0; border-radius:14px; }
        @media (max-width:820px){ .bs-stats4 { grid-template-columns:repeat(2,1fr) !important; } .bs-2col { grid-template-columns:1fr !important; } .bs-form2 { grid-template-columns:1fr !important; } }
      `}</style>
      {!ready ? (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ height:26, width:220, background:"#EEF2F7", borderRadius:8 }}/>
          <div style={{ height:14, width:340, maxWidth:"80%", background:"#F1F5F9", borderRadius:6 }}/>
          <div className="bs-stats4" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginTop:6 }}>
            {[0,1,2,3].map(i => <div key={i} className="bs-card" style={{ height:96, background:"#F8FAFC" }}/>)}
          </div>
          <div className="bs-2col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
            <div className="bs-card" style={{ height:220, background:"#F8FAFC" }}/>
            <div className="bs-card" style={{ height:220, background:"#F8FAFC" }}/>
          </div>
        </div>
      ) : (
      <>

          {/* ===== OVERVIEW ===== */}
          {section==="overview" && (
            <>
              <h1 style={{ fontSize:23, fontWeight:800, marginBottom:4 }}>Ciao, Cantina Pasetti 👋</h1>
              <p style={{ fontSize:14, color:C.muted, marginBottom:20 }}>{role==="buyer"?"Ecco cosa si muove sulle materie prime che segui.":"Ecco le opportunità sui prodotti che vendi."}</p>

              <div className="bs-stats4" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:22 }}>
                {[
                  { icon:Boxes, color:C.blue,   val:Object.keys(cur).length, lab:"Materie monitorate" },
                  { icon:Bell,  color:C.purple, val:activeAlerts, lab:"Avvisi attivi" },
                  { icon:Gavel, color:C.amber,  val:pools.length, lab:"Aste in corso" },
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
                    <button onClick={()=>setSection("alerts")} style={{ background:"none", border:"none", color:C.blue, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Vedi tutte</button>
                  </div>
                  <div>{curNotifs.slice(0,3).map((n,i)=>(
                    <div key={n.id} style={{ borderBottom:i<2?`1px solid #F1F5F9`:"none" }}><NotifRow n={n} onRead={markRead} compact/></div>
                  ))}</div>
                </div>

                {/* active pools */}
                <div className="bs-card" style={{ padding:18 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                    <div style={{ fontSize:15, fontWeight:700 }}>Aste personali</div>
                    <button onClick={()=>setSection("pools")} style={{ background:"none", border:"none", color:C.blue, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Gestisci</button>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {poolsLoading ? <div style={{ fontSize:13, color:C.muted, padding:"6px 0" }}>Caricamento…</div>
                     : pools.length === 0 ? <div style={{ fontSize:13, color:C.muted, padding:"6px 0" }}>Non partecipi ancora ad alcuna asta.</div>
                     : [...activePools, ...concludedPools].map((p,i)=>(
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
              <p style={{ fontSize:14, color:C.muted, marginBottom:20 }}>Le materie prime che segui e gli avvisi che vuoi ricevere. {role==="buyer"?"Gli avvisi ti fanno cogliere le aste a ribasso e i cali di prezzo.":"Gli avvisi ti segnalano dove puoi offrire e competere."}</p>

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
                    {!exact && <button onClick={()=>{ addMat(q.trim()); setQ(""); }} style={{ padding:"7px 13px", borderRadius:100, border:`1.5px dashed ${C.blue}`, background:"#fff", color:C.blue, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui", display:"flex", alignItems:"center", gap:5 }}><Plus size={14}/> Aggiungi "{q.trim()}"</button>}
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

              {/* NOTIFICHE — feed accorpato qui dagli avvisi generati dalle materie monitorate */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", margin:"26px 0 6px", flexWrap:"wrap", gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <Inbox size={17} color={C.blue}/><h2 style={{ fontSize:17, fontWeight:800 }}>Notifiche</h2>
                  {unread>0 && <span style={{ minWidth:18, height:18, padding:"0 5px", borderRadius:9, background:C.red, color:"#fff", fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{unread}</span>}
                </div>
                {unread>0 && <button onClick={markAll} style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui", color:C.muted }}>Segna tutte come lette</button>}
              </div>
              <p style={{ fontSize:14, color:C.muted, marginBottom:14 }}>Gli avvisi generati dalle tue materie prime monitorate.</p>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {curNotifs.map(n=><NotifRow key={n.id} n={n} onRead={markRead}/>)}
              </div>
            </>
          )}

          {/* ===== POOLS ===== */}
          {section==="pools" && (
            <>
              <h1 style={{ fontSize:23, fontWeight:800, marginBottom:4 }}>Aste personali</h1>
              <p style={{ fontSize:14, color:C.muted, marginBottom:20 }}>{role==="buyer"?"Le aste a ribasso a cui stai partecipando. Il prezzo può solo scendere fino alla chiusura.":"Le aste a ribasso in cui stai competendo. Rilancia per restare il più conveniente."}</p>

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
                      L'asta è chiusa. Per <b style={{color:C.text}}>5 minuti</b> chi ha perso può fare <b style={{color:C.text}}>una sola</b> contro-offerta a ribasso. Per ogni contro-offerta, il vincitore ha <b style={{color:C.text}}>5 minuti</b> (dal momento della contro-offerta) per rispondere <b style={{color:C.text}}>una sola volta</b> e restare vincitore. Nel caso peggiore l'asta si chiude dopo <b style={{color:C.text}}>10 minuti</b>.
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
                          <Trophy size={18} color={C.amber}/><span style={{ fontSize:14 }}>Hai <b style={{color:C.green}}>vinto</b> l'asta a <b className="bs-num">€1,62/kg</b></span>
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

              {poolsLoading ? (
                <div className="bs-card" style={{ padding:18, fontSize:14, color:C.muted }}>Caricamento…</div>
              ) : pools.length === 0 ? (
                <div className="bs-card" style={{ padding:18, fontSize:14, color:C.muted }}>{role==="supplier"?"Non stai competendo in alcuna asta.":"Non partecipi ad alcuna asta. Apri o unisciti a un'asta dalla pagina di un prodotto."}</div>
              ) : (
                <>
                  {activePools.length > 0 && (
                    <>
                      <div style={{ fontSize:12, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, margin:"2px 0 10px" }}>In corso · {activePools.length}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:concludedPools.length ? 28 : 0 }}>{activePools.map(renderPoolCard)}</div>
                    </>
                  )}
                  {concludedPools.length > 0 && (
                    <>
                      <div style={{ fontSize:12, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, margin:"2px 0 10px" }}>Concluse · {concludedPools.length}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>{concludedPools.map(renderPoolCard)}</div>
                    </>
                  )}
                </>
              )}
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
                  {/* Gestionale in uso (DAV-75): con questo dato decidiamo quale
                      integrazione nativa costruire per prima */}
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:12.5, fontWeight:700, color:C.muted, marginBottom:5 }}>Gestionale in uso</div>
                    <select value={acct.erpSystem} onChange={e=>setA("erpSystem",e.target.value)}
                            style={{ width:"100%", padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:9, fontSize:14, color:C.text, background:"#fff", fontFamily:"inherit", outline:"none" }}>
                      <option value="">Seleziona...</option>
                      <option>Fatture in Cloud</option><option>TeamSystem</option><option>Zucchetti</option>
                      <option>Danea Easyfatt</option><option>Arca Evolution</option><option>SAP</option>
                      <option>Business Central</option><option>Altro</option><option>Nessuno</option>
                    </select>
                  </div>
                  {acct.erpSystem === "Altro" && (
                    <AField label="Quale gestionale?" v={acct.erpOther} on={v=>setA("erpOther",v)}/>
                  )}
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

              {role==="supplier" && (
                <div style={{ marginBottom:18 }}>
                  <BulkStrikeBachecaNotifiche />
                </div>
              )}

              <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                <button onClick={saveAccount} style={{ background:"#0369A1", color:"#fff", border:"none", borderRadius:10, padding:"12px 22px", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Salva modifiche</button>
                <button style={{ background:"#fff", color:C.muted, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 20px", fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Annulla</button>
                {acctSaved && <span style={{ color:C.green, fontSize:14, fontWeight:600, display:"flex", alignItems:"center", gap:5 }}><Check size={16}/> Salvato</span>}
              </div>

              <div style={{ margin:"28px 0", borderTop:`1px solid ${C.border}` }}/>

              <button onClick={handleLogout} style={{ background:"#fff", color:C.text, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 20px", fontSize:14.5, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui", display:"inline-flex", alignItems:"center", gap:8 }}>
                <LogOut size={16}/> Disconnetti
              </button>

              <div className="bs-card" style={{ marginTop:20, borderColor:`${C.red}44`, background:"#FFF5F5" }}>
                <div style={{ fontSize:15, fontWeight:800, color:C.red, display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <AlertTriangle size={17}/> Elimina definitivamente l'account
                </div>
                <p style={{ fontSize:13, color:"#7F1D1D", lineHeight:1.6, marginBottom:14, maxWidth:560 }}>
                  Azione irreversibile: i dati aziendali e di contatto verranno rimossi e non potrai più accedere con questo account. Per sicurezza, richiede la conferma di un codice inviato alla tua email.
                </p>

                {delStep === "idle" ? (
                  <button onClick={handleRequestDeletion} disabled={delBusy} style={{ background:C.red, color:"#fff", border:"none", borderRadius:9, padding:"11px 20px", fontSize:14, fontWeight:700, cursor:delBusy?"default":"pointer", opacity:delBusy?0.6:1, fontFamily:"Inter,system-ui" }}>
                    {delBusy ? "Invio codice…" : "Elimina il mio account"}
                  </button>
                ) : (
                  <div style={{ maxWidth:420 }}>
                    <div style={{ fontSize:13, color:"#7F1D1D", marginBottom:10 }}>Codice di conferma inviato a <b>{delEmail}</b>. Inseriscilo qui sotto per confermare l'eliminazione.</div>
                    <input value={delCode} onChange={e=>setDelCode(e.target.value)} placeholder="Codice a 6 cifre" style={{ width:"100%", border:`1px solid ${C.red}66`, borderRadius:9, padding:"11px 13px", fontSize:15, outline:"none", fontFamily:"'JetBrains Mono',monospace", background:"#fff", color:C.text, marginBottom:10 }}/>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                      <button onClick={handleConfirmDeletion} disabled={delBusy} style={{ background:C.red, color:"#fff", border:"none", borderRadius:9, padding:"11px 20px", fontSize:14, fontWeight:700, cursor:delBusy?"default":"pointer", opacity:delBusy?0.6:1, fontFamily:"Inter,system-ui" }}>
                        {delBusy ? "Verifica…" : "Conferma ed elimina per sempre"}
                      </button>
                      <button onClick={() => { setDelStep("idle"); setDelCode(""); setDelErr(""); }} style={{ background:"transparent", color:C.muted, border:`1px solid ${C.border}`, borderRadius:9, padding:"11px 16px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Annulla</button>
                    </div>
                  </div>
                )}
                {delErr && <div style={{ marginTop:10, fontSize:13, color:C.red, fontWeight:600 }}>{delErr}</div>}
              </div>
            </>
          )}
      </>
      )}
    </ProfileShell>
  );
}
