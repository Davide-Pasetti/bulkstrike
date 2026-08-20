"use client";
// BulkStrikeAgentRegister — /agenti/registrati, pagina pubblica.
// L'agente dichiara per quali aziende lavora e in quale zona. Il collegamento
// resta SOSPESO finché il fornitore non lo conferma dal proprio pannello: qui
// non si ottiene nessun accesso e nessun contatto viene instradato.
import { useEffect, useRef, useState } from "react";
import { UserCheck, Search, X, Check } from "lucide-react";
import { cercaFornitoriPubblici, agentSelfRegister, agentErrorMessage } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import CountryFlag from "@/components/CountryFlag";

const C = { blue:"#0EA5E9", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626" };
const input = { width:"100%", padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, background:"#fff", color:C.text, fontFamily:"Inter,system-ui", boxSizing:"border-box" };
const label = { display:"block", fontSize:12.5, fontWeight:600, color:C.muted, marginBottom:5 };

export default function AgentRegisterPage() {
  const [f, setF] = useState({ fullName:"", email:"", phone:"" });
  const [q, setQ] = useState("");
  const [ris, setRis] = useState([]);
  const [scelti, setScelti] = useState([]); // [{ id, legal_name, country, region }]
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fatto, setFatto] = useState(null);
  const timer = useRef(null);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setRis([]); return; }
    timer.current = setTimeout(() => {
      cercaFornitoriPubblici(q).then(setRis).catch(() => setRis([]));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  const aggiungi = (c) => {
    if (scelti.some(s => s.id === c.id)) return;
    setScelti(p => [...p, { ...c, region: "" }]);
    setQ(""); setRis([]);
  };
  const togli = (id) => setScelti(p => p.filter(s => s.id !== id));
  const setZona = (id, region) => setScelti(p => p.map(s => s.id === id ? { ...s, region } : s));

  async function invia(e) {
    e.preventDefault();
    if (scelti.length === 0) { setErr("Indica almeno un'azienda che rappresenti."); return; }
    setBusy(true); setErr("");
    try {
      const res = await agentSelfRegister({
        ...f,
        suppliers: scelti.map(s => ({ supplier_company_id: s.id, region: s.region || null })),
      });
      setFatto(res);
    } catch (e2) { setErr(agentErrorMessage(e2)); }
    setBusy(false);
  }

  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif", color:C.text }}>
      <BulkStrikeNav />
      <div style={{ maxWidth:760, margin:"0 auto", padding:"28px 20px 60px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
          <UserCheck size={22} color={C.blue} />
          <h1 style={{ fontSize:26, fontWeight:800, margin:0 }}>Sei un agente di vendita?</h1>
        </div>
        <p style={{ fontSize:14.5, color:C.muted, lineHeight:1.65, marginBottom:24 }}>
          Se rappresenti una o più aziende su una zona, dichiaralo qui: quando un cliente chiede un preventivo
          o un campione in quell&apos;area, potrà scegliere di parlare con te. <b style={{ color:C.text }}>Il
          collegamento resta sospeso finché l&apos;azienda non lo conferma</b>: fino ad allora non è visibile a
          nessuno e nessun contatto ti viene inoltrato.
        </p>

        {fatto ? (
          <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, padding:28, textAlign:"center" }}>
            <Check size={38} style={{ color:C.green, marginBottom:10 }} />
            <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>Richiesta inviata</div>
            <div style={{ fontSize:14, color:C.muted, lineHeight:1.6 }}>
              Abbiamo avvisato {fatto.legami_creati === 1 ? "l'azienda indicata" : `le ${fatto.legami_creati} aziende indicate`}.
              Riceverai notizie quando confermeranno il collegamento. Se non lo confermano, il legame resta
              semplicemente inattivo e nessuno lo vede.
            </div>
          </div>
        ) : (
          <form onSubmit={invia} style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, padding:22 }}>
            {err && <div style={{ background:"#FEF2F2", color:C.red, border:"1px solid #FECACA", borderRadius:10, padding:"10px 14px", fontSize:13.5, marginBottom:16 }}>{err}</div>}

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:14, marginBottom:20 }}>
              <div><label style={label}>Nome e cognome *</label>
                <input style={input} value={f.fullName} onChange={e=>set("fullName", e.target.value)} required maxLength={120}/></div>
              <div><label style={label}>Email *</label>
                <input style={input} type="email" value={f.email} onChange={e=>set("email", e.target.value)} required maxLength={160}/></div>
              <div><label style={label}>Telefono</label>
                <input style={input} value={f.phone} onChange={e=>set("phone", e.target.value)} maxLength={40}/></div>
            </div>

            <label style={label}>Aziende che rappresenti *</label>
            <div style={{ position:"relative", marginBottom:12 }}>
              <Search size={15} color={C.muted} style={{ position:"absolute", left:11, top:12 }} />
              <input style={{ ...input, paddingLeft:34 }} value={q} onChange={e=>setQ(e.target.value)}
                placeholder="Cerca per ragione sociale…" />
              {ris.length > 0 && (
                <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"#fff", border:`1px solid ${C.border}`, borderRadius:10, marginTop:4, zIndex:20, maxHeight:230, overflowY:"auto", boxShadow:"0 10px 30px rgba(15,23,42,0.10)" }}>
                  {ris.map(c => (
                    <div key={c.id} onClick={() => aggiungi(c)}
                      style={{ padding:"10px 12px", borderBottom:`1px solid #F1F5F9`, cursor:"pointer", fontSize:13.5, display:"flex", alignItems:"center", gap:7 }}>
                      <CountryFlag code={c.country_iso2} country={c.country} size={12} />
                      <span style={{ fontWeight:600 }}>{c.legal_name}</span>
                      <span style={{ color:C.muted, fontSize:12 }}>{[c.city, c.country].filter(Boolean).join(", ")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {scelti.length === 0 ? (
              <div style={{ fontSize:12.5, color:C.muted, marginBottom:18 }}>
                Nessuna azienda selezionata. Se non trovi la tua, scrivici a davide@bulkstrike.com.
              </div>
            ) : (
              <div style={{ display:"grid", gap:9, marginBottom:18 }}>
                {scelti.map(s => (
                  <div key={s.id} style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:"11px 13px", background:C.bg }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", marginBottom:8 }}>
                      <span style={{ fontSize:14, fontWeight:700 }}>{s.legal_name}</span>
                      <button type="button" onClick={() => togli(s.id)}
                        style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", display:"flex" }}><X size={15}/></button>
                    </div>
                    <input style={{ ...input, padding:"8px 10px", fontSize:13 }} value={s.region}
                      onChange={e => setZona(s.id, e.target.value)}
                      placeholder="Zona che segui (es. Abruzzo) — lascia vuoto se tutto il paese" maxLength={80}/>
                  </div>
                ))}
              </div>
            )}

            <button type="submit" disabled={busy}
              style={{ width:"100%", background:busy?"#93C5FD":C.blue, color:"#fff", border:"none", borderRadius:10, padding:"13px", fontSize:15, fontWeight:700, cursor:busy?"not-allowed":"pointer", fontFamily:"Inter,system-ui" }}>
              {busy ? "Invio…" : "Invia la richiesta alle aziende"}
            </button>
            <div style={{ fontSize:11.5, color:C.muted, marginTop:10, textAlign:"center", lineHeight:1.5 }}>
              BulkStrike non gestisce provvigioni né contratti di agenzia: il rapporto economico resta fra te e
              l&apos;azienda che rappresenti.
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
