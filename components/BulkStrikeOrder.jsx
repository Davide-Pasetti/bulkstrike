"use client";
// BulkStrikeOrder — dettaglio ordine (/ordine?id=…). Timeline dello stato e
// azioni in base al ruolo:
//  · acquirente: paga in escrow (DEMO fino all'integrazione PSP) → conferma consegna → recensione
//  · fornitore: segna come spedito quando l'escrow è versato
// Tutte le transizioni sono validate server-side (RPC dedicate).
import { useState, useEffect } from "react";
import { ChevronRight, Check, Truck, CreditCard, PackageCheck, Star, ShieldCheck, FileText, Clock, AlertTriangle, ArrowRight, MapPin, MessageSquareWarning, X } from "lucide-react";
import { getOrderDetail, getSession, markOrderPaidDemo, markOrderShipped, confirmDelivery, raiseDispute, poolErrorMessage } from "@/lib/api";
import NavAuth from "@/components/BulkStrikeNavAuth";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706", purple:"#7C3AED" };
const eur = (n) => n == null ? "—" : "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });

const STATUS = {
  pending_payment: { label:"In attesa di pagamento", fg:"#B45309", bg:"#FEF3C7" },
  paid:            { label:"Pagato — in preparazione", fg:"#1D4ED8", bg:"#DBEAFE" },
  shipped:         { label:"Spedito", fg:"#0369A1", bg:"#E0F2FE" },
  delivered:       { label:"Consegnato", fg:"#0F766E", bg:"#CCFBF1" },
  accepted:        { label:"Consegna confermata", fg:"#047857", bg:"#D1FAE5" },
  completed:       { label:"Completato", fg:"#047857", bg:"#D1FAE5" },
  disputed:        { label:"In contestazione", fg:"#B91C1C", bg:"#FEE2E2" },
  cancelled:       { label:"Annullato", fg:"#6B7280", bg:"#F3F4F6" },
};
const statusOf = (s) => STATUS[s] || { label:s, fg:C.muted, bg:C.bg };

