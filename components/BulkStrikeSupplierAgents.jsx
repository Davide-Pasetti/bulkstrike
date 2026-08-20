"use client";
// BulkStrikeSupplierAgents — /fornitore/agenti, pannello "I miei agenti di zona".
// Due cose: dichiarare i propri agenti, e decidere sulle autocandidature.
// Finché il fornitore non conferma, il legame non è visibile a nessuno e nessun
// contatto viene instradato all'agente: è questa pagina a sbloccarlo.
import { useEffect, useState } from "react";
import { UserCheck, Check, X, Plus, Info } from "lucide-react";
import { getMyCompany, myAgentZones, supplierAddAgent, supplierSetAgentZone, agentErrorMessage } from "@/lib/api";
import BulkStrikeProfileShell from "@/components/BulkStrikeProfileShell";

const C = { blue:"#0EA5E9", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706" };
const dt = (iso) => iso ? new Date(iso).toLocaleDateString("it-IT", { day:"2-digit", month:"2-digit", year:"numeric" }) : "—";
const STATO = {
  in_attesa:   { label:"Da confermare", bg:"#FFFBEB", fg:C.amber },
  confermato:  { label:"Confermato",    bg:"#ECFDF5", fg:C.green },
  rifiutato:   { label:"Rifiutato",     bg:"#FEF2F2", fg:C.red },
  disattivato: { label:"Disattivato",   bg:"#F1F5F9", fg:C.muted },
};
const input = { width:"100%", padding:"9px 11px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:13.5, background:"#fff", color:C.text, fontFamily:"Inter,system-ui", boxSizing:"border-box" };
const label = { display:"block", fontSize:12, fontWeight:600, color:C.muted, marginBottom:4 };

export default function SupplierAgentsPage() {
  const [rows, setRows] = useState(null);
  const [notSupplier, setNotSupplier] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [apri, setApri] = useState(false);
  const [f, setF] = useState({ fullName:"", email:"", phone:"", country:"", region:"", commissionRate:"" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => { carica(); }, []);
  async function carica() {
    const co = await getMyCompany().catch(() => null);
    if (!co?.is_supplier) { setNotSupplier(true); return; }
    try { setRows(await myAgentZones()); } catch (e) { setErr(agentErrorMessage(e)); }
  }
  async function aggiungi(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await supplierAddAgent(f);
      setF({ fullName:"", email:"", phone:"", country:"", region:"", commissionRate:"" });
      setApri(false);
      setRows(await myAgentZones());
    } catch (e2) { setErr(agentErrorMessage(e2)); }
    setBusy(false);
  }
  async function decidi(id, azione) {
    setBusy(true); setErr("");
    try { await supplierSetAgentZone(id, azione); setRows(await myAgentZones()); }
    catch (e) { setErr(agentErrorMessage(e)); }
    setBusy(false);
  }

  if (notSupplier) return <div style={{ padding:40, textAlign:"center", color:C.muted }}>Sezione riservata ai fornitori.</div>;

  const daConfermare = (rows || []).filter(r => r.status === "in_attesa");

  return (
    <BulkStrikeProfileShell active="agenti">
      <div style={{ maxWidth:900 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
          <UserCheck size={20} color={C.blue} />
          <h1 style={{ fontSize:22, fontWeight:800, margin:0 }}>I miei agenti di zona</h1>
        </div>
        <p style={{ fontSize:13.5, color:C.muted, lineHeight:1.6, marginBottom:18 }}>
          Se lavori con agenti, dichiarali qui: i clienti che ti chiedono un preventivo o un campione in quella
          zona potranno scegliere di parlare con loro invece che con te direttamente. Tu resti sempre in copia.
          La percentuale che indichi è un <b>promemoria vostro</b>: BulkStrike non incassa, non paga e non
          gestisce provvigioni, il regolamento resta fra te e l&apos;agente.
        </p>

        {err && <div style={{ background:"#FEF2F2", color:C.red, border:"1px solid #FECACA", borderRadius:10, padding:"10px 14px", fontSize:13.5, marginBottom:16 }}>{err}</div>}

        {daConfermare.length > 0 && (
          <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:12, padding:"12px 15px", marginBottom:16, display:"flex", gap:9, alignItems:"flex-start" }}>
            <Info size={16} color={C.amber} style={{ flexShrink:0, marginTop:1 }} />
            <div style={{ fontSize:13, color:"#92400E", lineHeight:1.55 }}>
              {daConfermare.length === 1 ? "Un agente dichiara" : `${daConfermare.length} agenti dichiarano`} di
              rappresentarti. Finché non confermi, il collegamento non è visibile a nessuno e nessun contatto
              viene instradato.
            </div>
          </div>
        )}

        <button onClick={() => setApri(v => !v)}
          style={{ background:apri?"#fff":C.blue, color:apri?C.muted:"#fff", border:apri?`1px solid ${C.border}`:"none", borderRadius:9, padding:"10px 16px", fontSize:14, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:7, marginBottom:16, fontFamily:"Inter,system-ui" }}>
          <Plus size={15}/> {apri ? "Annulla" : "Aggiungi un agente"}
        </button>

        {apri && (
          <form onSubmit={aggiungi} style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:18 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12 }}>
              <div><label style={label}>Nome e cognome *</label>
                <input style={input} value={f.fullName} onChange={e=>set("fullName", e.target.value)} required maxLength={120}/></div>
              <div><label style={label}>Email *</label>
                <input style={input} type="email" value={f.email} onChange={e=>set("email", e.target.value)} required maxLength={160}/></div>
              <div><label style={label}>Telefono</label>
                <input style={input} value={f.phone} onChange={e=>set("phone", e.target.value)} maxLength={40}/></div>
              <div><label style={label}>Nazione</label>
                <input style={input} value={f.country} onChange={e=>set("country", e.target.value)} placeholder="es. Italia" maxLength={80}/></div>
              <div><label style={label}>Regione / zona</label>
                <input style={input} value={f.region} onChange={e=>set("region", e.target.value)} placeholder="es. Abruzzo" maxLength={80}/></div>
              <div><label style={label}>Provvigione indicativa (%)</label>
                <input style={input} type="number" min={0} max={100} step={0.1} value={f.commissionRate}
                  onChange={e=>set("commissionRate", e.target.value)} placeholder="es. 3,5"/></div>
            </div>
            <div style={{ fontSize:11.5, color:C.muted, marginTop:10, lineHeight:1.5 }}>
              La zona serve a capire per quali clienti proporre questo agente. Lasciandola vuota vale per tutti.
            </div>
            <button type="submit" disabled={busy}
              style={{ marginTop:14, background:busy?"#93C5FD":C.blue, color:"#fff", border:"none", borderRadius:9, padding:"11px 20px", fontSize:14, fontWeight:700, cursor:busy?"not-allowed":"pointer", fontFamily:"Inter,system-ui" }}>
              {busy ? "Salvo…" : "Aggiungi agente"}
            </button>
          </form>
        )}

        {rows === null ? (
          <div style={{ color:C.muted, fontSize:14 }}>Carico…</div>
        ) : rows.length === 0 ? (
          <div style={{ border:`1px dashed ${C.border}`, borderRadius:14, padding:"34px 20px", textAlign:"center", color:C.muted, fontSize:14 }}>
            Nessun agente collegato. Se lavori con agenti di zona, aggiungili qui.
          </div>
        ) : (
          <div style={{ display:"grid", gap:10 }}>
            {rows.map(r => {
              const s = STATO[r.status] || STATO.in_attesa;
              const zona = [r.region, r.country].filter(Boolean).join(", ") || "tutte le zone";
              return (
                <div key={r.id} style={{ background:"#fff", border:`1px solid ${r.status === "in_attesa" ? "#FDE68A" : C.border}`, borderRadius:12, padding:"14px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginBottom:6 }}>
                    <div>
                      <div style={{ fontSize:15, fontWeight:700, color:C.text }}>{r.full_name}</div>
                      <div style={{ fontSize:12.5, color:C.muted, marginTop:2 }}>
                        {r.email}{r.phone ? ` · ${r.phone}` : ""} · zona: <b style={{ color:C.text }}>{zona}</b>
                      </div>
                    </div>
                    <span style={{ background:s.bg, color:s.fg, borderRadius:6, padding:"3px 9px", fontSize:12, fontWeight:700, height:"fit-content" }}>{s.label}</span>
                  </div>
                  <div style={{ fontSize:12, color:C.muted }}>
                    {r.proposed_by === "agente" ? "Autocandidatura dell'agente" : r.proposed_by === "admin" ? "Inserito da BulkStrike" : "Dichiarato da te"}
                    {" · "}{dt(r.created_at)}
                    {r.commission_rate_indicative != null && <> · provvigione indicativa <b style={{ color:C.text }}>{r.commission_rate_indicative}%</b></>}
                  </div>
                  {(r.status === "in_attesa" || r.status === "confermato") && (
                    <div style={{ display:"flex", gap:8, marginTop:12, flexWrap:"wrap" }}>
                      {r.status === "in_attesa" && (<>
                        <button onClick={() => decidi(r.id, "conferma")} disabled={busy}
                          style={{ background:C.green, color:"#fff", border:"none", borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}><Check size={14}/> Confermo</button>
                        <button onClick={() => decidi(r.id, "rifiuta")} disabled={busy}
                          style={{ background:"#fff", color:C.red, border:"1px solid #FECACA", borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}><X size={14}/> Non lo conosco</button>
                      </>)}
                      {r.status === "confermato" && (
                        <button onClick={() => decidi(r.id, "disattiva")} disabled={busy}
                          style={{ background:"#fff", color:C.muted, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:700, cursor:"pointer" }}>Disattiva</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BulkStrikeProfileShell>
  );
}
