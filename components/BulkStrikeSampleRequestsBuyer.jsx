"use client";
// BulkStrikeSampleRequestsBuyer — pannello acquirente "Le mie richieste di
// campionatura" (/le-mie-richieste-campioni, DAV-77). Sola lettura, tranne
// l'annullamento di una richiesta ancora in attesa.
import { useState, useEffect } from "react";
import { Beaker, X } from "lucide-react";
import { getSession, getMySampleRequests, updateSampleRequest, sampleErrorMessage } from "@/lib/api";
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

export default function SampleRequestsBuyerPage({ inShell = false }) {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => { load(); }, []);
  async function load() {
    const session = await getSession().catch(() => null);
    if (!session) { setNeedLogin(true); setLoading(false); return; }
    try { const all = await getMySampleRequests(); setRows(all.filter((r) => r.role === "buyer")); }
    catch (e) { setErr(sampleErrorMessage(e)); }
    setLoading(false);
  }
  async function cancel(id) {
    setBusyId(id); setErr("");
    try { await updateSampleRequest(id, { status:"cancelled" }); await load(); }
    catch (e) { setErr(sampleErrorMessage(e)); }
    setBusyId(null);
  }

  const Body = (
    <div style={{ maxWidth:1000, margin:"0 auto", padding: inShell ? 0 : "0 20px" }}>
      <h1 style={{ fontSize:26, fontWeight:800, color:C.text, margin:"0 0 6px" }}>Le mie richieste di campionatura</h1>
      <p style={{ fontSize:14, color:C.muted, marginBottom:20 }}>I campioni di vini e mosti sfusi che hai richiesto ai fornitori.</p>
      {err && <div style={{ background:"#FEF2F2", color:C.red, border:"1px solid #FECACA", borderRadius:10, padding:"10px 14px", fontSize:14, marginBottom:16 }}>{err}</div>}

      {loading ? <div style={{ color:C.muted, fontSize:14 }}>Carico…</div>
      : rows.length === 0 ? (
        <div style={{ border:`1px dashed ${C.border}`, borderRadius:16, padding:"36px 24px", textAlign:"center", color:C.muted }}>
          <Beaker size={26} style={{ color:C.wine }} />
          <div style={{ fontSize:16, fontWeight:700, color:C.text, margin:"10px 0 4px" }}>Nessuna richiesta</div>
          <div style={{ fontSize:14 }}>Trova un vino o mosto sfuso a catalogo e richiedi un campione.</div>
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
                  {" "}· {litri(r.quantity_l)} · richiesto il {dt(r.created_at)}
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
      )}
    </div>
  );

  if (needLogin) return <div style={{ padding:40, textAlign:"center" }}>Devi <a href="/auth/login" style={{ color:C.blue }}>accedere</a> per vedere le tue richieste.</div>;
  if (inShell) return Body;
  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif", color:C.text }}>
      <BulkStrikeNav />
      <div style={{ padding:"28px 0 60px" }}>{Body}</div>
    </div>
  );
}
