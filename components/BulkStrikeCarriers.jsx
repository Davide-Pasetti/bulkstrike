"use client";
// BulkStrikeCarriers — anagrafica PUBBLICA dei corrieri (/corrieri).
// È la pagina a cui punta la voce "Corrieri" della navbar: mostra tutti i
// corrieri registrati con zone coperte e tempi di consegna (dati vetrina
// dalla RPC get_carriers_directory — mai dati sensibili).
// La GESTIONE del proprio listino tariffe resta nel profilo corriere
// (/corriere), raggiungibile dalla CTA in fondo se sei loggato come corriere.
import { useState, useEffect, useMemo } from "react";
import { Truck, MapPin, Clock, ChevronRight, Search, ArrowRight, Globe, Home, X, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase"; // RPC diretta per non toccare lib/api
import { getSession } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import LoginGate from "@/components/BulkStrikeLoginGate";
import { BSIcon } from "@/components/BSLogo";
import CountryFlag from "@/components/CountryFlag";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706" };

function leadTimeLabel(min, max) {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max} gg`;
  return `${min ?? max} gg`;
}

// Modalità di trasporto: valore tecnico (dal DB) → etichetta italiana.
// Le 5 opzioni sono l'enum CHECK di carrier_transport_modes.
const MODE_LABELS = {
  strada_ftl: "Strada (FTL)",
  groupage_ltl: "Groupage/LTL",
  espresso_pacchi: "Corriere espresso / pacchi",
  mare: "Mare",
  ferrovia: "Ferrovia",
  multimodale: "Multimodale/3PL",
};
const MODE_ORDER = ["strada_ftl", "groupage_ltl", "espresso_pacchi", "mare", "ferrovia", "multimodale"];

// Chip di filtro attivo sopra la griglia (stesso stile di /fornitori).
function Chip({ label, onClear }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:"#EFF6FF", color:"#0369A1", border:"1px solid #BAE6FD", borderRadius:100, padding:"5px 12px", fontSize:12.5, fontWeight:700 }}>
      {label}
      <X size={13} style={{ cursor:"pointer" }} onClick={onClear}/>
    </span>
  );
}

export default function CarriersPage() {
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false); // la RPC directory è solo per autenticati
  const [q, setQ] = useState("");
  const [selCountries, setSelCountries] = useState(() => new Set()); // paesi selezionati
  const [scope, setScope] = useState("all");   // "all" | "national" | "international"
  const [selModes, setSelModes] = useState(() => new Set());       // modalità selezionate
  const [showFilters, setShowFilters] = useState(false); // toggle sidebar su mobile

  // Paesi disponibili: unione dei soli `countries` (NON zones, che mischia
  // paese e region generica tipo "Europa"). Ordinati alfabeticamente.
  const allCountries = useMemo(() => {
    const s = new Set();
    for (const c of carriers) for (const co of (c.countries || [])) if (co) s.add(co);
    return [...s].sort((a, b) => a.localeCompare(b, "it"));
  }, [carriers]);

  // Le recensioni non esistono ancora per nessun corriere: il filtro rating
  // resta in UI ma disabilitato finché non c'è almeno un corriere recensito.
  // (Stessa lezione del prezzo fittizio: non mostrare un dato come reale se non lo è.)
  const ratingAvailable = useMemo(() => carriers.some(c => (c.reviews_count || 0) > 0), [carriers]);

  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      try {
        const { data, error } = await supabase.rpc("get_carriers_directory");
        if (!error) setCarriers(Array.isArray(data) ? data : []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Tutti i filtri si combinano in AND fra loro e con la search testuale.
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return carriers.filter(c => {
      if (s && !(
        (c.name || "").toLowerCase().includes(s) ||
        (c.country || "").toLowerCase().includes(s) ||
        (c.city || "").toLowerCase().includes(s) ||
        (c.zones || []).some(z => (z || "").toLowerCase().includes(s))
      )) return false;
      // Paese: passa se almeno uno dei paesi selezionati è nella copertura.
      if (selCountries.size > 0 && !(c.countries || []).some(co => selCountries.has(co))) return false;
      // Nazionale / internazionale: usa is_international così com'è dal DB.
      if (scope === "national" && c.is_international) return false;
      if (scope === "international" && !c.is_international) return false;
      // Modalità: passa se ha almeno una delle modalità selezionate.
      if (selModes.size > 0 && !(c.modes || []).some(m => selModes.has(m))) return false;
      return true;
    });
  }, [carriers, q, selCountries, scope, selModes]);

  const activeFilters = selCountries.size + selModes.size + (scope !== "all" ? 1 : 0);
  function clearFilters() { setSelCountries(new Set()); setScope("all"); setSelModes(new Set()); }
  function toggleSet(setter, value) {
    setter(prev => { const n = new Set(prev); n.has(value) ? n.delete(value) : n.add(value); return n; });
  }

  // Helper della sidebar — stesso stile della directory fornitori (/fornitori).
  const FilterTitle = ({ children, hint }) => (
    <div style={{ fontSize:12, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.04em", margin:"18px 0 8px", display:"flex", alignItems:"center", gap:6 }}>
      {children}{hint}
    </div>
  );
  const Opt = ({ on, onClick, disabled, children }) => (
    <div onClick={disabled ? undefined : onClick}
      style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:8, cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.55:1,
        background:on?"#EFF6FF":"transparent", fontSize:13, fontWeight:on?700:500, color:on?"#0369A1":C.text }}>
      <span style={{ width:15, height:15, borderRadius:4, border:`1.5px solid ${on?C.blue:C.border}`, background:on?C.blue:"#fff", display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        {on && <span style={{ color:"#fff", fontSize:10, fontWeight:900 }}>✓</span>}
      </span>
      <span style={{ flex:1 }}>{children}</span>
    </div>
  );

  return (
    <div style={{ background:"#fff", color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", colorScheme:"light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing:border-box; }
        .cr-layout { display:grid; grid-template-columns:260px 1fr; gap:24px; align-items:start; }
        .cr-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
        .cr-card { border:1px solid ${C.border}; border-radius:14px; padding:18px; background:#fff; transition:transform 0.12s, box-shadow 0.12s; }
        .cr-card:hover { transform:translateY(-2px); box-shadow:0 10px 24px rgba(15,23,42,0.08); border-color:#BAE6FD; }
        .cr-chip { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; border-radius:100px; padding:3px 9px; background:#F1F5F9; color:${C.muted}; }
        .cr-filter-toggle { display:none; }
        .cr-nav-links { display:flex; }
        @media (max-width:900px) {
          .cr-layout { grid-template-columns:1fr !important; }
          .cr-aside { display:none; }
          .cr-aside.open { display:block; }
          .cr-filter-toggle { display:inline-flex; }
        }
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
        {needLogin ? (
          <LoginGate
            title="Accedi per vedere i corrieri registrati su BulkStrike"
            subtitle="L'elenco dei corrieri — con zone coperte e tempi di consegna — è riservato agli utenti registrati."
          />
        ) : (<>
        {/* Riga superiore: contatore + ricerca + toggle filtri (solo mobile) */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, marginBottom:18 }}>
          <div style={{ fontSize:14, color:C.muted }}>
            {loading ? "Caricamento corrieri…" : <><b style={{ color:C.text }}>{filtered.length}</b> {filtered.length === 1 ? "corriere" : "corrieri"}{activeFilters > 0 || q.trim() ? " (filtrati)" : ""}</>}
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ position:"relative", width:300, maxWidth:"100%" }}>
              <Search size={15} color={C.muted} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)" }}/>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca per nome, città o zona…"
                style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px 10px 36px", fontSize:13.5, outline:"none", fontFamily:"'Inter',system-ui", background:"#fff", color:C.text }} />
            </div>
            <button className="cr-filter-toggle" onClick={() => setShowFilters(!showFilters)}
              style={{ alignItems:"center", gap:6, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"10px 14px", fontSize:13, fontWeight:700, background:"#fff", cursor:"pointer", fontFamily:"'Inter',system-ui" }}>
              <SlidersHorizontal size={14}/> Filtri {activeFilters > 0 && `(${activeFilters})`}
            </button>
          </div>
        </div>

        <div className="cr-layout">
          {/* SIDEBAR FILTRI */}
          <aside className={`cr-aside${showFilters ? " open" : ""}`} style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:"6px 16px 18px", background:"#fff" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0 4px" }}>
              <span style={{ fontSize:14, fontWeight:800 }}>Filtri</span>
              {activeFilters > 0 && <span onClick={clearFilters} style={{ fontSize:12, color:C.blue, fontWeight:700, cursor:"pointer" }}>Azzera ({activeFilters})</span>}
            </div>

            <FilterTitle>Copertura</FilterTitle>
            <Opt on={scope === "national"} onClick={() => setScope(scope === "national" ? "all" : "national")}><Home size={13} style={{ marginRight:2 }}/> Nazionale</Opt>
            <Opt on={scope === "international"} onClick={() => setScope(scope === "international" ? "all" : "international")}><Globe size={13} style={{ marginRight:2 }}/> Internazionale</Opt>

            <FilterTitle>Modalità di trasporto</FilterTitle>
            {MODE_ORDER.map(m => (
              <Opt key={m} on={selModes.has(m)} onClick={() => toggleSet(setSelModes, m)}>{MODE_LABELS[m]}</Opt>
            ))}

            <FilterTitle>Paese di copertura</FilterTitle>
            <div style={{ maxHeight:220, overflowY:"auto" }}>
              {allCountries.length === 0 ? (
                <div style={{ fontSize:12.5, color:C.muted, padding:"4px 10px" }}>Nessun paese disponibile</div>
              ) : allCountries.map(co => (
                <Opt key={co} on={selCountries.has(co)} onClick={() => toggleSet(setSelCountries, co)}>
                  <CountryFlag country={co} /> {co}
                </Opt>
              ))}
            </div>

            {/* Rating: sezione presente ma disabilitata finché nessun corriere ha
                recensioni reali. Non nasconderla: mostrarla vuota con badge. */}
            <FilterTitle hint={<span style={{ fontSize:10, fontWeight:700, textTransform:"none", letterSpacing:0, background:"#F1F5F9", color:C.muted, borderRadius:100, padding:"1px 7px" }}>presto disponibile</span>}>Valutazione</FilterTitle>
            <div title={ratingAvailable ? "" : "Nessun corriere ha ancora recensioni: il filtro si attiva appena arrivano le prime."}>
              <Opt on={false} disabled>4,5 ★ e oltre</Opt>
              <Opt on={false} disabled>4,0 ★ e oltre</Opt>
            </div>

            <button className="cr-filter-toggle" onClick={() => setShowFilters(false)}
              style={{ marginTop:16, width:"100%", justifyContent:"center", padding:"12px", borderRadius:9, border:"none", background:"#0369A1", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
              Mostra {filtered.length} {filtered.length === 1 ? "corriere" : "corrieri"}
            </button>
          </aside>

          {/* COLONNA RISULTATI */}
          <main>
            {activeFilters > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
                {scope !== "all" && <Chip label={scope === "national" ? "Nazionale" : "Internazionale"} onClear={() => setScope("all")}/>}
                {[...selModes].map(m => <Chip key={m} label={MODE_LABELS[m]} onClear={() => toggleSet(setSelModes, m)}/>)}
                {[...selCountries].map(co => <Chip key={co} label={co} onClear={() => toggleSet(setSelCountries, co)}/>)}
              </div>
            )}

        {loading ? (
          <div style={{ padding:"60px 0", textAlign:"center", color:C.muted, fontSize:14 }}>Caricamento corrieri…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:"60px 20px", textAlign:"center", color:C.muted }}>
            <Truck size={30} color={C.border} style={{ marginBottom:10 }}/>
            <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:4 }}>Nessun corriere trovato</div>
            <div style={{ fontSize:13 }}>{carriers.length === 0 ? "Non ci sono ancora corrieri registrati." : "Prova a cambiare i filtri o la ricerca."}</div>
          </div>
        ) : (
          <div className="cr-grid">
            {filtered.map(c => {
              const zones = c.zones || [];
              const countries = c.countries || [];
              const modes = (c.modes || []).slice().sort((a, b) => MODE_ORDER.indexOf(a) - MODE_ORDER.indexOf(b));
              const shown = zones.slice(0, 6);
              const extra = zones.length - shown.length;
              const lt = leadTimeLabel(c.lead_time_min, c.lead_time_max);
              // Copertura solo generica (nessun paese esplicito, solo region tipo
              // "Europa"): lo si segnala così l'utente capisce che il corriere
              // probabilmente serve anche il suo paese pur non comparendo nel filtro.
              const genericOnly = countries.length === 0 && zones.length > 0;
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
                    <span className="cr-chip" style={{ background: c.is_international ? "#EFF6FF" : "#F1F5F9", color: c.is_international ? "#0369A1" : C.muted }}>
                      {c.is_international ? <Globe size={11}/> : <Home size={11}/>} {c.is_international ? "Internazionale" : "Nazionale"}
                    </span>
                    {modes.map(m => (
                      <span key={m} className="cr-chip" style={{ background:"#F5F3FF", color:"#6D28D9" }}><Truck size={11}/> {MODE_LABELS[m]}</span>
                    ))}
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
                  {genericOnly && (
                    <div style={{ fontSize:11, color:C.muted, marginTop:7, fontStyle:"italic", lineHeight:1.4 }}>
                      Copertura generica: probabilmente serve anche il tuo paese anche se non compare nel filtro per paese.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
          </main>
        </div>
        </>)}
      </div>

      {/* CTA per i corrieri: la gestione del listino sta nel profilo /corriere */}
      <div style={{ background:"#F8FAFE", borderTop:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1280, margin:"0 auto", padding:"40px 20px", textAlign:"center" }}>
          <h2 style={{ fontSize:22, fontWeight:900, letterSpacing:"-0.02em", marginBottom:8 }}>Sei un corriere?</h2>
          <p style={{ fontSize:14, color:C.muted, margin:"0 auto 20px", maxWidth:560 }}>
            Registrati e carica il tuo listino (anche in PDF, lo interpreta l'AI): riceverai le spedizioni dei fornitori BulkStrike sulle tratte che copri. La gestione delle tariffe è nel tuo profilo, alla voce Listino.
          </p>
          <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
            <button onClick={() => { window.location.href = "/corriere"; }} style={{ background:"#0369A1", color:"#fff", border:"none", borderRadius:10, padding:"13px 24px", fontSize:15, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:8, fontFamily:"'Inter',system-ui" }}>
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