// timeline lineare del ciclo felice
const STEPS = [
  { key:"pending_payment", label:"Ordine creato",      icon:FileText },
  { key:"paid",            label:"Pagato in escrow",   icon:CreditCard },
  { key:"shipped",         label:"Spedito",            icon:Truck },
  { key:"accepted",        label:"Consegna confermata",icon:PackageCheck },
];
const stepIndex = (status) => {
  if (status === "pending_payment") return 0;
  if (status === "paid") return 1;
  if (status === "shipped" || status === "delivered") return 2;
  if (status === "accepted" || status === "completed") return 3;
  return -1; // disputed / cancelled: timeline non lineare
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

export default function OrderPage() {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [acting, setActing] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [err, setErr] = useState("");
  const [justDone, setJustDone] = useState("");

  async function reload(id) {
    const o = await getOrderDetail(id);
    if (o) setOrder(o); else setNotFound(true);
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      try { await reload(id); } catch (e) { setNotFound(true); }
      setLoading(false);
    })();
  }, []);

  async function doAction(fn, doneMsg) {
    setActing(true); setErr(""); setJustDone("");
    try {
      await fn(order.id);
      await reload(order.id);
      setJustDone(doneMsg);
    } catch (e) {
      setErr(poolErrorMessage(e));
    } finally {
      setActing(false);
    }
  }

  async function submitDispute() {
    if (!disputeReason.trim()) { setErr("Spiega il motivo della contestazione."); return; }
    setActing(true); setErr("");
    try {
      await raiseDispute(order.id, disputeReason);
      await reload(order.id);
      setDisputeOpen(false); setDisputeReason("");
      setJustDone("Contestazione registrata. Lo sblocco automatico del pagamento è sospeso; ti contatteremo per la risoluzione.");
    } catch (e) {
      setErr(poolErrorMessage(e));
    } finally {
      setActing(false);
    }
  }

  function daysLeft(iso) {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  }

  const st = order ? statusOf(order.status) : null;
  const idx = order ? stepIndex(order.status) : -1;
  const isBuyer = order?.role === "buyer";

  return (
    <div style={{ background:"#fff", color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", colorScheme:"light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .od-num { font-family:'JetBrains Mono',monospace; }
        .od-grid { display:grid; grid-template-columns:1fr 320px; gap:24px; align-items:start; }
        .od-card { border:1px solid ${C.border}; border-radius:14px; padding:20px; }
        @media (max-width:860px) { .od-grid { grid-template-columns:1fr !important; } }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ position:"sticky", top:0, zIndex:50, background:"rgba(255,255,255,0.96)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 20px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
            <BSIcon size={34} uid="nav" />
            <div style={{ display:"flex", alignItems:"baseline" }}>
              <span style={{ fontSize:19, fontWeight:900, letterSpacing:"-0.03em" }}>Bulk</span>
              <span style={{ fontSize:19, fontWeight:900, letterSpacing:"-0.03em", background:"linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>Strike</span>
            </div>
          </div>
          <NavAuth />
        </div>
      </nav>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"22px 20px 60px" }}>
        {/* BREADCRUMB */}
        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.muted, marginBottom:18 }}>
          <span onClick={() => { window.location.href = "/"; }} style={{ cursor:"pointer" }}>Home</span><ChevronRight size={13}/>
          <span onClick={() => { window.location.href = "/ordini"; }} style={{ cursor:"pointer" }}>I miei ordini</span><ChevronRight size={13}/>
          <span style={{ color:C.text, fontWeight:600 }}>Dettaglio</span>
        </div>

        {loading ? (
          <div style={{ padding:"60px 0", textAlign:"center", color:C.muted }}>Caricamento ordine…</div>
        ) : needLogin ? (
          <div style={{ padding:"50px 20px", textAlign:"center", border:`1px solid ${C.border}`, borderRadius:14 }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Accedi per vedere l'ordine</div>
            <button onClick={() => { window.location.href = "/login"; }} style={{ background:C.blue, color:"#fff", border:"none", borderRadius:9, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Accedi</button>
          </div>
        ) : notFound || !order ? (
          <div style={{ padding:"50px 20px", textAlign:"center", border:`1px solid ${C.border}`, borderRadius:14 }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>Ordine non trovato</div>
            <div style={{ fontSize:14, color:C.muted, marginBottom:16 }}>L'ordine non esiste o non appartiene alla tua azienda.</div>
            <button onClick={() => { window.location.href = "/ordini"; }} style={{ background:C.blue, color:"#fff", border:"none", borderRadius:9, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Vai ai miei ordini</button>
          </div>
        ) : (
          <>
            {/* HEADER */}
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:14, marginBottom:20, flexWrap:"wrap" }}>
              <div>
                <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>Ordine <span className="od-num">{order.id}</span></div>
                <h1 style={{ fontSize:26, fontWeight:800, letterSpacing:"-0.02em", marginBottom:6 }}>{order.product_name}</h1>
                <div style={{ fontSize:13.5, color:C.muted }}>
                  {isBuyer ? <>Fornitore: <span onClick={() => { window.location.href = `/fornitore?id=${order.supplier_id}`; }} style={{ fontWeight:700, color:C.text, cursor:"pointer", textDecoration:"underline" }}>{order.supplier_name}</span></> : <>Acquirente: <b style={{ color:C.text }}>{order.buyer_name}</b></>}
                  {" · "}creato il {new Date(order.created_at).toLocaleDateString("it-IT", { year:"numeric", month:"long", day:"numeric" })}
                </div>
              </div>
              <span style={{ fontSize:13, fontWeight:800, color:st.fg, background:st.bg, borderRadius:100, padding:"7px 16px" }}>{st.label}</span>
            </div>

            {/* TIMELINE */}
            {idx >= 0 ? (
              <div style={{ display:"flex", alignItems:"flex-start", margin:"0 0 26px", overflowX:"auto", paddingBottom:4 }}>
                {STEPS.map((s, i) => {
                  const doneStep = i <= idx;
                  const Icon = s.icon;
                  return (
                    <div key={s.key} style={{ display:"flex", alignItems:"flex-start", flex:i < STEPS.length - 1 ? 1 : "0 0 auto", minWidth:i < STEPS.length - 1 ? 120 : 90 }}>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:90, flexShrink:0 }}>
                        <div style={{ width:38, height:38, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", background:doneStep ? C.green : "#fff", border:`2px solid ${doneStep ? C.green : C.border}`, color:doneStep ? "#fff" : C.muted }}>
                          {doneStep && i < idx ? <Check size={17}/> : <Icon size={16}/>}
                        </div>
                        <span style={{ fontSize:11, fontWeight:doneStep ? 700 : 500, color:doneStep ? C.text : C.muted, textAlign:"center", marginTop:6, lineHeight:1.3 }}>{s.label}</span>
                      </div>
                      {i < STEPS.length - 1 && <div style={{ flex:1, height:2, background:i < idx ? C.green : C.border, marginTop:19 }}/>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display:"flex", gap:8, alignItems:"center", fontSize:13, color:st.fg, background:st.bg, borderRadius:10, padding:"11px 14px", marginBottom:26 }}>
                <AlertTriangle size={15}/> Questo ordine è {st.label.toLowerCase()}.
              </div>
            )}

            {justDone && <div style={{ marginBottom:14, padding:"11px 14px", background:"#ECFDF5", border:"1px solid #A7F3D0", borderRadius:10, fontSize:13, color:C.green, fontWeight:600, display:"flex", alignItems:"center", gap:7 }}><Check size={15}/>{justDone}</div>}
            {err && <div style={{ marginBottom:14, padding:"11px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10, fontSize:13, color:C.red }}>{err}</div>}

            <div className="od-grid">
              {/* SINISTRA: azioni + dettagli */}
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                {/* AZIONE CORRENTE */}
                {isBuyer && order.status === "pending_payment" && (
                  <div className="od-card" style={{ borderColor:C.blue, background:"#F0F9FF" }}>
                    <div style={{ fontSize:14.5, fontWeight:800, marginBottom:6, display:"flex", alignItems:"center", gap:7 }}><CreditCard size={16} color={C.blue}/> Completa il pagamento in escrow</div>
                    <p style={{ fontSize:13, color:C.muted, lineHeight:1.6, marginBottom:14 }}>
                      L'importo di <b className="od-num" style={{ color:C.text }}>{eur(order.goods_subtotal)}</b> viene depositato sul conto escrow di BulkStrike.
                      Il fornitore lo incassa solo dopo la tua conferma di consegna conforme. Se qualcosa va storto, l'importo torna a te.
                    </p>
                    <button onClick={() => doAction(markOrderPaidDemo, "Pagamento in escrow registrato. Il fornitore è stato avvisato.")} disabled={acting}
                            style={{ background:C.blue, color:"#fff", border:"none", borderRadius:10, padding:"13px 24px", fontSize:14, fontWeight:700, cursor:acting?"default":"pointer", opacity:acting?0.6:1, display:"inline-flex", alignItems:"center", gap:8, fontFamily:"Inter,system-ui" }}>
                      {acting ? "Registrazione…" : <>Paga {eur(order.goods_subtotal)} in escrow <ArrowRight size={15}/></>}
                    </button>
                    <div style={{ fontSize:11, color:C.muted, marginTop:10 }}>Ambiente dimostrativo: il versamento è simulato in attesa dell'integrazione con il provider di pagamento.</div>
                  </div>
                )}
                {!isBuyer && order.status === "paid" && (
                  <div className="od-card" style={{ borderColor:C.blue, background:"#F0F9FF" }}>
                    <div style={{ fontSize:14.5, fontWeight:800, marginBottom:6, display:"flex", alignItems:"center", gap:7 }}><Truck size={16} color={C.blue}/> Pagamento in escrow ricevuto — spedisci la merce</div>
                    <p style={{ fontSize:13, color:C.muted, lineHeight:1.6, marginBottom:14 }}>
                      L'acquirente ha versato <b className="od-num" style={{ color:C.text }}>{eur(order.goods_subtotal)}</b> in escrow. Quando la merce parte, segna l'ordine come spedito: l'acquirente riceverà una notifica.
                    </p>
                    <button onClick={() => doAction(markOrderShipped, "Ordine segnato come spedito. L'acquirente è stato avvisato.")} disabled={acting}
                            style={{ background:C.blue, color:"#fff", border:"none", borderRadius:10, padding:"13px 24px", fontSize:14, fontWeight:700, cursor:acting?"default":"pointer", opacity:acting?0.6:1, display:"inline-flex", alignItems:"center", gap:8, fontFamily:"Inter,system-ui" }}>
                      {acting ? "Aggiornamento…" : <>Segna come spedito <Truck size={15}/></>}
                    </button>
                  </div>
                )}
                {isBuyer && ["paid","shipped","delivered"].includes(order.status) && (
                  <div className="od-card" style={{ borderColor: order.status === "paid" ? C.border : C.green, background: order.status === "paid" ? "#fff" : "#F0FDF4" }}>
                    <div style={{ fontSize:14.5, fontWeight:800, marginBottom:6, display:"flex", alignItems:"center", gap:7 }}><PackageCheck size={16} color={C.green}/> Conferma la consegna</div>
                    <p style={{ fontSize:13, color:C.muted, lineHeight:1.6, marginBottom:order.status === "paid" ? 14 : 8 }}>
                      {order.status === "paid"
                        ? "Il fornitore sta preparando la spedizione. Quando ricevi la merce e verifichi che è conforme, conferma qui la consegna: sblocca subito il pagamento al fornitore."
                        : "Hai ricevuto la merce? Verificala e conferma la consegna: sblocchi subito il pagamento al fornitore e potrai lasciare una recensione."}
                    </p>
                    {order.status !== "paid" && order.auto_release_at && (
                      <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12.5, color:C.muted, background:C.bg, borderRadius:8, padding:"8px 11px", marginBottom:14 }}>
                        <Clock size={13}/> Se non fai nulla, si sblocca automaticamente {daysLeft(order.auto_release_at) === 0 ? "oggi" : `tra ${daysLeft(order.auto_release_at)} giorn${daysLeft(order.auto_release_at) === 1 ? "o" : "i"}`} — salvo contestazione.
                      </div>
                    )}
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                      <button onClick={() => doAction(confirmDelivery, "Consegna confermata. Ora puoi lasciare una recensione al fornitore.")} disabled={acting}
                              style={{ background:C.green, color:"#fff", border:"none", borderRadius:10, padding:"13px 24px", fontSize:14, fontWeight:700, cursor:acting?"default":"pointer", opacity:acting?0.6:1, display:"inline-flex", alignItems:"center", gap:8, fontFamily:"Inter,system-ui" }}>
                        {acting ? "Conferma…" : <>Confermo: merce ricevuta e conforme <Check size={15}/></>}
                      </button>
                      <button onClick={() => setDisputeOpen(true)} disabled={acting}
                              style={{ background:"transparent", color:C.red, border:`1.5px solid #FCA5A5`, borderRadius:10, padding:"13px 18px", fontSize:13.5, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:7, fontFamily:"Inter,system-ui" }}>
                        <MessageSquareWarning size={15}/> C'è un problema
                      </button>
                    </div>
                    {disputeOpen && (
                      <div style={{ marginTop:14, paddingTop:14, borderTop:`1px solid ${C.border}` }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                          <span style={{ fontSize:13, fontWeight:700 }}>Descrivi il problema</span>
                          <X size={15} color={C.muted} style={{ cursor:"pointer" }} onClick={() => { setDisputeOpen(false); setDisputeReason(""); }}/>
                        </div>
                        <textarea value={disputeReason} onChange={e => setDisputeReason(e.target.value)} rows={3} placeholder="Es. merce mancante, non conforme, danneggiata…"
                                  style={{ width:"100%", padding:"10px 12px", border:`1.5px solid ${C.border}`, borderRadius:8, fontSize:13, outline:"none", resize:"vertical", fontFamily:"Inter,system-ui", marginBottom:10 }}/>
                        <button onClick={submitDispute} disabled={acting}
                                style={{ background:C.red, color:"#fff", border:"none", borderRadius:9, padding:"10px 20px", fontSize:13, fontWeight:700, cursor:acting?"default":"pointer", opacity:acting?0.6:1, fontFamily:"Inter,system-ui" }}>
                          {acting ? "Invio…" : "Invia contestazione"}
                        </button>
                        <div style={{ fontSize:11.5, color:C.muted, marginTop:8 }}>Sospende lo sblocco automatico del pagamento; il nostro team ti contatta per risolvere.</div>
                      </div>
                    )}
                  </div>
                )}
                {isBuyer && ["accepted","completed"].includes(order.status) && !order.reviewed && (
                  <div className="od-card" style={{ borderColor:C.amber, background:"#FFFBEB" }}>
                    <div style={{ fontSize:14.5, fontWeight:800, marginBottom:6, display:"flex", alignItems:"center", gap:7 }}><Star size={16} color={C.amber}/> Com'è andata con {order.supplier_name}?</div>
                    <p style={{ fontSize:13, color:C.muted, lineHeight:1.6, marginBottom:14 }}>La tua recensione aiuta le altre aziende a scegliere bene — e i buoni fornitori a emergere.</p>
                    <button onClick={() => { window.location.href = `/fornitore?id=${order.supplier_id}`; }}
                            style={{ background:C.amber, color:"#fff", border:"none", borderRadius:10, padding:"12px 22px", fontSize:14, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:8, fontFamily:"Inter,system-ui" }}>
                      Lascia una recensione <Star size={15}/>
                    </button>
                  </div>
                )}
                {!isBuyer && order.status === "pending_payment" && (
                  <div className="od-card" style={{ display:"flex", gap:9, alignItems:"flex-start" }}>
                    <Clock size={16} color={C.amber} style={{ marginTop:2, flexShrink:0 }}/>
                    <div style={{ fontSize:13, color:C.muted, lineHeight:1.6 }}>In attesa che l'acquirente versi il pagamento in escrow. Riceverai una notifica appena potrai spedire.</div>
                  </div>
                )}
                {!isBuyer && ["shipped","delivered"].includes(order.status) && (
                  <div className="od-card" style={{ display:"flex", gap:9, alignItems:"flex-start" }}>
                    <Clock size={16} color={C.blue} style={{ marginTop:2, flexShrink:0 }}/>
                    <div style={{ fontSize:13, color:C.muted, lineHeight:1.6 }}>
                      Merce in viaggio. L'escrow si sblocca a tuo favore quando l'acquirente conferma la consegna
                      {order.auto_release_at && <> — o automaticamente {daysLeft(order.auto_release_at) === 0 ? "oggi" : `tra ${daysLeft(order.auto_release_at)} giorn${daysLeft(order.auto_release_at) === 1 ? "o" : "i"}`} se non ci sono contestazioni</>}.
                    </div>
                  </div>
                )}
                {order.status === "disputed" && (
                  <div className="od-card" style={{ borderColor:"#FCA5A5", background:"#FEF2F2" }}>
                    <div style={{ fontSize:14.5, fontWeight:800, marginBottom:6, display:"flex", alignItems:"center", gap:7, color:C.red }}><MessageSquareWarning size={16}/> Ordine in contestazione</div>
                    <p style={{ fontSize:13, color:C.muted, lineHeight:1.6 }}>
                      {isBuyer ? "Hai segnalato un problema con questo ordine" : "L'acquirente ha segnalato un problema con questo ordine"}
                      {order.disputed_at && <> il {new Date(order.disputed_at).toLocaleDateString("it-IT")}</>}: <i>"{order.dispute_reason}"</i>. Lo sblocco automatico del pagamento è sospeso — il nostro team vi contatterà per la risoluzione. Per urgenze scrivi a <a href="mailto:info@bulkstrike.com" style={{ color:C.blue }}>info@bulkstrike.com</a>.
                    </p>
                  </div>
                )}
                {["accepted","completed"].includes(order.status) && !isBuyer && (
                  <div className="od-card" style={{ display:"flex", gap:9, alignItems:"flex-start", borderColor:C.green, background:"#F0FDF4" }}>
                    <Check size={16} color={C.green} style={{ marginTop:2, flexShrink:0 }}/>
                    <div style={{ fontSize:13, color:C.muted, lineHeight:1.6 }}>L'acquirente ha confermato la consegna: l'escrow di <b className="od-num" style={{ color:C.text }}>{eur(order.goods_subtotal)}</b> è in liquidazione a tuo favore.</div>
                  </div>
                )}

                {/* DETTAGLI MERCE */}
                <div className="od-card">
                  <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:12 }}>Dettagli merce</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:14, fontSize:13.5 }}>
                    <div><div style={{ fontSize:11, color:C.muted }}>Prodotto</div><div style={{ fontWeight:700, cursor:"pointer", textDecoration:"underline" }} onClick={() => { window.location.href = `/prodotto?id=${order.product_id}`; }}>{order.product_name}</div></div>
                    <div><div style={{ fontSize:11, color:C.muted }}>Codici</div><div className="od-num">{[order.e_number, order.cas_number ? `CAS ${order.cas_number}` : null].filter(Boolean).join(" · ") || "—"}</div></div>
                    <div><div style={{ fontSize:11, color:C.muted }}>Quantità</div><div className="od-num" style={{ fontWeight:700 }}>{Number(order.quantity_kg).toLocaleString("it-IT")} kg</div></div>
                    <div><div style={{ fontSize:11, color:C.muted }}>Modalità</div><div style={{ fontWeight:600 }}>{order.mode === "instant" ? "Acquisto rapido" : order.mode === "pool" ? "Pool collettivo" : order.mode}</div></div>
                  </div>
                </div>

                {order.shipping_address && (
                  <div className="od-card">
                    <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:10, display:"flex", alignItems:"center", gap:7 }}><MapPin size={14}/> Indirizzo di consegna</div>
                    <div style={{ fontSize:13.5, fontWeight:600 }}>{order.shipping_address}</div>
                    {order.shipping_notes && <div style={{ fontSize:12.5, color:C.muted, marginTop:6 }}>{order.shipping_notes}</div>}
                  </div>
                )}
              </div>

              {/* DESTRA: riepilogo economico */}
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div className="od-card">
                  <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:12 }}>Riepilogo economico</div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13.5, marginBottom:8 }}>
                    <span style={{ color:C.muted }}>Prezzo unitario</span><span className="od-num" style={{ fontWeight:600 }}>{eur(order.unit_price_per_kg)}/kg</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13.5, marginBottom:8 }}>
                    <span style={{ color:C.muted }}>Quantità</span><span className="od-num" style={{ fontWeight:600 }}>{Number(order.quantity_kg).toLocaleString("it-IT")} kg</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13.5, marginBottom:8 }}>
                    <span style={{ color:C.muted }}>Commissione BulkStrike</span><span className="od-num" style={{ fontWeight:700, color:C.green }}>{order.commission_amount ? eur(order.commission_amount) : "€0,00"}</span>
                  </div>
                  <div style={{ borderTop:`1px solid ${C.border}`, margin:"12px 0 0", paddingTop:12, display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                    <span style={{ fontSize:14, fontWeight:700 }}>Totale merce</span>
                    <span className="od-num" style={{ fontSize:22, fontWeight:800, color:C.blue }}>{eur(order.goods_subtotal)}</span>
                  </div>
                </div>
                <div className="od-card" style={{ background:C.bg }}>
                  <div style={{ display:"flex", gap:8, alignItems:"flex-start", fontSize:12.5, color:C.muted, lineHeight:1.6 }}>
                    <ShieldCheck size={15} color={C.green} style={{ marginTop:1, flexShrink:0 }}/>
                    <span><b style={{ color:C.text }}>Protezione escrow.</b> Il pagamento resta in deposito su BulkStrike finché l'acquirente non conferma la consegna conforme. In caso di problemi, apri una contestazione scrivendo a <a href="mailto:info@bulkstrike.com" style={{ color:C.blue }}>info@bulkstrike.com</a>.</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
