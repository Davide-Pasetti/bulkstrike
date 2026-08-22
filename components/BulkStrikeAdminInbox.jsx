"use client";
// BulkStrikeAdminInbox — pagina admin "Mail ricevute".
// Specchio della posta letta da info@bulkstrike.com. Serve soprattutto a
// una cosa: vedere le risposte che NON si sono agganciate a nessuna richiesta,
// perché quelle non finiscono in nessun thread e altrimenti si perderebbero.
// Solo platform admin: il gate vero è nella RPC (NOT_ADMIN), qui si evita solo
// di mostrare una pagina vuota a chi non deve vederla.
import { useEffect, useState } from "react";
import { Mail, AlertTriangle, Check, ExternalLink } from "lucide-react";
import { getMyCompany, adminListInbox } from "@/lib/api";
import BulkStrikeProfileShell from "@/components/BulkStrikeProfileShell";

const C = { blue:"#0EA5E9", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", amber:"#D97706" };
const dt = (iso) => iso ? new Date(iso).toLocaleString("it-IT", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" }) : "—";

export default function AdminInboxPage() {
  const [rows, setRows] = useState(null);
  const [soloDaRivedere, setSoloDaRivedere] = useState(false);
  const [notAdmin, setNotAdmin] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { carica(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [soloDaRivedere]);
  async function carica() {
    try {
      const co = await getMyCompany().catch(() => null);
      if (!co?.is_platform_admin) { setNotAdmin(true); return; }
      setRows(await adminListInbox(soloDaRivedere));
    } catch (e) { setErr(String(e?.message || e)); }
  }

  if (notAdmin) return <div style={{ padding:40, textAlign:"center", color:C.muted }}>Sezione riservata agli amministratori.</div>;

  const daRivedere = (rows || []).filter(r => !r.processed).length;

  return (
    <BulkStrikeProfileShell active="mail-ricevute">
      <div style={{ maxWidth:1000 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
          <Mail size={20} color={C.blue} />
          <h1 style={{ fontSize:22, fontWeight:800, margin:0 }}>Mail ricevute</h1>
        </div>
        <p style={{ fontSize:13.5, color:C.muted, lineHeight:1.6, marginBottom:18 }}>
          Posta in arrivo di <b>info@bulkstrike.com</b>, letta in sola lettura: sul server non viene
          spostato, segnato o cancellato niente. Le risposte che portano il codice della richiesta finiscono
          da sole nella conversazione col cliente. Quelle senza codice restano qui, da smistare a mano.
        </p>

        {err && <div style={{ background:"#FEF2F2", color:"#DC2626", border:"1px solid #FECACA", borderRadius:10, padding:"10px 14px", fontSize:13.5, marginBottom:16 }}>{err}</div>}

        <label style={{ display:"inline-flex", alignItems:"center", gap:8, fontSize:13.5, cursor:"pointer", marginBottom:14 }}>
          <input type="checkbox" checked={soloDaRivedere} onChange={e => { setRows(null); setSoloDaRivedere(e.target.checked); }}
            style={{ width:16, height:16, accentColor:C.blue, cursor:"pointer" }} />
          Solo da rivedere {daRivedere > 0 && !soloDaRivedere ? `(${daRivedere})` : ""}
        </label>

        {rows === null ? (
          <div style={{ color:C.muted, fontSize:14 }}>Carico…</div>
        ) : rows.length === 0 ? (
          <div style={{ border:`1px dashed ${C.border}`, borderRadius:14, padding:"34px 20px", textAlign:"center", color:C.muted, fontSize:14 }}>
            {soloDaRivedere ? "Niente da rivedere: ogni mail è finita nella sua conversazione." : "Nessuna mail ancora letta da questa casella."}
          </div>
        ) : (
          <div style={{ display:"grid", gap:10 }}>
            {rows.map(r => (
              <div key={r.id} style={{ background:"#fff", border:`1px solid ${r.processed ? C.border : "#FDE68A"}`, borderRadius:12, padding:"14px 16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginBottom:6 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:14.5, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis" }}>{r.subject || "(senza oggetto)"}</div>
                    <div style={{ fontSize:12.5, color:C.muted, marginTop:2 }}>
                      da <b style={{ color:C.text }}>{r.from_name || r.from_email || "—"}</b>
                      {r.from_name && r.from_email ? ` · ${r.from_email}` : ""} · {dt(r.received_at || r.fetched_at)}
                    </div>
                  </div>
                  {r.processed ? (
                    <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:"#ECFDF5", color:C.green, borderRadius:6, padding:"3px 9px", fontSize:12, fontWeight:700, height:"fit-content", whiteSpace:"nowrap" }}>
                      <Check size={12}/> Nella conversazione
                    </span>
                  ) : (
                    <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:"#FFFBEB", color:C.amber, borderRadius:6, padding:"3px 9px", fontSize:12, fontWeight:700, height:"fit-content", whiteSpace:"nowrap" }}>
                      <AlertTriangle size={12}/> Da rivedere
                    </span>
                  )}
                </div>

                {r.processed && r.controparte && (
                  <div style={{ fontSize:12.5, color:C.muted, marginBottom:6 }}>
                    {r.controparte} → {r.cliente}{" "}
                    <a href={`/messaggi?thread=${r.thread_id}`} style={{ color:C.blue, fontWeight:700, textDecoration:"none", display:"inline-flex", alignItems:"center", gap:3 }}>
                      apri la conversazione <ExternalLink size={11}/>
                    </a>
                  </div>
                )}
                {r.match_note && (
                  <div style={{ fontSize:12.5, color:C.amber, marginBottom:6 }}>{r.match_note}</div>
                )}
                {r.estratto && (
                  <div style={{ fontSize:13, color:C.text, background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 11px", whiteSpace:"pre-wrap", maxHeight:150, overflow:"auto", lineHeight:1.55 }}>
                    {r.estratto}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </BulkStrikeProfileShell>
  );
}
