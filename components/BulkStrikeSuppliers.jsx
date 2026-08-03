"use client";
// BulkStrikeSuppliers — anagrafica pubblica dei fornitori verificati (/fornitori).
// Dati da get_suppliers_directory(); filtri client-side per paese, tipo,
// macro-area → settore, certificazioni, rating minimo. Deep-link via URL:
// ?macro= &sector= &country= &cert= &q= &type= (la tendina "Fornitori" in nav
// arriva qui con type=producer|distributor|importer)
import { useState, useEffect, useMemo } from "react";
import { Search, Star, ShieldCheck, ChevronRight, X, SlidersHorizontal, Package, Layers, Award, ArrowRight } from "lucide-react";
import { getSuppliersDirectory, getMacroAreas, getMyFollowedSectors, getMyFollowedSuppliers, followSector, unfollowSector, followSupplier, unfollowSupplier, getSession } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import LoginGate from "@/components/BulkStrikeLoginGate";
import { BSIcon } from "@/components/BSLogo";
import CountryFlag from "@/components/CountryFlag";
import { SupplierTypeBadges } from "@/components/BulkStrikeBadges";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706" };

const TYPE_LABEL = { producer:"Produttore", distributor:"Distributore", importer:"Importatore", broker:"Mediatore", trader:"Trader" };

// Opzioni del filtro "Tipo fornitore" e valori accettati dal deep-link ?type=.
// Rispecchia l'enum supplier_type del DB (producer/distributor/importer).
const TYPE_OPTIONS = [["producer","Produttore"],["distributor","Distributore"],["importer","Importatore"],["broker","Mediatore"]];

function Chip({ label, onClear }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:"#EFF6FF", color:"#0369A1", border:"1px solid #BAE6FD", borderRadius:100, padding:"5px 12px", fontSize:12.5, fontWeight:700 }}>
      {label}
      <X size={13} style={{ cursor:"pointer" }} onClick={onClear}/>
    </span>
  );
}

