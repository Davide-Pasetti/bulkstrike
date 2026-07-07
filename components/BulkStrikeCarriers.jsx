"use client";
// BulkStrikeCarriers — anagrafica PUBBLICA dei corrieri (/corrieri).
// È la pagina a cui punta la voce "Corrieri" della navbar: mostra tutti i
// corrieri registrati con zone coperte e tempi di consegna (dati vetrina
// dalla RPC get_carriers_directory — mai dati sensibili).
// La GESTIONE del proprio listino tariffe resta nel profilo corriere
// (/corriere), raggiungibile dalla CTA in fondo se sei loggato come corriere.
import { useState, useEffect, useMemo } from "react";
import { Truck, MapPin, Clock, ChevronRight, Search, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase"; // RPC diretta per non toccare lib/api
import BulkStrikeNav from "@/components/BulkStrikeNav";
import { BSIcon } from "@/components/BSLogo";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706" };

function leadTimeLabel(min, max) {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max} gg`;
  return `${min ?? max} gg`;
}

export default function CarriersPage() {
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    supabase.rpc("get_carriers_directory")
      .then(({ data, error }) => {
        if (!error) setCarriers(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return carriers;
    return carriers.filter(c =>
      (c.name || "").toLowerCase().includes(s) ||
      (c.country || "").toLowerCase().includes(s) ||
      (c.city || "").toLowerCase().includes(s) ||
      (c.zones || []).some(z => (z || "").toLowerCase().includes(s))
    );
  }, [carriers, q]);

  return (
    <div style={{ background:"#fff", color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", colorScheme:"light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing:border-box; }
        .cr-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
        .cr-card { border:1px solid ${C.border}; border-radius:14px; padding:18px; background:#fff; transition:transform 0.12s, box-shadow 0.12s; }
        .cr-card:hover { transform:translateY(-2px); box-shadow:0 10px 24px rgba(15,23,42,0.08); border-color:#BAE6FD; }
        .cr-chip { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; border-radius:100px; padding:3px 9px; background:#F1F5F9; color:${C.muted}; }
        .cr-nav-links { display:flex; }
        @media (max-width:700px) { .cr-nav-links { display:none !important; } }
      `}</style>

      {/* NAV */}
      <BulkStrikeNav />

      {/* HEADER */}
      <div style={{ borderBottom:`1px solid ${C.border}`, background:"linear-gradient(135deg,#F8FAFF,#F0FDFF)" }}>
        <div style={{ maxWidth:1280, margin:"0 auto", padding:"26px 20px" }}>
          <div style={{ fontSize:12, color:C.muted, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
            <span onClick={() => { window.location.href = "/"; }} style={{ cursor:"pointer" }}>Home</span><ChevronRight size={12}/><span style={{ color:C.text, fontWeight:600 }}>Corrieri</span>
          </div>
          <h1 style={{ fontSize:30, fontWeight:900, letterSpacing:"-0.03em", margin:"0 0 6px" }}>Corrieri</h1>
          <p style={{ fontSize:15, color:C.muted, margin:0 }}>Tutti i corrieri registrati su BulkStrike, con zone coperte e tempi di consegna. Al checkout confrontiamo automaticamente i loro preventivi sulla tua spedizione.</p>
        </div>
      </div>

      {/* BODY */}
      <div style={{ maxWidth:1280, margin:"0 auto", padding:"22px 20px 40px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:18 }}>
          <div style={{ fontSize:14, color:C.muted }}>
            {loading ? "Caricamento corrieri…" : <><b style={{ color:C.text }}>{filtered.length}</b> {filtered.length === 1 ? "corriere" : "corrieri"}{q.trim() ? " (filtrati)" : ""}</>}
          </div>
          <div style={{ position:"relative", flex:1, maxWidth:340, minWidth:220 }}>
            <Search size={15} color={C.muted} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)" }}/>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca per nome, città o zona…"
              style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px 10px 36px", fontSize:13.5, outline:"none", fontFamily:"'Inter',system-ui", background:"#fff", color:C.text }} />
          </div>
        </div>

        {loading ? (
          <div style={{ padding:"60px 0", textAlign:"center", color:C.muted, fontSize:14 }}>Caricamento corrieri…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:"60px 20px", textAlign:"center", color:C.muted }}>
            <Truck size={30} color={C.border} style={{ marginBottom:10 }}/>
            <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:4 }}>Nessun corriere trovato</div>
            <div style={{ fontSize:13 }}>{carriers.length === 0 ? "Non ci sono ancora corrieri registrati." : "Prova a cambiare ricerca."}</div>
          </div>
        ) : (
          <div className="cr-grid">
            {filtered.map(c => {
              const zones = c.zones || [];
              const shown = zones.slice(0, 6);
              const extra = zones.length - shown.length;
              const lt = leadTimeLabel(c.lead_time_min, c.lead_time_max);
              return (
                <div key={c.id} className="cr-card">
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:"#EFF6FF", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <Truck size={19} color={C.blue}/>
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:15, fontWeight:800, lineHeight:1.2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name}</div>
                      <div style={{ fontSize:12, color:C.muted, display:"flex", alignItems:"center", gap:4 }}>
                        <MapPin size={11}/>{[c.city, c.country].filter(Boolean).join(", ") || "—"}
                      </div>
                    </div>
                  </div>

                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
                    {c.pricing_mode && (
                      <span className="cr-chip" style={{ background:"#EFF6FF", color:"#0369A1" }}>
                        {c.pricing_mode === "distance" ? "Tariffe a distanza" : "Tariffe a zona"}
                      </span>
                    )}
                    {lt && <span className="cr-chip" style={{ background:"#ECFDF5", color:C.green }}><Clock size={11}/> Consegna {lt}</span>}
                    {c.rates_count > 0 && <span className="cr-chip">{c.rates_count} {c.rates_count === 1 ? "tariffa attiva" : "tariffe attive"}</span>}
                  </div>

                  <div style={{ fontSize:11.5, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:6 }}>Zone coperte</div>
                  {zones.length === 0 ? (
                    <div style={{ fontSize:12.5, color:C.muted }}>Nessuna zona dichiarata</div>
                  ) : (
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      {shown.map(z => <span key={z} className="cr-chip">{z}</span>)}
                      {extra > 0 && <span className="cr-chip" style={{ background:"#EFF6FF", color:C.blue }}>+{extra}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CTA per i corrieri: la gestione del listino sta nel profilo /corriere */}
      <div style={{ background:"#F8FAFE", borderTop:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1280, margin:"0 auto", padding:"40px 20px", textAlign:"center" }}>
          <h2 style={{ fontSize:22, fontWeight:900, letterSpacing:"-0.02em", marginBottom:8 }}>Sei un corriere?</h2>
          <p style={{ fontSize:14, color:C.muted, margin:"0 auto 20px", maxWidth:560 }}>
            Registrati e carica il tuo listino (anche in PDF, lo interpreta l'AI): riceverai le spedizioni dei fornitori BulkStrike sulle tratte che copri. La gestione delle tariffe è nel tuo profilo, alla voce Listino.
          </p>
          <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
            <button onClick={() => { window.location.href = "/corriere"; }} style={{ background:C.blue, color:"#fff", border:"none", borderRadius:10, padding:"13px 24px", fontSize:15, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:8, fontFamily:"'Inter',system-ui" }}>
              Gestisci il tuo listino corriere <ArrowRight size={16}/>
            </button>
            <button onClick={() => { window.location.href = "/registrati"; }} style={{ background:"transparent", color:C.blue, border:`1.5px solid ${C.blue}`, borderRadius:10, padding:"12px 24px", fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"'Inter',system-ui" }}>
              Registra la tua azienda
            </button>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ background:"#050D18", padding:"28px 20px" }}>
        <div style={{ maxWidth:1280, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:14 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display:"flex", alignItems:"center", gap:9, cursor:"pointer" }}>
            <BSIcon size={26} uid="foot" /><span style={{ fontSize:15, fontWeight:900, color:"#F0F6FF" }}>BulkStrike</span>
          </div>
          <div style={{ display:"flex", gap:18, flexWrap:"wrap" }}>
            {[["Termini","/legale#termini"],["Privacy","/legale#privacy"],["Cookie","/legale#cookie"],["Contatti","mailto:info@bulkstrike.com"]].map(([l,href]) => <a key={l} href={href} style={{ fontSize:13, color:"#3B5A7A", cursor:"pointer", textDecoration:"none" }}>{l}</a>)}
          </div>
        </div>
      </div>
    </div>
  );
}
