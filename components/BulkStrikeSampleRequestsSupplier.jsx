"use client";
// BulkStrikeSampleRequestsSupplier — pannello fornitore "Richieste di campionatura"
// (/le-mie-campionature, DAV-77). Elenco delle richieste ricevute; il fornitore
// accetta/rifiuta (con motivo) o segna come spedito (con nota di tracking). Le
// date le stampiglia il DB; ogni cambio di stato invia l'email all'acquirente.
import { useState, useEffect } from "react";
import { Check, X, Beaker, Truck, AlertTriangle, MapPin } from "lucide-react";
import { getSession, getMyCompany, getMySampleRequests, updateSampleRequest, sampleErrorMessage } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";

const C = { blue:"#0EA5E9", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706", wine:"#9D174D" };
const dt = (iso) => iso ? new Date(iso).toLocaleDateString("it-IT", { day:"2-digit", month:"2-digit", year:"numeric" }) : "—";
const litri = (n) => `${Number(n).toLocaleString("it-IT", { minimumFractionDigits:0, maximumFractionDigits:2 })} l`;

const STATUS = {
  pending:   { label:"In attesa di risposta", bg:"#FFFBEB", fg:C.amber },
  accepted:  { label:"Accettata — campione in preparazione", bg:"#EFF6FF", fg:"#1D4ED8" },
  shipped:   { label:"Spedita", bg:"#ECFDF5", fg:C.green },
  declined:  { label:"Rifiutata", bg:"#FEF2F2", fg:C.red },
  cancelled: { label:"Annullata", bg:"#F1F5F9", fg:C.muted },
};
function Badge({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return <span style={{ background:s.bg, color:s.fg, borderRadius:6, padding:"3px 9px", fontSize:12, fontWeight:700 }}>{s.label}</span>;
}

export default function SampleRequestsSupplierPage({ inShell = false }) {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [notSupplier, setNotSupplier] = useState(false);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [mode, setMode] = useState(null); // { id, kind:'decline'|'ship' }
  const [text, setText] = useState("");

  useEffect(() => { load(); }, []);
  async function load() {
    const session = await getSession().catch(() => null);
    if (!session) { setNeedLogin(true); setLoading(false); return; }
    const co = await getMyCompany().catch(() => null);
    if (!co?.is_supplier) { setNotSupplier(true); setLoading(false); return; }
    try { const all = await getMySampleRequests(); setRows(all.filter((r) => r.role === "supplier")); }
    catch (e) { setErr(sampleErrorMessage(e)); }
    setLoading(false);
  }
  async function act(id, patch) {
    setBusyId(id); setErr("");
    try { await updateSampleRequest(id, patch); setMode(null); setText(""); await load(); }
    catch (e) { setErr(sampleErrorMessage(e)); }
    setBusyId(null);
  }

  const Body = (
    <div style={{ maxWidth:1000, margin:"0 auto", padding: inShell ? 0 : "0 20px" }}>
      <h1 style={{ fontSize:26, fontWeight:800, color:C.text, margin:"0 0 6px" }}>Richieste di campionatura</h1>
      <p style={{ fontSize:14, color:C.muted, marginBottom:20 }}>Le richieste di campione ricevute sui tuoi vini e mosti sfusi. Rispondi o segna la spedizione: l'acquirente riceve una email a ogni aggiornamento.</p>
      {err && <div style={{ background:"#FEF2F2", color:C.red, border:"1px solid #FECACA", borderRadius:10, padding:"10px 14px", fontSize:14, marginBottom:16 }}>{err}</div>}

      {loading ? <div style={{ color:C.muted, fontSize:14 }}>Carico…</div>
      : rows.length === 0 ? (
        <div style={{ border:`1px dashed ${C.border}`, borderRadius:16, padding:"36px 24px", textAlign:"center", color:C.muted }}>
          <Beaker size={26} style={{ color:C.wine }} />
          <div style={{ fontSize:16, fontWeight:700, color:C.text, margin:"10px 0 4px" }}>Nessuna richiesta</div>
          <div style={{ fontSize:14 }}>Le richieste di campionatura compariranno qui.</div>
        </div>
      ) : (
        <div style={{ display:"grid", gap:12 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginBottom:8 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                    <strong style={{ fontSize:15, color:C.text }}>{r.product_name || "Prodotto"}</strong>
                    <Badge status={r.status} />
                  </div>
                  <div style={{ fontSize:13, color:C.muted, marginTop:3 }}>
                    <b style={{ color:C.text, fontWeight:600 }}>{r.counterpart_name || "Azienda acquirente"}</b>
                    {(r.counterpart_city || r.counterpart_region) && <span> · {[r.counterpart_city, r.counterpart_region].filter(Boolean).join(", ")}</span>}
                    {" "}· richiesti <b style={{ color:C.text }}>{litri(r.quantity_l)}</b> · {dt(r.created_at)}
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", gap:6, fontSize:13, color:C.text, marginBottom:8, alignItems:"flex-start" }}>
                <MapPin size={14} style={{ color:C.muted, flexShrink:0, marginTop:2 }} />
                <span>{r.shipping_address}</span>
              </div>
              {r.message && <div style={{ fontSize:13, color:C.muted, fontStyle:"italic", marginBottom:8 }}>“{r.message}”</div>}
              {r.status === "declined" && r.decline_reason && <div style={{ fontSize:12.5, color:C.red, marginBottom:8 }}>Motivo del rifiuto: {r.decline_reason}</div>}
              {r.status === "shipped" && r.tracking_note && <div style={{ fontSize:12.5, color:C.green, marginBottom:8 }}>Tracking: {r.tracking_note}</div>}

              {mode?.id === r.id ? (
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginTop:6 }}>
                  <input value={text} onChange={(e) => setText(e.target.value)} placeholder={mode.kind === "decline" ? "Motivo del rifiuto (obbligatorio)" : "Corriere e n° spedizione (facoltativo)"}
                    style={{ flex:1, minWidth:220, padding:"9px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14 }} />
                  {mode.kind === "decline" ? (
                    <button onClick={() => { if (!text.trim()) { setErr("Indica il motivo del rifiuto."); return; } act(r.id, { status:"declined", decline_reason:text.trim() }); }} disabled={busyId === r.id}
                      style={{ background:C.red, color:"#fff", border:"none", borderRadius:8, padding:"9px 16px", fontSize:14, fontWeight:700, cursor:"pointer" }}>Conferma rifiuto</button>
                  ) : (
                    <button onClick={() => act(r.id, { status:"shipped", tracking_note:text.trim() || null })} disabled={busyId === r.id}
                      style={{ background:C.green, color:"#fff", border:"none", borderRadius:8, padding:"9px 16px", fontSize:14, fontWeight:700, cursor:"pointer" }}>Conferma spedizione</button>
                  )}
                  <button onClick={() => { setMode(null); setText(""); }} style={{ background:"none", color:C.muted, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 16px", fontSize:14, cursor:"pointer" }}>Annulla</button>
                </div>
              ) : r.status === "pending" ? (
                <div style={{ display:"flex", gap:10, marginTop:6 }}>
                  <button onClick={() => act(r.id, { status:"accepted" })} disabled={busyId === r.id}
                    style={{ background:C.green, color:"#fff", border:"none", borderRadius:8, padding:"9px 18px", fontSize:14, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}><Check size={15}/> Accetta</button>
                  <button onClick={() => { setMode({ id:r.id, kind:"decline" }); setText(""); setErr(""); }} disabled={busyId === r.id}
                    style={{ background:"#fff", color:C.red, border:"1px solid #FECACA", borderRadius:8, padding:"9px 18px", fontSize:14, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}><X size={15}/> Rifiuta</button>
                </div>
              ) : r.status === "accepted" ? (
                <div style={{ marginTop:6 }}>
                  <button onClick={() => { setMode({ id:r.id, kind:"ship" }); setText(""); setErr(""); }} disabled={busyId === r.id}
                    style={{ background:C.wine, color:"#fff", border:"none", borderRadius:8, padding:"9px 18px", fontSize:14, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}><Truck size={15}/> Segna come spedito</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (needLogin) return <div style={{ padding:40, textAlign:"center" }}>Devi <a href="/auth/login" style={{ color:C.blue }}>accedere</a> per vedere le richieste.</div>;
  if (notSupplier) return <div style={{ padding:40, textAlign:"center", color:C.muted }}>Sezione riservata ai fornitori.</div>;
  if (inShell) return Body;
  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif", color:C.text }}>
      <BulkStrikeNav />
      <div style={{ padding:"28px 0 60px" }}>{Body}</div>
    </div>
  );
}