export default function SuppliersDirectory() {
  const [all, setAll] = useState([]);
  const [macrosTax, setMacrosTax] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false); // la RPC directory è solo per autenticati

  const [q, setQ] = useState("");
  const [countrySel, setCountrySel] = useState([]); // multi
  const [typeSel, setTypeSel] = useState([]);       // multi: producer | distributor | importer
  const [minRating, setMinRating] = useState(null); // 4 | 4.5
  const [certSel, setCertSel] = useState([]);       // multi
  const [activeMacro, setActiveMacro] = useState(null);   // slug
  const [activeSector, setActiveSector] = useState(null); // slug
  const [sort, setSort] = useState("rating");
  const [showFilters, setShowFilters] = useState(false);
  // Settori preferiti (sector_follows): stesso stato condiviso con il pannello
  // filtri del catalogo — la stella messa di là si ritrova accesa anche qui.
  const [followedSectorIds, setFollowedSectorIds] = useState(null); // Set | null
  // Fornitori preferiti (supplier_follows): include anche i fornitori
  // "ereditati" da un settore preferito (cascata lato DB in follow_sector).
  const [followedSupplierIds, setFollowedSupplierIds] = useState(null); // Set | null
  const [favOnly, setFavOnly] = useState(true); // default: solo preferiti (se ne ha)
  // Sezioni del pannello filtri: tutte CHIUSE di default (stato pulito). Una
  // sezione si apre al clic sull'intestazione o, all'avvio, se il suo filtro
  // arriva già valorizzato dall'URL (deep-link / mega-menu / back del browser).
  const [open, setOpen] = useState({ tipo:false, rating:false, paese:false, cert:false, settore:false });
  const toggleOpen = (k) => setOpen(o => ({ ...o, [k]: !o[k] }));

  const refetchFollowedSuppliers = () =>
    getMyFollowedSuppliers()
      .then(list => setFollowedSupplierIds(new Set((list || []).map(x => x.id))))
      .catch(() => setFollowedSupplierIds(prev => prev || new Set()));

  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      try {
        const [d, m] = await Promise.all([getSuppliersDirectory(), getMacroAreas()]);
        setAll(d || []); setMacrosTax(m || []);
      } catch {}
      setLoading(false);
      getMyFollowedSectors()
        .then(list => setFollowedSectorIds(new Set((list || []).map(x => x.sector_id))))
        .catch(() => setFollowedSectorIds(new Set()));
      refetchFollowedSuppliers();
    })();
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("macro")) setActiveMacro(sp.get("macro"));
    if (sp.get("sector")) setActiveSector(sp.get("sector"));
    // country/type accettano deep-link sia a valore singolo che a lista
    // separata da virgole (?country=Italia,Francia&type=producer,distributor),
    // per restare compatibili con eventuali link già in giro con un solo valore.
    const countryFromUrl = sp.get("country") ? sp.get("country").split(",").map(s => s.trim()).filter(Boolean) : [];
    if (countryFromUrl.length) setCountrySel(countryFromUrl);
    if (sp.get("cert")) setCertSel([sp.get("cert")]);
    if (sp.get("q")) setQ(sp.get("q"));
    const typesFromUrl = (sp.get("type") || "").split(",").map(s => s.trim()).filter(v => TYPE_OPTIONS.some(([tv]) => tv === v));
    if (typesFromUrl.length) setTypeSel(typesFromUrl);
    // Requisito 2: "chiuso di default" vale per lo stato pulito. Se un filtro è
    // imposto dall'URL, la sua sezione parte APERTA, così non resta nascosto.
    setOpen(o => ({
      ...o,
      tipo:    o.tipo    || typesFromUrl.length > 0,
      paese:   o.paese   || countryFromUrl.length > 0,
      cert:    o.cert    || !!sp.get("cert"),
      settore: o.settore || !!(sp.get("macro") || sp.get("sector")),
    }));
  }, []);

  // opzioni filtri derivate dai dati reali
  const countries = useMemo(() => [...new Set(all.map(s => s.country).filter(Boolean))].sort(), [all]);
  const allCerts = useMemo(() => [...new Set(all.flatMap(s => s.certifications || []))].sort(), [all]);

  const hasFavs = !!(followedSupplierIds && followedSupplierIds.size > 0);
  const favActive = hasFavs && favOnly; // la pagina è già riservata ai loggati

  const filtered = useMemo(() => {
    let list = all;
    const s = q.trim().toLowerCase();
    if (s) list = list.filter(f => (f.name || "").toLowerCase().includes(s));
    if (favActive) list = list.filter(f => followedSupplierIds.has(f.id));
    if (countrySel.length) list = list.filter(f => countrySel.includes(f.country));
    // Un'azienda può avere più ruoli (company_supplier_roles, es. produttore E
    // distributore): filtriamo su f.roles quando disponibile, con fallback al
    // singolo supplier_type per i pochissimi record senza roles popolate.
    if (typeSel.length) list = list.filter(f => typeSel.some(t => (f.roles && f.roles.length ? f.roles.includes(t) : f.supplier_type === t)));
    if (minRating != null) list = list.filter(f => Number(f.rating || 0) >= minRating);
    if (certSel.length) list = list.filter(f => certSel.every(c => (f.certifications || []).includes(c)));
    if (activeMacro) list = list.filter(f => (f.macros || []).includes(activeMacro));
    if (activeSector) list = list.filter(f => (f.sectors || []).includes(activeSector));
    list = [...list];
    if (sort === "rating") list.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || (b.reviews_count || 0) - (a.reviews_count || 0));
    else if (sort === "products") list.sort((a, b) => (b.product_count || 0) - (a.product_count || 0));
    else list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return list;
  }, [all, q, countrySel, typeSel, minRating, certSel, activeMacro, activeSector, sort, favActive, followedSupplierIds]);

  const activeMacroObj = macrosTax.find(m => m.slug === activeMacro);
  const activeSectorObj = (activeMacroObj?.sub_areas || []).find(s => s.slug === activeSector);
  const clearFilters = () => { setQ(""); setCountrySel([]); setTypeSel([]); setMinRating(null); setCertSel([]); setActiveMacro(null); setActiveSector(null); };
  const activeCount = countrySel.length+typeSel.length+(minRating?1:0)+certSel.length+(activeMacro?1:0)+(activeSector?1:0);
  // Stella settore: aggiornamento ottimistico con rollback + login se la RPC
  // fallisce — identico al pannello filtri del catalogo (stesso sector_follows).
  // La cascata lato DB propaga il follow anche ai FORNITORI del settore
  // (supplier_follows): merge ottimistico via f.sectors e refetch autoritativo
  // di get_my_followed_suppliers al successo, così il filtro "Preferiti" è
  // aggiornato subito, senza refresh (stesso pattern DAV-49 sui prodotti).
  const toggleSectorFollow = (e, sector) => {
    e.stopPropagation();
    const wasOn = !!(followedSectorIds && followedSectorIds.has(sector.id));
    const flip = (on) => setFollowedSectorIds(prev => {
      const n = new Set(prev || []); on ? n.add(sector.id) : n.delete(sector.id); return n;
    });
    const sectorSupplierIds = all.filter(f => (f.sectors || []).includes(sector.slug)).map(f => f.id);
    const prevSuppliers = followedSupplierIds; // snapshot per il rollback
    flip(!wasOn);
    setFollowedSupplierIds(prev => {
      const n = new Set(prev || []);
      sectorSupplierIds.forEach(id => { wasOn ? n.delete(id) : n.add(id); });
      return n;
    });
    (wasOn ? unfollowSector(sector.id) : followSector(sector.id))
      .then(refetchFollowedSuppliers)
      .catch(() => {
        flip(wasOn);
        setFollowedSupplierIds(prevSuppliers);
        window.location.href = "/auth/login";
      });
  };
  // Stella sulla card fornitore: stesso comportamento della stella prodotto
  // (aggiornamento ottimistico, rollback + login se la RPC fallisce).
  const toggleSupplierFollow = (e, supplierId) => {
    e.stopPropagation();
    const wasOn = !!(followedSupplierIds && followedSupplierIds.has(supplierId));
    const flip = (on) => setFollowedSupplierIds(prev => {
      const n = new Set(prev || []); on ? n.add(supplierId) : n.delete(supplierId); return n;
    });
    flip(!wasOn);
    (wasOn ? unfollowSupplier(supplierId) : followSupplier(supplierId)).catch(() => {
      flip(wasOn);
      window.location.href = "/auth/login"; // i preferiti richiedono un account
    });
  };
  const toggleCert = (c) => setCertSel(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  const toggleType = (v) => setTypeSel(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  const toggleCountry = (c) => setCountrySel(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  // Sezione filtro collassabile — stesso stile di "Settore" (intestazione
  // + chevron che ruota), ma come <button> accessibile (aria-expanded/controls).
  // Requisito 1: da chiusa mostra il numero di selezioni attive (· N).
  const FilterSection = ({ id, title, count = 0, open: isOpen, onToggle, children }) => (
    <>
      <button type="button" onClick={onToggle} aria-expanded={isOpen} aria-controls={id}
        style={{ display:"flex", alignItems:"center", gap:8, width:"100%", margin:"18px 0 8px", padding:0, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
        <span style={{ fontSize:12, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.04em", flex:1 }}>
          {title}{count > 0 ? ` · ${count}` : ""}
        </span>
        <ChevronRight size={14} color={C.muted} style={{ transform:isOpen ? "rotate(90deg)" : "none", transition:"transform 0.15s" }}/>
      </button>
      <div id={id} hidden={!isOpen}>{isOpen && children}</div>
    </>
  );
  const Opt = ({ on, onClick, children }) => (
    <div onClick={onClick} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:8, cursor:"pointer", background:on?"#EFF6FF":"transparent", fontSize:13, fontWeight:on?700:500, color:on?"#0369A1":C.text }}>
      <span style={{ width:15, height:15, borderRadius:4, border:`1.5px solid ${on?C.blue:C.border}`, background:on?C.blue:"#fff", display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
        {on && <span style={{ color:"#fff", fontSize:10, fontWeight:900 }}>✓</span>}
      </span>
      <span style={{ flex:1 }}>{children}</span>
    </div>
  );

  return (
    <div style={{ background:"#fff", color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", colorScheme:"light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .dir-num { font-family:'JetBrains Mono',monospace; }
        .dir-layout { display:grid; grid-template-columns:260px 1fr; gap:24px; align-items:start; }
        .dir-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:16px; }
        .dir-card { border:1px solid ${C.border}; border-radius:14px; padding:18px; background:#fff; display:flex; flex-direction:column; gap:12px; transition:box-shadow 0.2s, transform 0.2s; }
        .dir-card:hover { box-shadow:0 8px 32px rgba(14,165,233,0.10); transform:translateY(-2px); }
        .dir-filter-toggle { display:none; }
        @media (max-width:900px) {
          .dir-layout { grid-template-columns:1fr !important; }
          .dir-aside { display:none; }
          .dir-aside.open { display:block; }
          .dir-filter-toggle { display:inline-flex; }
          .dir-nav-links { display:none !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <BulkStrikeNav />

      <div style={{ maxWidth:1280, margin:"0 auto", padding:"22px 20px 60px" }}>

        {/* HEADER */}
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:14, marginBottom:20, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.blue, marginBottom:6 }}>Anagrafica</div>
            {/* DAV-33: "verified" ora significa "controllato da un admin" — la
                directory include anche i censiti in attesa di verifica, quindi
                niente più "tutti verificati" nel copy. */}
            <h1 style={{ fontSize:30, fontWeight:800, letterSpacing:"-0.02em" }}>Fornitori</h1>
            <p style={{ fontSize:14, color:C.muted, marginTop:6 }}>{needLogin ? "La directory dei fornitori è riservata agli utenti registrati." : `${all.length} fornitori su BulkStrike — il badge indica le aziende verificate dal nostro team; pagamento in escrow sui fornitori con listino.`}</p>
          </div>
          {!needLogin && <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, border:`1.5px solid ${C.border}`, borderRadius:9, padding:"9px 12px", minWidth:230, background:"#fff" }}>
              <Search size={15} color={C.muted}/>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca fornitore…" style={{ border:"none", outline:"none", fontSize:13.5, flex:1, fontFamily:"Inter,system-ui" }}/>
            </div>
            <select value={sort} onChange={e => setSort(e.target.value)} style={{ padding:"9px 12px", border:`1.5px solid ${C.border}`, borderRadius:9, fontSize:13, fontFamily:"Inter,system-ui", background:"#fff", cursor:"pointer" }}>
              <option value="rating">Rating più alto</option>
              <option value="products">Più prodotti</option>
              <option value="name">Nome A→Z</option>
            </select>
            <button className="dir-filter-toggle" onClick={() => setShowFilters(!showFilters)} style={{ alignItems:"center", gap:6, border:`1.5px solid ${C.border}`, borderRadius:9, padding:"9px 14px", fontSize:13, fontWeight:700, background:"#fff", cursor:"pointer", fontFamily:"Inter,system-ui" }}>
              <SlidersHorizontal size={14}/> Filtri {activeCount > 0 && `(${activeCount})`}
            </button>
          </div>}
        </div>

        {needLogin ? (
          <LoginGate
            title="Accedi per vedere i fornitori verificati su BulkStrike"
            subtitle="L'anagrafica completa dei fornitori — con settori, certificazioni e recensioni — è riservata agli utenti registrati."
          />
        ) : (
        <div className="dir-layout">
          {/* SIDEBAR FILTRI */}
          <aside className={`dir-aside${showFilters ? " open" : ""}`} style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:"6px 16px 18px", background:"#fff" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0 4px" }}>
              <span style={{ fontSize:14, fontWeight:800 }}>Filtri</span>
              {activeCount > 0 && <span onClick={clearFilters} style={{ fontSize:12, color:C.blue, fontWeight:700, cursor:"pointer" }}>Azzera ({activeCount})</span>}
            </div>

            {/* preferiti — stesso stile del checkbox in cima ai filtri del
                catalogo (DAV-48): mostra solo i fornitori seguiti, inclusi
                quelli ereditati dai settori preferiti (cascata lato DB). */}
            <label
              title={!hasFavs ? "Segui un fornitore o un settore per usare questo filtro" : favActive ? "Mostra tutti i fornitori" : "Mostra solo i preferiti"}
              style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 12px", border:`1px solid ${favActive ? "#FDE68A" : C.border}`, borderRadius:10, cursor:hasFavs ? "pointer" : "not-allowed", background:favActive ? "#FEF3C7" : "#fff", margin:"12px 0 4px", opacity:hasFavs ? 1 : 0.55 }}>
              <input type="checkbox" checked={favActive} disabled={!hasFavs} onChange={(e) => { if (hasFavs) setFavOnly(e.target.checked); }} style={{ accentColor:"#D97706", width:16, height:16 }} />
              <Star size={15} fill={favActive ? "#D97706" : "none"} color={favActive ? "#D97706" : C.amber} />
              <span style={{ fontSize:13, fontWeight:600, color:favActive ? "#B45309" : C.text }}>Preferiti</span>
            </label>

            <FilterSection id="flt-tipo" title="Tipo fornitore" count={typeSel.length} open={open.tipo} onToggle={() => toggleOpen("tipo")}>
              {TYPE_OPTIONS.map(([v,l]) => (
                <Opt key={v} on={typeSel.includes(v)} onClick={() => toggleType(v)}>{l}</Opt>
              ))}
            </FilterSection>

            <FilterSection id="flt-rating" title="Rating minimo" count={minRating ? 1 : 0} open={open.rating} onToggle={() => toggleOpen("rating")}>
              {[[4.5,"4,5 ★ e oltre"],[4,"4,0 ★ e oltre"]].map(([v,l]) => (
                <Opt key={v} on={minRating === v} onClick={() => setMinRating(minRating === v ? null : v)}>{l}</Opt>
              ))}
            </FilterSection>

            <FilterSection id="flt-paese" title="Paese sede" count={countrySel.length} open={open.paese} onToggle={() => toggleOpen("paese")}>
              <div style={{ maxHeight:180, overflowY:"auto" }}>
                {countries.map(c => (
                  <Opt key={c} on={countrySel.includes(c)} onClick={() => toggleCountry(c)}><CountryFlag country={c} /> {c}</Opt>
                ))}
              </div>
            </FilterSection>

            <FilterSection id="flt-cert" title="Certificazioni" count={certSel.length} open={open.cert} onToggle={() => toggleOpen("cert")}>
              <div style={{ maxHeight:170, overflowY:"auto" }}>
                {allCerts.map(c => (
                  <Opt key={c} on={certSel.includes(c)} onClick={() => toggleCert(c)}>{c}</Opt>
                ))}
              </div>
            </FilterSection>

            {/* settore — chiuso di default; si apre al click o da deep-link URL. */}
            <FilterSection id="flt-settore" title="Settore" count={(activeMacro ? 1 : 0) + (activeSector ? 1 : 0)} open={open.settore} onToggle={() => toggleOpen("settore")}>
            <div style={{ display:"flex", flexDirection:"column", gap:2, maxHeight:320, overflowY:"auto" }}>
              {macrosTax.map(m => {
                const on = activeMacro === m.slug;
                return (
                  <div key={m.id}>
                    <div onClick={() => { const next = on ? null : m.slug; setActiveMacro(next); setActiveSector(null); }}
                         style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:8, cursor:"pointer", background:on?"#EFF6FF":"transparent", fontSize:13, fontWeight:on?700:500, color:on?"#0369A1":C.text }}>
                      <span style={{ fontSize:14 }}>{m.icon || "📦"}</span>
                      <span style={{ flex:1 }}>{m.name}</span>
                      <ChevronRight size={13} color={C.muted} style={{ transform:on?"rotate(90deg)":"none", transition:"transform 0.15s" }}/>
                    </div>
                    {on && (
                      <div style={{ display:"flex", flexDirection:"column", gap:1, padding:"3px 0 6px 12px", borderLeft:`2px solid ${C.border}`, marginLeft:13 }}>
                        {[...(m.sub_areas || [])]
                          // I settori preferiti salgono in cima (a parità, ordine originale).
                          .sort((a, b) => (followedSectorIds?.has(b.id) ? 1 : 0) - (followedSectorIds?.has(a.id) ? 1 : 0))
                          .map(s => {
                          const son = activeSector === s.slug;
                          const fav = !!(followedSectorIds && followedSectorIds.has(s.id));
                          return (
                            <div key={s.id} onClick={() => setActiveSector(son ? null : s.slug)}
                                 style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 9px", borderRadius:7, cursor:"pointer", background:son?"#DBEAFE":"transparent", fontSize:12.5, fontWeight:son?700:500, color:son?"#0369A1":C.muted }}>
                              <span>{s.icon || "•"}</span>
                              <span style={{ flex:1 }}>{s.name}</span>
                              <button onClick={(e) => toggleSectorFollow(e, s)} aria-pressed={fav}
                                title={fav ? "Rimuovi dai settori preferiti" : "Aggiungi ai settori preferiti"}
                                style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", background:"transparent", border:"none", cursor:"pointer", padding:2, flexShrink:0 }}>
                                <Star size={13} fill={fav ? "#D97706" : "none"} color={fav ? "#D97706" : C.muted} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </FilterSection>

            <button className="dir-filter-toggle" onClick={() => setShowFilters(false)} style={{ marginTop:16, width:"100%", justifyContent:"center", padding:"12px", borderRadius:9, border:"none", background:"#0369A1", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
              Mostra {filtered.length} fornitori
            </button>
          </aside>

          {/* GRIGLIA */}
          <main>
            {activeCount > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
                {countrySel.map(c => <Chip key={c} label={<><CountryFlag country={c} /> {c}</>} onClear={() => toggleCountry(c)}/>)}
                {typeSel.map(t => <Chip key={t} label={TYPE_LABEL[t]} onClear={() => toggleType(t)}/>)}
                {minRating && <Chip label={`≥ ${minRating} ★`} onClear={() => setMinRating(null)}/>}
                {certSel.map(c => <Chip key={c} label={c} onClear={() => toggleCert(c)}/>)}
                {activeMacroObj && <Chip label={activeMacroObj.name} onClear={() => { setActiveMacro(null); setActiveSector(null); }}/>}
                {activeSectorObj && <Chip label={activeSectorObj.name} onClear={() => setActiveSector(null)}/>}
              </div>
            )}

            {loading ? (
              <div style={{ padding:"60px 0", textAlign:"center", color:C.muted, fontSize:14 }}>Caricamento fornitori…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding:"60px 20px", textAlign:"center", color:C.muted }}>
                <Package size={30} color={C.border} style={{ marginBottom:10 }}/>
                <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:4 }}>Nessun fornitore trovato</div>
                <div style={{ fontSize:13 }}>Prova ad allargare i filtri.</div>
              </div>
            ) : (
              <div className="dir-grid">
                {filtered.map(f => {
                  const initials = (f.name || "?").split(/\s+/).slice(0,2).map(w => w[0]).join("").toUpperCase();
                  const topSectors = (f.sector_names || []).slice(0, 3);
                  const more = Math.max(0, (f.sector_names || []).length - 3);
                  const favSup = !!(followedSupplierIds && followedSupplierIds.has(f.id));
                  return (
                    <div key={f.id} className="dir-card" onClick={() => { window.location.href = `/fornitore?id=${f.id}`; }} style={{ cursor:"pointer" }}>
                      <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                        <div style={{ width:52, height:52, borderRadius:12, background:"#EFF6FF", border:"1px solid #BFDBFE", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden" }}>
                          {f.logo_url
                            ? <img src={f.logo_url} alt={f.name} style={{ width:"100%", height:"100%", objectFit:"contain" }}/>
                            : <span style={{ fontSize:17, fontWeight:900, color:C.blue }}>{initials}</span>}
                        </div>
                        {/* stella preferito — stesso stile compatto della stella
                            sulle card prodotto, in alto accanto a logo/nome */}
                        <button onClick={(e) => toggleSupplierFollow(e, f.id)} aria-pressed={favSup}
                          title={favSup ? "Rimuovi dai fornitori preferiti" : "Aggiungi ai fornitori preferiti"}
                          style={{ order:2, marginLeft:"auto", alignSelf:"flex-start", display:"inline-flex", alignItems:"center", justifyContent:"center", width:32, height:32, borderRadius:8, background:favSup ? "#FEF3C7" : "#fff", border:`1.5px solid ${favSup ? "#FDE68A" : C.border}`, cursor:"pointer", flexShrink:0, padding:0 }}>
                          <Star size={15} fill={favSup ? "#D97706" : "none"} color={favSup ? "#D97706" : C.muted} />
                        </button>
                        <div style={{ minWidth:0 }}>
                          {/* Bandiera e nome restano nello stesso flusso: se il nome
                              va a capo, la bandiera lo segue invece di restare da sola
                              su una riga sopra. */}
                          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                            <span style={{ fontSize:15.5, fontWeight:800, lineHeight:1.3 }}>
                              <CountryFlag code={f.country_iso2} country={f.country} size={13} style={{ marginRight:6 }} />
                              {f.name}
                            </span>
                            <SupplierTypeBadges roles={f.roles} type={f.supplier_type} />
                            {/* Dopo DAV-33 il badge è significativo: solo le aziende
                                controllate davvero da un admin sono "verified". */}
                            {f.status === "verified" && <span title="Verificato da BulkStrike" style={{ display:"inline-flex", cursor:"help" }}><ShieldCheck size={14} color={C.green}/></span>}
                          </div>
                          <div style={{ fontSize:12.5, color:C.muted, marginTop:2 }}>
                            {TYPE_LABEL[f.supplier_type] || f.supplier_type} · {f.country}{f.city ? ` · ${f.city}` : ""}
                          </div>
                        </div>
                      </div>

                      <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:13 }}>
                        <Star size={13} fill={C.amber} color={C.amber}/>
                        <b>{f.rating != null ? Number(f.rating).toFixed(1) : "—"}</b>
                        <span style={{ color:C.muted }}>({f.reviews_count ?? 0})</span>
                      </div>

                      <div style={{ display:"flex", gap:14, fontSize:12, color:C.muted }}>
                        <span style={{ display:"flex", alignItems:"center", gap:4 }}><Package size={12}/><b className="dir-num" style={{ color:C.text }}>{f.product_count}</b> prodotti</span>
                        <span style={{ display:"flex", alignItems:"center", gap:4 }}><Layers size={12}/><b className="dir-num" style={{ color:C.text }}>{(f.sectors || []).length}</b> settori</span>
                        <span style={{ display:"flex", alignItems:"center", gap:4 }}><Award size={12}/><b className="dir-num" style={{ color:C.text }}>{(f.certifications || []).length}</b> cert.</span>
                      </div>

                      <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                        {topSectors.map(s => (
                          <span key={s.slug} style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11, fontWeight:600, borderRadius:100, padding:"3px 9px", background:C.bg, border:`1px solid ${C.border}`, color:C.muted }}>
                            <span>{s.icon || "📦"}</span>{s.name}
                          </span>
                        ))}
                        {more > 0 && <span style={{ fontSize:11, fontWeight:700, borderRadius:100, padding:"3px 9px", background:"#EFF6FF", color:"#0369A1" }}>+{more}</span>}
                      </div>

                      <div style={{ marginTop:"auto", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
                        {/* Via d'uscita sempre visibile per le aziende censite ma non
                            verificate (DAV-33-bis): porta al blocco #titolare del
                            profilo (rivendica o richiedi la rimozione). */}
                        {f.status !== "verified"
                          ? <a href={`/fornitore?id=${f.id}#titolare`} onClick={e => e.stopPropagation()}
                              style={{ fontSize:11, color:C.muted, textDecoration:"underline" }}>Sei il titolare?</a>
                          : <span/>}
                        <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:13, fontWeight:700, color:C.blue }}>
                          Vedi profilo <ArrowRight size={14}/>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
        )}
      </div>

      {/* FOOTER */}
      <div style={{ background:"#050D18", borderTop:"1px solid #1A3454", padding:"26px 24px" }}>
        <div style={{ maxWidth:1280, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:14 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
            <BSIcon size={26} uid="foot" />
            <span style={{ fontSize:15, fontWeight:900, color:"#F0F6FF", letterSpacing:"-0.03em" }}>Bulk<span style={{ background:"linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>Strike</span></span>
          </div>
          <div style={{ display:"flex", gap:18, flexWrap:"wrap" }}>
            {[["Termini","/legale#termini"],["Privacy","/legale#privacy"],["Contatti","mailto:info@bulkstrike.com"]].map(([l,href]) => (
              <a key={l} href={href} style={{ fontSize:13, color:"#3B5A7A", textDecoration:"none" }}>{l}</a>
            ))}
          </div>
          <div style={{ fontSize:13, color:"#3B5A7A" }}>© 2026 BulkStrike S.r.l.</div>
        </div>
      </div>
    </div>
  );
}
