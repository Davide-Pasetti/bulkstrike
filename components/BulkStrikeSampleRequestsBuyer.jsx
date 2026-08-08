"use client";
// BulkStrikeSampleRequestsBuyer — pannello acquirente "I miei campioni"
// (/le-mie-richieste-campioni). Due sezioni: le RICHIESTE di campionatura
// inviate ai fornitori, e gli ORDINI CAMPIONE (solo spedizione + IVA) generati
// quando un fornitore accetta e addebita la spedizione al cliente.
import { useState, useEffect } from "react";
import { Beaker, X, Truck, CreditCard } from "lucide-react";
import { getSession, getMySampleRequests, getMySampleOrders, updateSampleRequest, sampleErrorMessage } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import EscrowPayinPanel from "@/components/checkout/EscrowPayinPanel";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706", wine:"#9D174D" };
const dt = (iso) => iso ? new Date(iso).toLocaleDateString("it-IT", { day:"2-digit", month:"2-digit", year:"numeric" }) : "—";
const litri = (n) => `${Number(n).toLocaleString("it-IT", { minimumFractionDigits:0, maximumFractionDigits:2 })} l`;
const eur = (n) => n == null ? "—" : "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });

const STATUS = {
  pending:   { label:"In attesa di risposta", bg:"#FFFBEB", fg:C.amber },
  accepted:  { label:"Accettata — campione in preparazione", bg:"#EFF6FF", fg:"#1D4ED8" },
  shipped:   { label:"Spedita", bg:"#ECFDF5", fg:C.green },
  declined:  { label:"Rifiutata", bg:"#FEF2F2", fg:C.red },
  cancelled: { label:"Annullata", bg:"#F1F5F9", fg:C.muted },
};
const STATUS_ORDINE = {
  pending_payment: { label:"Da pagare", bg:"#FFFBEB", fg:C.amber },
  paid:            { label:"Pagato", bg:"#EFF6FF", fg:"#1D4ED8" },
  shipped:         { label:"Spedito", bg:"#ECFDF5", fg:C.green },
  delivered:       { label:"Consegnato", bg:"#ECFDF5", fg:C.green },
  completed:       { label:"Completato", bg:"#ECFDF5", fg:C.green },
  cancelled:       { label:"Annullato", bg:"#F1F5F9", fg:C.muted },
};
function Badge({ status, map = STATUS }) {
  const s = map[status] || { label:status, bg:"#F1F5F9", fg:C.muted };
  return <span style={{ background:s.bg, color:s.fg, borderRadius:6, padding:"3px 9px", fontSize:12, fontWeight:700 }}>{s.label}</span>;
}

