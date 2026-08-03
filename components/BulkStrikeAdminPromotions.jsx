"use client";
// BulkStrikeAdminPromotions — pannello admin "Promozioni da approvare"
// (/admin/promozioni). Lista minimale delle promozioni in attesa di revisione
// (DAV-76): prodotto, fornitore, prezzo, sconto% → Approva / Rifiuta.
import { useState, useEffect } from "react";
import { Check, X, Tag, AlertTriangle } from "lucide-react";
import {
  getSession, getMyCompany,
  adminListPendingPromotions, approvePromotion, rejectPromotion, promotionErrorMessage,
} from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";

const C = { blue:"#0EA5E9", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706" };
const eur = (n) => n == null ? "—" : "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });
const kg = (n) => n == null ? "illimitata" : Number(n).toLocaleString("it-IT") + " kg";
const dt = (iso) => iso ? new Date(iso).toLocaleDateString("it-IT", { day:"2-digit", month:"2-digit", year:"numeric" }) : "—";
const windowLabel = (n) => Number(n) >= 180 ? "ultimi 6 mesi" : `ultimi ${n} ${Number(n) === 1 ? "giorno" : "giorni"}`;

export default function AdminPromotionsPage({ inShell = false }) {
  const [loading, setLoading] = useState(true);
  const [notAdmin, setNotAdmin] = useState(false);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // id in fase di rifiuto
  const [reason, setReason] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    const session = await getSession().catch(() => null);
    if (!session) { setNotAdmin(true); setLoading(false); return; }
    const co = await getMyCompany().catch(() => null);
    if (!co?.is_platform_admin) { setNotAdmin(true); setLoading(false); return; }
    try { setRows(await adminListPendingPromotions()); }
    catch (e) { setErr(promotionErrorMessage(e)); }
    setLoading(false);
  }

  async function doApprove(id) {
    setBusyId(id); setErr("");
    try { await approvePromotion(id); await load(); }
    catch (e) { setErr(promotionErrorMessage(e)); }
    setBusyId(null);
  }

  async function doReject(id) {
    setBusyId(id); setErr("");
    try { await rejectPromotion(id, reason); setRejecting(null); setReason(""); await load(); }
    catch (e) { setErr(promotionErrorMessage(e)); }
    setBusyId(null);
  }

  const Body = (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: inShell ? 0 : "0 20px" }}>
      <h1 style={{ fontSize:26, fontWeight:800, color:C.text, margin:"0 0 6px" }}>Promozioni da approvare</h1>
      <p style={{ fontSize:14, color:C.muted, marginBottom:20 }}>Revisiona gli sconti a tempo proposti dai fornitori prima della pubblicazione nella Bacheca Promozioni.</p>

      {err && <div style={{ background:"#FEF2F2", color:C.red, border:"1px solid #FECACA", borderRadius:10, padding:"10px 14px", fontSize:14, marginBottom:16 }}>{err}</div>}

      {loading ? (
        <div style={{ color:C.muted, fontSize:14 }}>Carico…</div>
      ) : rows.length === 0 ? (
        <div style={{ border:`1px dashed ${C.border}`, borderRadius:16, padding:"36px 24px", textAlign:"center", color:C.muted }}>
          <Check size={26} style={{ color:C.green }} />
          <div style={{ fontSize:16, fontWeight:700, color:C.text, margin:"10px 0 4px" }}>Nessuna promozione in attesa</div>
          <div style={{ fontSize:14 }}>Tutte le richieste sono state gestite.</div>
        </div>
      ) : (
        <div style={{ display:"grid", gap:12 }}>
          {rows.map((p) => (
            <div key={p.id} style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
                <div style={{ minWidth:220 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:4, background:"#FFF7ED", color:C.amber, border:"1px solid #FED7AA", borderRadius:4, padding:"2px 7px", fontSize:11, fontWeight:800 }}><Tag size={11}/> PROMO</span>
                    <strong style={{ fontSize:15, color:C.text }}>{p.product_name}</strong>
                  </div>
                  <div style={{ fontSize:13, color:C.muted }}>di {p.supplier_name}</div>
                  <div style={{ fontSize:13, color:C.muted, marginTop:2 }}>{dt(p.starts_at)} → {dt(p.ends_at)} · quantità {kg(p.available_kg)}</div>
                </div>
                <div style={{ display:"flex", gap:22, flexWrap:"wrap", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:11, color:C.muted }}>Prezzo promo</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:700, color:C.amber }}>{eur(p.discounted_price_per_kg)}/kg</div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:C.muted }}>Sconto</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:700, color:C.green }}>-{p.discount_percent}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:C.muted }}>Rif. mercato</div>
                    <div style={{ fontSize:13, color:C.text }}>{eur(p.base_price_reference)}/kg <span style={{ color:C.muted, fontSize:11 }}>({windowLabel(p.base_price_window_days)})</span></div>
                  </div>
                </div>
              </div>

              {rejecting === p.id ? (
                <div style={{ marginTop:14, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo del rifiuto (opzionale)"
                    style={{ flex:1, minWidth:220, padding:"9px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14 }} />
                  <button onClick={() => doReject(p.id)} disabled={busyId === p.id}
                    style={{ background:C.red, color:"#fff", border:"none", borderRadius:8, padding:"9px 16px", fontSize:14, fontWeight:700, cursor:"pointer" }}>Conferma rifiuto</button>
                  <button onClick={() => { setRejecting(null); setReason(""); }}
                    style={{ background:"none", color:C.muted, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 16px", fontSize:14, cursor:"pointer" }}>Annulla</button>
                </div>
              ) : (
                <div style={{ marginTop:14, display:"flex", gap:10 }}>
                  <button onClick={() => doApprove(p.id)} disabled={busyId === p.id}
                    style={{ background:C.green, color:"#fff", border:"none", borderRadius:8, padding:"9px 18px", fontSize:14, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
                    <Check size={15}/> {busyId === p.id ? "…" : "Approva"}
                  </button>
                  <button onClick={() => { setRejecting(p.id); setReason(""); }} disabled={busyId === p.id}
                    style={{ background:"#fff", color:C.red, border:`1px solid #FECACA`, borderRadius:8, padding:"9px 18px", fontSize:14, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
                    <X size={15}/> Rifiuta
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (notAdmin) {
    return <div style={{ padding:40, textAlign:"center", color:C.muted }}><AlertTriangle size={22} style={{ color:C.amber }} /><div style={{ marginTop:8 }}>Sezione riservata agli amministratori.</div></div>;
  }
  if (inShell) return Body;
  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif", color:C.text }}>
      <BulkStrikeNav />
      <div style={{ padding:"28px 0 60px" }}>{Body}</div>
    </div>
  );
}
