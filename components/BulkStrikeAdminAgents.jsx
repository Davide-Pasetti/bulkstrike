"use client";
// BulkStrikeAdminAgents — pannello admin "Agenti di vendita".
// Due tabelle: i legami agente↔fornitore (con possibilità di forzare lo stato
// quando qualcosa si blocca) e le provvigioni indicative maturate sugli ordini.
// Le provvigioni sono SOLA CONSULTAZIONE: BulkStrike non le incassa né le paga.
import { useEffect, useState } from "react";
import { UserCheck, Euro, AlertTriangle } from "lucide-react";
import { getMyCompany, adminListAgents, adminSetAgentZone, adminAssignCommission, agentErrorMessage } from "@/lib/api";
import BulkStrikeProfileShell from "@/components/BulkStrikeProfileShell";

const C = { blue:"#0EA5E9", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706" };
const dt = (iso) => iso ? new Date(iso).toLocaleDateString("it-IT", { day:"2-digit", month:"2-digit", year:"2-digit" }) : "—";
const eur = (n) => n == null ? "—" : Number(n).toLocaleString("it-IT", { style:"currency", currency:"EUR" });
const STATO = {
  in_attesa:   { label:"Da confermare", bg:"#FFFBEB", fg:C.amber },
  confermato:  { label:"Confermato",    bg:"#ECFDF5", fg:C.green },
  rifiutato:   { label:"Rifiutato",     bg:"#FEF2F2", fg:C.red },
  disattivato: { label:"Disattivato",   bg:"#F1F5F9", fg:C.muted },
};

export default function AdminAgentsPage() {
  const [dati, setDati] = useState(null);
  const [notAdmin, setNotAdmin] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { carica(); }, []);
  async function carica() {
    const co = await getMyCompany().catch(() => null);
    if (!co?.is_platform_admin) { setNotAdmin(true); return; }
    try { setDati(await adminListAgents()); } catch (e) { setErr(agentErrorMessage(e)); }
  }
  async function forza(zoneId, status) {
    setBusy(true); setErr("");
    try { await adminSetAgentZone(zoneId, status); setDati(await adminListAgents()); }
    catch (e) { setErr(agentErrorMessage(e)); }
    setBusy(false);
  }
  async function assegna(ledgerId, agentId) {
    if (!agentId) return;
    setBusy(true); setErr("");
    try { await adminAssignCommission(ledgerId, agentId); setDati(await adminListAgents()); }
    catch (e) { setErr(agentErrorMessage(e)); }
    setBusy(false);
  }

  if (notAdmin) return <div style={{ padding:40, textAlign:"center", color:C.muted }}>Sezione riservata agli amministratori.</div>;

  const agenti = dati?.agenti || [];
  const provvigioni = dati?.provvigioni || [];
  // Per assegnare a mano servono gli agenti confermati di QUEL fornitore.
  const agentiDelFornitore = (supplierId) => agenti.filter(a =>
    (a.legami || []).some(l => l.supplier_company_id === supplierId && l.status === "confermato"));

  return (
    <BulkStrikeProfileShell active="admin-agenti">
      <div style={{ maxWidth:1000 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
          <UserCheck size={20} color={C.blue} />
          <h1 style={{ fontSize:22, fontWeight:800, margin:0 }}>Agenti di vendita</h1>
        </div>
        <p style={{ fontSize:13.5, color:C.muted, lineHeight:1.6, marginBottom:18 }}>
          Legami agente↔fornitore e provvigioni indicative. Le cifre qui sotto sono <b>solo un riferimento
          teorico</b>: BulkStrike non incassa, non paga e non traccia pagamenti di provvigione, che restano un
          fatto privato fra fornitore e agente.
        </p>

        {err && <div style={{ background:"#FEF2F2", color:C.red, border:"1px solid #FECACA", borderRadius:10, padding:"10px 14px", fontSize:13.5, marginBottom:16 }}>{err}</div>}

        {dati === null ? <div style={{ color:C.muted, fontSize:14 }}>Carico…</div> : (<>
          <div style={{ fontSize:15, fontWeight:800, margin:"6px 0 10px" }}>Agenti e collegamenti</div>
          {agenti.length === 0 ? (
            <div style={{ border:`1px dashed ${C.border}`, borderRadius:14, padding:"28px 20px", textAlign:"center", color:C.muted, fontSize:14, marginBottom:26 }}>
              Nessun agente registrato.
            </div>
          ) : (
            <div style={{ display:"grid", gap:10, marginBottom:26 }}>
              {agenti.map(a => (
                <div key={a.id} style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px" }}>
                  <div style={{ fontSize:15, fontWeight:700 }}>{a.full_name}</div>
                  <div style={{ fontSize:12.5, color:C.muted, marginBottom:9 }}>
                    {a.email}{a.phone ? ` · ${a.phone}` : ""}{a.status !== "attivo" ? " · disabilitato" : ""}
                  </div>
                  {(a.legami || []).length === 0 ? (
                    <div style={{ fontSize:12.5, color:C.muted }}>Nessun collegamento.</div>
                  ) : (a.legami || []).map(l => {
                    const s = STATO[l.status] || STATO.in_attesa;
                    return (
                      <div key={l.id} style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", padding:"7px 0", borderTop:`1px solid #F1F5F9` }}>
                        <span style={{ fontSize:13.5, fontWeight:600, flex:1, minWidth:180 }}>{l.fornitore}</span>
                        <span style={{ fontSize:12.5, color:C.muted }}>{[l.region, l.country].filter(Boolean).join(", ") || "tutte le zone"}</span>
                        {l.commission_rate_indicative != null && <span style={{ fontSize:12.5, color:C.muted }}>{l.commission_rate_indicative}%</span>}
                        <span style={{ fontSize:11.5, color:C.muted }}>da {l.proposed_by}</span>
                        <span style={{ background:s.bg, color:s.fg, borderRadius:6, padding:"2px 8px", fontSize:11.5, fontWeight:700 }}>{s.label}</span>
                        <select value="" disabled={busy} onChange={e => e.target.value && forza(l.id, e.target.value)}
                          style={{ padding:"5px 8px", border:`1px solid ${C.border}`, borderRadius:7, fontSize:12, background:"#fff", color:C.muted, cursor:"pointer" }}>
                          <option value="">Forza stato…</option>
                          <option value="confermato">Confermato</option>
                          <option value="in_attesa">Da confermare</option>
                          <option value="rifiutato">Rifiutato</option>
                          <option value="disattivato">Disattivato</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <div style={{ display:"flex", alignItems:"center", gap:8, margin:"6px 0 10px" }}>
            <Euro size={17} color={C.blue} />
            <span style={{ fontSize:15, fontWeight:800 }}>Provvigioni indicative</span>
          </div>
          {provvigioni.length === 0 ? (
            <div style={{ border:`1px dashed ${C.border}`, borderRadius:14, padding:"28px 20px", textAlign:"center", color:C.muted, fontSize:14 }}>
              Nessuna provvigione maturata: compaiono qui quando un ordine riguarda un fornitore con agenti confermati.
            </div>
          ) : (
            <div style={{ display:"grid", gap:8 }}>
              {provvigioni.map(p => (
                <div key={p.id} style={{ background:"#fff", border:`1px solid ${p.assignment_status === "non_assegnabile" ? "#FDE68A" : C.border}`, borderRadius:12, padding:"12px 15px", display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ fontSize:13.5, fontWeight:700 }}>{p.fornitore}</div>
                    <div style={{ fontSize:12, color:C.muted }}>ordine {String(p.order_id).slice(0, 8)} · {dt(p.accrued_at)}</div>
                  </div>
                  {p.assignment_status === "non_assegnabile" ? (
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                      <span style={{ display:"inline-flex", alignItems:"center", gap:5, color:C.amber, fontSize:12.5, fontWeight:700 }}>
                        <AlertTriangle size={13}/> Da assegnare
                      </span>
                      <select defaultValue="" disabled={busy} onChange={e => assegna(p.id, e.target.value)}
                        style={{ padding:"6px 9px", border:`1px solid ${C.border}`, borderRadius:7, fontSize:12.5, background:"#fff", color:C.text, cursor:"pointer" }}>
                        <option value="">Scegli l&apos;agente…</option>
                        {agentiDelFornitore(p.supplier_company_id ?? "").map(a => (
                          <option key={a.id} value={a.id}>{a.full_name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:13.5, fontWeight:700 }}>{p.agente || "—"}</div>
                      <div style={{ fontSize:12.5, color:C.muted }}>
                        {p.rate != null ? `${p.rate}% · ` : ""}{eur(p.importo)}
                        {p.assignment_status === "assegnato_da_admin" ? " · assegnata a mano" : ""}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>)}
      </div>
    </BulkStrikeProfileShell>
  );
}