export default function SampleRequestsBuyerPage({ inShell = false }) {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [rows, setRows] = useState([]);       // richieste (role buyer)
  const [orders, setOrders] = useState([]);   // ordini campione (role buyer)
  const [tab, setTab] = useState("richieste");
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  // pagamento
  const [payOrderId, setPayOrderId] = useState(null);
  const [payins, setPayins] = useState(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState("");
  const [paidOk, setPaidOk] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    const session = await getSession().catch(() => null);
    if (!session) { setNeedLogin(true); setLoading(false); return; }
    try {
      const [reqs, ords] = await Promise.all([getMySampleRequests(), getMySampleOrders().catch(() => [])]);
      setRows(reqs.filter((r) => r.role === "buyer"));
      setOrders((ords || []).filter((o) => o.role === "buyer"));
    } catch (e) { setErr(sampleErrorMessage(e)); }
    setLoading(false);
  }
  async function cancel(id) {
    setBusyId(id); setErr("");
    try { await updateSampleRequest(id, { status:"cancelled" }); await load(); }
    catch (e) { setErr(sampleErrorMessage(e)); }
    setBusyId(null);
  }
  async function startPayment(orderId) {
    setPayBusy(true); setPayErr(""); setPayins(null); setPaidOk(false); setPayOrderId(orderId);
    try {
      const r = await fetch("/api/stripe/create-payin", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ orderIds:[orderId] }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.payins?.length) throw new Error(data.error || "Creazione del pagamento non riuscita.");
      setPayins(data.payins);
    } catch (e) { setPayErr(String(e?.message || e)); }
    finally { setPayBusy(false); }
  }

  const daPagare = orders.filter((o) => o.status === "pending_payment").length;

  const Tabs = (
    <div style={{ display:"flex", gap:8, marginBottom:18, borderBottom:`1px solid ${C.border}` }}>
      {[["richieste", "Richieste", rows.length], ["ordini", "Ordini campione", orders.length]].map(([k, l, n]) => (
        <button key={k} onClick={() => setTab(k)} style={{
          background:"none", border:"none", borderBottom:`2px solid ${tab===k?C.wine:"transparent"}`,
          color:tab===k?C.text:C.muted, fontWeight:700, fontSize:14, padding:"8px 4px", cursor:"pointer", marginBottom:-1,
          display:"inline-flex", alignItems:"center", gap:7 }}>
          {l} <span style={{ fontSize:11, fontWeight:700, background:tab===k?"#FDF2F8":C.bg, color:tab===k?C.wine:C.muted, borderRadius:999, padding:"1px 7px" }}>{n}</span>
          {k==="ordini" && daPagare>0 && <span style={{ fontSize:10, fontWeight:800, background:C.amber, color:"#fff", borderRadius:999, padding:"1px 6px" }}>{daPagare} da pagare</span>}
        </button>
      ))}
    </div>
  );

  const Richieste = rows.length === 0 ? (
    <div style={{ border:`1px dashed ${C.border}`, borderRadius:16, padding:"36px 24px", textAlign:"center", color:C.muted }}>
      <Beaker size={26} style={{ color:C.wine }} />
      <div style={{ fontSize:16, fontWeight:700, color:C.text, margin:"10px 0 4px" }}>Nessuna richiesta</div>
      <div style={{ fontSize:14 }}>Trova un prodotto a catalogo e richiedi un campione.</div>
    </div>
  ) : (
    <div style={{ display:"grid", gap:12 }}>
      {rows.map((r) => (
        <div key={r.id} style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:16, display:"flex", justifyContent:"space-between", gap:14, flexWrap:"wrap", alignItems:"flex-start" }}>
          <div style={{ minWidth:220 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:3 }}>
              <strong style={{ fontSize:15, color:C.text }}>{r.product_name || "Prodotto"}</strong>
              <Badge status={r.status} />
            </div>
            <div style={{ fontSize:13, color:C.muted }}>
              <b style={{ color:C.text, fontWeight:600 }}>{r.counterpart_name || "Fornitore"}</b>
              {(r.counterpart_city || r.counterpart_region) && <span> · {[r.counterpart_city, r.counterpart_region].filter(Boolean).join(", ")}</span>}
              {r.quantity_l != null && <span> · {litri(r.quantity_l)}</span>} · richiesto il {dt(r.created_at)}
            </div>
            {r.status === "declined" && r.decline_reason && <div style={{ fontSize:12.5, color:C.red, marginTop:6 }}>Motivo: {r.decline_reason}</div>}
            {r.status === "shipped" && r.tracking_note && <div style={{ fontSize:12.5, color:C.green, marginTop:6 }}>Tracking: {r.tracking_note}</div>}
          </div>
          {r.status === "pending" && (
            <button onClick={() => cancel(r.id)} disabled={busyId === r.id}
              style={{ background:"#fff", color:C.muted, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:600, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
              <X size={14}/> {busyId === r.id ? "…" : "Annulla richiesta"}
            </button>
          )}
        </div>
      ))}
    </div>
  );

  const Ordini = orders.length === 0 ? (
    <div style={{ border:`1px dashed ${C.border}`, borderRadius:16, padding:"36px 24px", textAlign:"center", color:C.muted }}>
      <Truck size={26} style={{ color:C.wine }} />
      <div style={{ fontSize:16, fontWeight:700, color:C.text, margin:"10px 0 4px" }}>Nessun ordine campione</div>
      <div style={{ fontSize:14 }}>Se un fornitore accetta e addebita la spedizione, l'ordine da pagare comparirà qui.</div>
    </div>
  ) : (
    <div style={{ display:"grid", gap:12 }}>
      {orders.map((o) => (
        <div key={o.id} style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginBottom:6 }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <strong style={{ fontSize:15, color:C.text }}>{o.product_name || "Campione"}</strong>
                <Badge status={o.status} map={STATUS_ORDINE} />
              </div>
              <div style={{ fontSize:13, color:C.muted, marginTop:3 }}>
                <b style={{ color:C.text, fontWeight:600 }}>{o.counterpart_name || "Fornitore"}</b>
                {o.corriere && <span> · {o.corriere}</span>} · creato il {dt(o.created_at)}
              </div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div className="bs-num" style={{ fontSize:17, fontWeight:800, color:C.text, fontFamily:"'JetBrains Mono',ui-monospace,monospace" }}>{eur(o.totale)}</div>
              <div style={{ fontSize:11, color:C.muted }}>spedizione {eur(o.spedizione)} + IVA {eur(o.iva)}</div>
            </div>
          </div>
          {o.shipping_address && <div style={{ fontSize:12.5, color:C.muted, marginBottom:8 }}>Spedizione a: {o.shipping_address}</div>}

          {o.status === "pending_payment" && (
            payOrderId === o.id && payins ? (
              <EscrowPayinPanel payins={payins} onAllPaid={() => { setPayins(null); setPayOrderId(null); setPaidOk(true); load(); }} />
            ) : payOrderId === o.id && paidOk ? (
              <div style={{ fontSize:13, color:C.green, fontWeight:600 }}>Pagamento inviato. L'ordine passerà a “Pagato” alla conferma.</div>
            ) : (
              <>
                <button onClick={() => startPayment(o.id)} disabled={payBusy}
                  style={{ background:"#0369A1", color:"#fff", border:"none", borderRadius:9, padding:"11px 20px", fontSize:14, fontWeight:700, cursor:payBusy?"default":"pointer", opacity:payBusy?0.6:1, display:"inline-flex", alignItems:"center", gap:8 }}>
                  <CreditCard size={15}/> {payBusy && payOrderId === o.id ? "Preparazione…" : `Paga la spedizione (${eur(o.totale)})`}
                </button>
                {payOrderId === o.id && payErr && <div style={{ marginTop:8, fontSize:13, color:C.red }}>{payErr}</div>}
              </>
            )
          )}
        </div>
      ))}
    </div>
  );

  const Body = (
    <div style={{ maxWidth:1000, margin:"0 auto", padding: inShell ? 0 : "0 20px" }}>
      <h1 style={{ fontSize:26, fontWeight:800, color:C.text, margin:"0 0 6px" }}>I miei campioni</h1>
      <p style={{ fontSize:14, color:C.muted, marginBottom:20 }}>Le richieste di campione inviate ai fornitori e gli ordini di sola spedizione da pagare.</p>
      {err && <div style={{ background:"#FEF2F2", color:C.red, border:"1px solid #FECACA", borderRadius:10, padding:"10px 14px", fontSize:14, marginBottom:16 }}>{err}</div>}
      {loading ? <div style={{ color:C.muted, fontSize:14 }}>Carico…</div> : (<>
        {Tabs}
        {tab === "richieste" ? Richieste : Ordini}
      </>)}
    </div>
  );

  if (needLogin) return <div style={{ padding:40, textAlign:"center" }}>Devi <a href="/auth/login" style={{ color:C.blue }}>accedere</a> per vedere i tuoi campioni.</div>;
  if (inShell) return Body;
  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif", color:C.text }}>
      <BulkStrikeNav />
      <div style={{ padding:"28px 0 60px" }}>{Body}</div>
    </div>
  );
}
