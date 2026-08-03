"use client";
// BulkStrikeOrder — dettaglio ordine (/ordine?id=…). Timeline dello stato e
// azioni in base al ruolo:
//  · acquirente: paga in escrow (DEMO fino all'integrazione PSP) → conferma consegna → recensione
//  · fornitore: segna come spedito quando l'escrow è versato
// Tutte le transizioni sono validate server-side (RPC dedicate).
import { useState, useEffect } from "react";
import { ChevronRight, Check, Truck, CreditCard, PackageCheck, Star, ShieldCheck, FileText, Clock, AlertTriangle, ArrowRight, MapPin, MessageSquareWarning, MessageCircle, X, Landmark, Lock, Download, QrCode, Tag, Mail, RefreshCw } from "lucide-react";
import { getOrderDetail, getSession, markOrderShipped, confirmDelivery, raiseDispute, poolErrorMessage, getSupplierIbanForOrder, setOrderLot, fetchOrderQrObjectUrl, getMyCompany, adminListOrderEmails, adminResendOrderEmail, getGoodsReceipt } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import CopyButton from "@/components/CopyButton";
import EscrowPayinPanel from "@/components/checkout/EscrowPayinPanel";

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

  // Pay-in Stripe per riprendere il pagamento di un ordine escrow rimasto in
  // pending_payment (checkout interrotto, o pagamento SEPA da rifare).
  const [payins, setPayins] = useState(null);
  const [payinBusy, setPayinBusy] = useState(false);
  const [payinDone, setPayinDone] = useState(false);

  async function startEscrowPayment() {
    setPayinBusy(true); setErr("");
    try {
      const r = await fetch("/api/stripe/create-payin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderIds: [order.id] }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.payins?.length) throw new Error(data.error || "Creazione del pagamento non riuscita.");
      setPayins(data.payins);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setPayinBusy(false);
    }
  }

  // Rivelazione IBAN fornitore (solo ordini con bonifico anticipato).
  const [iban, setIban] = useState(null);
  const [ibanLoading, setIbanLoading] = useState(false);
  const [ibanErr, setIbanErr] = useState("");

  // Etichetta QR (solo fornitore).
  const [qrUrl, setQrUrl] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrErr, setQrErr] = useState("");

  // Numero di lotto (solo fornitore).
  const [lot, setLot] = useState("");
  const [lotSaving, setLotSaving] = useState(false);
  const [lotSaved, setLotSaved] = useState(false);

  // File di carico per il gestionale (DAV-75): CSV subito, XLSX con SheetJS
  // caricato on-demand (dynamic import: resta fuori dal bundle principale).
  const [grBusy, setGrBusy] = useState("");
  const GR_HEADER = ["numero_documento","data_documento","ddt_numero","ddt_data","codice_articolo_cliente","codice_prodotto_bulkstrike","descrizione","quantita","unita_misura","lotto","scadenza_lotto","prezzo_unitario","valuta","fornitore_ragione_sociale","fornitore_piva","destinazione","note"];

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function downloadGoodsReceipt(format) {
    setGrBusy(format); setErr("");
    try {
      const r = await getGoodsReceipt(order.id);
      const row = GR_HEADER.map(k => r?.[k] ?? "");
      const name = r?.numero_documento || `carico_${order.id.slice(0, 8)}`;
      if (format === "csv") {
        const cell = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
        const csv = "﻿" + [GR_HEADER, row].map(x => x.map(cell).join(",")).join("\r\n");
        triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${name}.csv`);
      } else {
        const XLSX = await import("xlsx");
        const ws = XLSX.utils.aoa_to_sheet([GR_HEADER, row]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Carico");
        const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
        triggerDownload(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${name}.xlsx`);
      }
    } catch (e) {
      setErr(poolErrorMessage(e));
    } finally {
      setGrBusy("");
    }
  }

  // Form "Conferma spedizione" (DAV-74): DDT e lotto obbligatori — il numero
  // DDT è la chiave di riconciliazione col gestionale del compratore (SDI).
  const [shipOpen, setShipOpen] = useState(false);
  const [ship, setShip] = useState({ carrier:"", tracking:"", ddtNumber:"", ddtDate:"", lotNumber:"", expiryDate:"", quantityShipped:"", notes:"" });
  const setShipField = (k) => (e) => setShip(s => ({ ...s, [k]: e.target.value }));

  async function submitShipment() {
    if (!ship.ddtNumber.trim()) { setErr("Il numero DDT è obbligatorio."); return; }
    if (!ship.ddtDate) { setErr("La data DDT è obbligatoria."); return; }
    if (!ship.lotNumber.trim()) { setErr("Il numero di lotto è obbligatorio."); return; }
    setActing(true); setErr(""); setJustDone("");
    try {
      await markOrderShipped(order.id, {
        carrier: ship.carrier.trim(), tracking: ship.tracking.trim(),
        ddtNumber: ship.ddtNumber.trim(), ddtDate: ship.ddtDate,
        lotNumber: ship.lotNumber.trim(), expiryDate: ship.expiryDate || null,
        quantityShipped: ship.quantityShipped, notes: ship.notes.trim(),
      });
      await reload(order.id);
      setShipOpen(false);
      setJustDone("Spedizione confermata. L'acquirente ha ricevuto tracking e riferimenti DDT.");
    } catch (e) {
      setErr(poolErrorMessage(e));
    } finally {
      setActing(false);
    }
  }

  // Admin: email dell'ordine (reinvio).
  const [isAdmin, setIsAdmin] = useState(false);
  const [orderEmails, setOrderEmails] = useState([]);

  async function reload(id) {
    const o = await getOrderDetail(id);
    if (o) { setOrder(o); setLot(o.lot_number || ""); } else setNotFound(true);
  }

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      try { await reload(id); } catch (e) { setNotFound(true); }
      // Determina se il visualizzatore è admin di piattaforma (una sola volta).
      try {
        const company = await getMyCompany();
        if (company?.is_platform_admin) {
          setIsAdmin(true);
          try { setOrderEmails(await adminListOrderEmails(id)); } catch (e) {}
        }
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  // Rilascia il blob URL del QR quando cambia o allo smontaggio.
  useEffect(() => () => { if (qrUrl) URL.revokeObjectURL(qrUrl); }, [qrUrl]);

  async function downloadQr() {
    setQrErr(""); setQrLoading(true);
    try {
      const objUrl = await fetchOrderQrObjectUrl(order.id);
      setQrUrl(objUrl); // conservato per l'anteprima; revocato allo smontaggio
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `qr-ordine-${String(order.id).slice(0, 8)}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {
      setQrErr(poolErrorMessage(e));
    } finally {
      setQrLoading(false);
    }
  }

  async function saveLot() {
    setLotSaving(true); setErr(""); setLotSaved(false);
    try {
      await setOrderLot(order.id, lot);
      setOrder(o => ({ ...o, lot_number: lot }));
      setLotSaved(true);
      setTimeout(() => setLotSaved(false), 2500);
    } catch (e) {
      setErr(poolErrorMessage(e));
    } finally {
      setLotSaving(false);
    }
  }

  async function resendEmail(row) {
    setErr("");
    try {
      await adminResendOrderEmail(order.id, row.kind);
      setOrderEmails(rows => rows.map(r => r.id === row.id ? { ...r, status: "queued" } : r));
    } catch (e) {
      setErr(poolErrorMessage(e));
    }
  }

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

  async function revealIban() {
    setIbanLoading(true); setIbanErr("");
    try {
      const data = await getSupplierIbanForOrder(order.id);
      setIban(data);
    } catch (e) {
      setIbanErr(poolErrorMessage(e));
    } finally {
      setIbanLoading(false);
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
  const isSupplier = order?.role === "supplier";

  // Documenti prodotto scaricabili (SDS, scheda tecnica, certificati).
  const productDocs = order ? [
    order.scheda_sicurezza_url && { label: "Scheda di sicurezza (SDS)", url: order.scheda_sicurezza_url },
    order.scheda_tecnica_url && { label: "Scheda tecnica", url: order.scheda_tecnica_url },
    ...(order.certificates || []).filter(c => c.file_url).map(c => ({ label: `Certificato ${c.label || c.cert_type}`, url: c.file_url, expiry: c.expiry_date })),
  ].filter(Boolean) : [];

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
      <BulkStrikeNav />

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
            <button onClick={() => { window.location.href = "/login"; }} style={{ background:"#0369A1", color:"#fff", border:"none", borderRadius:9, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Accedi</button>
          </div>
        ) : notFound || !order ? (
          <div style={{ padding:"50px 20px", textAlign:"center", border:`1px solid ${C.border}`, borderRadius:14 }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>Ordine non trovato</div>
            <div style={{ fontSize:14, color:C.muted, marginBottom:16 }}>L'ordine non esiste o non appartiene alla tua azienda.</div>
            <button onClick={() => { window.location.href = "/ordini"; }} style={{ background:"#0369A1", color:"#fff", border:"none", borderRadius:9, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Vai ai miei ordini</button>
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
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                {/* Thread di messaggistica con contesto ordine: start_or_get_thread
                    deriva le due parti dall'ordine stesso (?order=). */}
                <a href={`/messaggi?order=${order.id}`} style={{ display:"inline-flex", alignItems:"center", gap:6, background:"#fff", color:C.blue, border:`1.5px solid ${C.blue}`, borderRadius:9, padding:"8px 15px", fontSize:13, fontWeight:700, textDecoration:"none", whiteSpace:"nowrap" }}>
                  <MessageCircle size={14}/> {isBuyer ? "Contatta il fornitore" : "Contatta il cliente"}
                </a>
                <span style={{ fontSize:13, fontWeight:800, color:st.fg, background:st.bg, borderRadius:100, padding:"7px 16px" }}>{st.label}</span>
              </div>
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
                {isBuyer && order.status === "pending_payment" && ["escrow_sepa","escrow_premium"].includes(order.payment_method) ? (
                  <div className="od-card" style={{ borderColor:C.blue, background:"#F0F9FF" }}>
                    <div style={{ fontSize:14.5, fontWeight:800, marginBottom:6, display:"flex", alignItems:"center", gap:7 }}><CreditCard size={16} color={C.blue}/> Completa il pagamento in escrow</div>
                    {payinDone ? (
                      <p style={{ fontSize:13, color:C.green, fontWeight:600, lineHeight:1.6 }}>
                        <Check size={14} style={{ verticalAlign:"-2px" }}/> Pagamento inviato. {order.payment_method === "escrow_sepa" ? "L'addebito SEPA richiede alcuni giorni di conferma bancaria: " : ""}l'ordine passerà a "Pagato" alla conferma del gestore di pagamento.
                      </p>
                    ) : payins ? (
                      <EscrowPayinPanel payins={payins} onAllPaid={() => { setPayins(null); setPayinDone(true); }} />
                    ) : (
                      <>
                        <p style={{ fontSize:13, color:C.muted, lineHeight:1.6, marginBottom:14 }}>
                          L'importo di <b className="od-num" style={{ color:C.text }}>{eur(order.grand_total ?? order.goods_subtotal)}</b> (IVA, spedizione e costi di servizio inclusi) viene depositato sul conto escrow di BulkStrike.
                          Il fornitore lo incassa solo dopo la tua conferma di consegna conforme. Se qualcosa va storto, l'importo torna a te.
                        </p>
                        <button onClick={startEscrowPayment} disabled={payinBusy}
                                style={{ background:"#0369A1", color:"#fff", border:"none", borderRadius:10, padding:"13px 24px", fontSize:14, fontWeight:700, cursor:payinBusy?"default":"pointer", opacity:payinBusy?0.6:1, display:"inline-flex", alignItems:"center", gap:8, fontFamily:"Inter,system-ui" }}>
                          {payinBusy ? "Preparazione…" : <>Paga {eur(order.grand_total ?? order.goods_subtotal)} in garanzia <ArrowRight size={15}/></>}
                        </button>
                      </>
                    )}
                  </div>
                ) : isBuyer && order.status === "pending_payment" && (
                  /* pending_payment senza metodo escrow stampato: stato anomalo (il
                     percorso demo è stato rimosso; mark_order_paid_demo è ora solo
                     service_role). Nessuna azione possibile dal buyer. */
                  <div className="od-card" style={{ borderColor:C.blue, background:"#F0F9FF" }}>
                    <div style={{ fontSize:14.5, fontWeight:800, marginBottom:6, display:"flex", alignItems:"center", gap:7 }}><CreditCard size={16} color={C.blue}/> Pagamento in attesa</div>
                    <p style={{ fontSize:13, color:C.muted, lineHeight:1.6 }}>
                      Questo ordine risulta in attesa di pagamento ma non ha un metodo di pagamento associato.
                      Contatta l'assistenza BulkStrike per completarlo.
                    </p>
                  </div>
                )}
                {!isBuyer && order.status === "paid" && (
                  <div className="od-card" style={{ borderColor:C.blue, background:"#F0F9FF" }}>
                    <div style={{ fontSize:14.5, fontWeight:800, marginBottom:6, display:"flex", alignItems:"center", gap:7 }}><Truck size={16} color={C.blue}/> Pagamento in escrow ricevuto — spedisci la merce</div>
                    <p style={{ fontSize:13, color:C.muted, lineHeight:1.6, marginBottom:14 }}>
                      L'acquirente ha versato <b className="od-num" style={{ color:C.text }}>{eur(order.goods_subtotal)}</b> in escrow. Alla partenza della merce conferma la spedizione con i riferimenti del DDT: numero DDT e lotto sono obbligatori (servono al gestionale dell'acquirente per riconciliare il carico con la fattura).
                    </p>
                    {!shipOpen ? (
                      <button onClick={() => setShipOpen(true)} disabled={acting}
                              style={{ background:"#0369A1", color:"#fff", border:"none", borderRadius:10, padding:"13px 24px", fontSize:14, fontWeight:700, cursor:acting?"default":"pointer", opacity:acting?0.6:1, display:"inline-flex", alignItems:"center", gap:8, fontFamily:"Inter,system-ui" }}>
                        Conferma spedizione <Truck size={15}/>
                      </button>
                    ) : (
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                        {[
                          { k:"carrier", label:"Corriere", type:"text", ph:"es. DHL Freight" },
                          { k:"tracking", label:"Numero tracking", type:"text", ph:"es. JD014600003RM" },
                          { k:"ddtNumber", label:"Numero DDT *", type:"text", ph:"es. 2026/00123" },
                          { k:"ddtDate", label:"Data DDT *", type:"date" },
                          { k:"lotNumber", label:"Lotto *", type:"text", ph:"es. L2026-08-A" },
                          { k:"expiryDate", label:"Scadenza lotto", type:"date" },
                          { k:"quantityShipped", label:"Quantità spedita (kg)", type:"number", ph:String(order.quantity_kg || "") },
                        ].map(f => (
                          <label key={f.k} style={{ display:"flex", flexDirection:"column", gap:4, fontSize:12, fontWeight:700, color:C.muted }}>
                            {f.label}
                            <input type={f.type} value={ship[f.k]} onChange={setShipField(f.k)} placeholder={f.ph || ""}
                                   style={{ border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 11px", fontSize:13.5, fontWeight:400, color:C.text, outline:"none", fontFamily:"inherit" }} />
                          </label>
                        ))}
                        <label style={{ display:"flex", flexDirection:"column", gap:4, fontSize:12, fontWeight:700, color:C.muted, gridColumn:"1 / -1" }}>
                          Note
                          <textarea value={ship.notes} onChange={setShipField("notes")} rows={2} placeholder="Note per l'acquirente (facoltative)"
                                    style={{ border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 11px", fontSize:13.5, fontWeight:400, color:C.text, outline:"none", fontFamily:"inherit", resize:"vertical" }} />
                        </label>
                        <div style={{ gridColumn:"1 / -1", display:"flex", gap:10, marginTop:2 }}>
                          <button onClick={submitShipment} disabled={acting}
                                  style={{ background:"#0369A1", color:"#fff", border:"none", borderRadius:10, padding:"12px 22px", fontSize:14, fontWeight:700, cursor:acting?"default":"pointer", opacity:acting?0.6:1, display:"inline-flex", alignItems:"center", gap:8, fontFamily:"inherit" }}>
                            {acting ? "Invio…" : <>Conferma spedizione <Truck size={15}/></>}
                          </button>
                          <button onClick={() => setShipOpen(false)} disabled={acting}
                                  style={{ background:"#fff", color:C.muted, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"12px 18px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
                            Annulla
                          </button>
                        </div>
                      </div>
                    )}
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
                {/* File di carico per il gestionale (DAV-75): CSV/XLSX con
                    numero documento stabile e riferimenti DDT */}
                {isBuyer && ["shipped","delivered","accepted","completed","disputed"].includes(order.status) && (
                  <div className="od-card">
                    <div style={{ fontSize:14.5, fontWeight:800, marginBottom:6, display:"flex", alignItems:"center", gap:7 }}><FileText size={16} color="#0369A1"/> Scarica file di carico per il gestionale</div>
                    <p style={{ fontSize:13, color:C.muted, lineHeight:1.6, marginBottom:12 }}>
                      Una riga pronta per l'import: numero e data DDT per la riconciliazione con la fattura SDI, lotto, scadenza, prezzo e fornitore. Il numero documento è stabile: se reimporti lo stesso file, il gestionale riconosce che è lo stesso carico.
                    </p>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                      <button onClick={() => downloadGoodsReceipt("csv")} disabled={!!grBusy}
                              style={{ background:"#0369A1", color:"#fff", border:"none", borderRadius:9, padding:"11px 18px", fontSize:13.5, fontWeight:700, cursor:grBusy?"default":"pointer", opacity:grBusy?0.6:1, display:"inline-flex", alignItems:"center", gap:7, fontFamily:"inherit" }}>
                        <Download size={14}/> {grBusy === "csv" ? "Preparazione…" : "CSV"}
                      </button>
                      <button onClick={() => downloadGoodsReceipt("xlsx")} disabled={!!grBusy}
                              style={{ background:"#fff", color:"#0369A1", border:"1.5px solid #0369A1", borderRadius:9, padding:"11px 18px", fontSize:13.5, fontWeight:700, cursor:grBusy?"default":"pointer", opacity:grBusy?0.6:1, display:"inline-flex", alignItems:"center", gap:7, fontFamily:"inherit" }}>
                        <Download size={14}/> {grBusy === "xlsx" ? "Preparazione…" : "Excel (XLSX)"}
                      </button>
                    </div>
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
                    <div><div style={{ fontSize:11, color:C.muted }}>Modalità</div><div style={{ fontWeight:600 }}>{order.mode === "instant" ? "Acquisto rapido" : order.mode === "pool" ? "Asta a ribasso" : order.mode}</div></div>
                  </div>
                </div>

                {/* DOCUMENTI PRODOTTO — visibili sia all'acquirente sia al fornitore */}
                <div className="od-card">
                  <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:12, display:"flex", alignItems:"center", gap:7 }}><FileText size={14}/> Documenti prodotto</div>
                  {productDocs.length === 0 ? (
                    <div style={{ fontSize:13, color:C.muted }}>Nessun documento disponibile</div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {productDocs.map((d, i) => (
                        <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
                           style={{ display:"inline-flex", alignItems:"center", gap:8, fontSize:13.5, color:C.blue, fontWeight:600, textDecoration:"none" }}>
                          <Download size={14}/> {d.label}
                          {d.expiry && <span style={{ fontSize:11.5, color:C.muted, fontWeight:400 }}>· scad. {new Date(d.expiry).toLocaleDateString("it-IT")}</span>}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* ETICHETTA QR — solo fornitore */}
                {isSupplier && (
                  <div className="od-card">
                    <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:10, display:"flex", alignItems:"center", gap:7 }}><QrCode size={14}/> Etichetta QR</div>
                    <p style={{ fontSize:13, color:C.muted, lineHeight:1.6, marginBottom:12 }}>Applica questa etichetta sul DDT di spedizione.</p>
                    <button onClick={downloadQr} disabled={qrLoading}
                            style={{ background:"#0369A1", color:"#fff", border:"none", borderRadius:10, padding:"11px 20px", fontSize:13.5, fontWeight:700, cursor:qrLoading?"default":"pointer", opacity:qrLoading?0.6:1, display:"inline-flex", alignItems:"center", gap:8, fontFamily:"Inter,system-ui" }}>
                      <Download size={15}/> {qrLoading ? "Preparazione…" : "Scarica etichetta QR"}
                    </button>
                    {qrErr && <div style={{ fontSize:12.5, color:C.red, marginTop:10 }}>{qrErr}</div>}
                    {qrUrl && <div style={{ marginTop:14 }}><img src={qrUrl} alt="Etichetta QR ordine" style={{ width:150, height:150, border:`1px solid ${C.border}`, borderRadius:10, padding:6, background:"#fff" }}/></div>}
                  </div>
                )}

                {/* NUMERO DI LOTTO — solo fornitore */}
                {isSupplier && (
                  <div className="od-card">
                    <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:10, display:"flex", alignItems:"center", gap:7 }}><Tag size={14}/> Numero di lotto</div>
                    <p style={{ fontSize:13, color:C.muted, lineHeight:1.6, marginBottom:12 }}>Il lotto che indichi qui comparirà nell'email di consegna inviata all'acquirente.</p>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                      <input value={lot} onChange={e => setLot(e.target.value)} placeholder="Es. L2026-0142"
                             style={{ flex:"1 1 200px", minWidth:160, border:`1.5px solid ${C.border}`, borderRadius:8, padding:"10px 12px", fontSize:13.5, outline:"none", fontFamily:"Inter,system-ui" }}/>
                      <button onClick={saveLot} disabled={lotSaving}
                              style={{ background:"#0369A1", color:"#fff", border:"none", borderRadius:10, padding:"11px 20px", fontSize:13.5, fontWeight:700, cursor:lotSaving?"default":"pointer", opacity:lotSaving?0.6:1, display:"inline-flex", alignItems:"center", gap:7, fontFamily:"Inter,system-ui" }}>
                        {lotSaving ? "Salvataggio…" : "Salva lotto"}
                      </button>
                      {lotSaved && <span style={{ fontSize:13, color:C.green, fontWeight:700, display:"inline-flex", alignItems:"center", gap:5 }}><Check size={15}/> Salvato</span>}
                    </div>
                  </div>
                )}

                {/* ADMIN — email dell'ordine (reinvio) */}
                {isAdmin && (
                  <div className="od-card" style={{ borderColor:C.purple, background:"#FAF5FF" }}>
                    <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.purple, marginBottom:10, display:"flex", alignItems:"center", gap:7 }}><Mail size={14}/> Admin · Email dell'ordine</div>
                    {orderEmails.length === 0 ? (
                      <div style={{ fontSize:13, color:C.muted }}>Nessuna email registrata per questo ordine.</div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {orderEmails.map(row => (
                          <div key={row.id} style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", border:`1px solid ${C.border}`, borderRadius:9, padding:"9px 11px", background:"#fff" }}>
                            <div style={{ flex:1, minWidth:180 }}>
                              <div style={{ fontSize:13, fontWeight:700 }}>{row.subject || row.kind}</div>
                              <div style={{ fontSize:11.5, color:C.muted }}>
                                <span className="od-num">{row.kind}</span> · {row.status}
                                {row.created_at && <> · {new Date(row.created_at).toLocaleString("it-IT")}</>}
                              </div>
                            </div>
                            <button onClick={() => resendEmail(row)}
                                    style={{ background:"transparent", color:C.purple, border:`1.5px solid ${C.purple}`, borderRadius:8, padding:"7px 13px", fontSize:12.5, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6, fontFamily:"Inter,system-ui" }}>
                              <RefreshCw size={13}/> Reinvia
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {order.shipping_address && (
                  <div className="od-card">
                    <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:10, display:"flex", alignItems:"center", gap:7 }}><MapPin size={14}/> Indirizzo di consegna</div>
                    <div style={{ fontSize:13.5, fontWeight:600 }}>{order.shipping_address}</div>
                    {order.shipping_notes && <div style={{ fontSize:12.5, color:C.muted, marginTop:6 }}>{order.shipping_notes}</div>}
                  </div>
                )}

                {/* PAGAMENTO — dipende dal metodo scelto al checkout (order.payment_method).
                    NB: get_order_detail deve esporre payment_method (e terms_days): finché
                    non lo fa, questa sezione resta nascosta e nulla si rompe. */}
                {order.payment_method && (
                  <div className="od-card">
                    <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:12, display:"flex", alignItems:"center", gap:7 }}><CreditCard size={14}/> Pagamento</div>

                    {order.payment_method === "bonifico_anticipato" && (
                      <div>
                        <div style={{ fontSize:14, fontWeight:700, marginBottom:6, display:"flex", alignItems:"center", gap:7 }}><Landmark size={15} color={C.blue}/> Dati per il bonifico</div>
                        {!iban ? (
                          <>
                            <p style={{ fontSize:13, color:C.muted, lineHeight:1.6, marginBottom:12 }}>
                              I dati bancari del fornitore sono visibili solo qui, in area riservata, e solo a te acquirente dell'ordine.
                            </p>
                            <button onClick={revealIban} disabled={ibanLoading}
                                    style={{ background:"#0369A1", color:"#fff", border:"none", borderRadius:10, padding:"11px 20px", fontSize:13.5, fontWeight:700, cursor:ibanLoading?"default":"pointer", opacity:ibanLoading?0.6:1, display:"inline-flex", alignItems:"center", gap:7, fontFamily:"Inter,system-ui" }}>
                              <Lock size={14}/> {ibanLoading ? "Carico…" : "Mostra IBAN del fornitore"}
                            </button>
                            {ibanErr && <div style={{ fontSize:12.5, color:C.red, marginTop:10 }}>{ibanErr}</div>}
                          </>
                        ) : (
                          <div>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:12, marginBottom:12 }}>
                              <div>
                                <div style={{ fontSize:11, color:C.muted }}>Intestatario</div>
                                <div style={{ fontSize:14, fontWeight:600 }}>{iban.iban_holder || "—"}</div>
                              </div>
                              <div>
                                <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>IBAN</div>
                                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                  <span className="od-num" style={{ fontSize:14, fontWeight:700, userSelect:"text" }}>{iban.iban || "—"}</span>
                                  {iban.iban && <CopyButton value={iban.iban}/>}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>BIC / SWIFT</div>
                                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                  <span className="od-num" style={{ fontSize:14, fontWeight:700, userSelect:"text" }}>{iban.bic || "—"}</span>
                                  {iban.bic && <CopyButton value={iban.bic}/>}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize:11, color:C.muted }}>Importo del bonifico</div>
                                <div className="od-num" style={{ fontSize:16, fontWeight:800, color:C.blue }}>{eur(iban.amount)}</div>
                              </div>
                            </div>
                            <div style={{ fontSize:12, color:C.muted, background:C.bg, borderRadius:8, padding:"10px 12px", lineHeight:1.6 }}>
                              Questi dati sono visibili solo qui, in area riservata. Non li inviamo mai via email o chat.
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {order.payment_method === "termini_dilazionati" && (
                      <div style={{ fontSize:13.5, color:C.muted, lineHeight:1.6 }}>
                        Pagamento dilazionato a <b style={{ color:C.text }}>{order.terms_days}</b> giorni — nessun pagamento immediato.
                      </div>
                    )}

                    {["escrow_sepa","escrow_premium"].includes(order.payment_method) && (
                      <div style={{ fontSize:13.5, color:C.muted, lineHeight:1.6, display:"flex", alignItems:"flex-start", gap:8 }}>
                        <ShieldCheck size={15} color={C.green} style={{ marginTop:1, flexShrink:0 }}/>
                        <span>Pagamento in garanzia (deposito su BulkStrike).</span>
                      </div>
                    )}
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

                  {/* Costi di servizio (es. "Costi di servizio escrow" €0,35) — voci accessorie
                      su order_service_charges NON incluse in total_amount. Il totale finale
                      mostrato al cliente è grand_total (total_amount + service charges). */}
                  {Array.isArray(order.service_charges) && order.service_charges.length > 0 && (
                    <>
                      {order.service_charges.map((sc, i) => (
                        <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginTop:8, gap:10 }}>
                          <span style={{ color:C.muted }}>{sc.service_name}</span>
                          <span className="od-num" style={{ fontWeight:600, whiteSpace:"nowrap" }}>{eur(sc.fee)}</span>
                        </div>
                      ))}
                      <div style={{ borderTop:`1px solid ${C.border}`, margin:"12px 0 0", paddingTop:12, display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                        <span style={{ fontSize:14, fontWeight:700 }}>Totale finale</span>
                        <span className="od-num" style={{ fontSize:22, fontWeight:800, color:C.text }}>{eur(order.grand_total ?? order.total_amount)}</span>
                      </div>
                    </>
                  )}
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
