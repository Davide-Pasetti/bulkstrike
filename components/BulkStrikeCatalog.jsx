"use client";
// BulkStrikeCatalog — pagina marketplace sfogliabile con filtri a faccette.
// Ispirata a PlasticFinder: griglia di card prodotto con miglior prezzo €/kg,
// n° fornitori, badge pool; sidebar filtri (macro-area → settore, prezzo, pool),
// ordinamento e ricerca. Tutto lato client sui dati di get_catalog().
// I prezzi (best_price) sono già IVA e spedizione escluse lato server (min
// price_per_kg dai price_tiers) — qui aggiungiamo solo la dicitura esplicita.
// La barra di ricerca in nav usa il componente condiviso ProductSearch:
// dropdown di suggerimenti (nome+CAS+E-number+sinonimi) e, in parallelo,
// filtra live la griglia mentre digiti (onQueryChange → setQ).
import { useState, useEffect, useMemo } from "react";
import { ChevronRight, X, Flame, Package, SlidersHorizontal, ShieldCheck, Gavel, Layers, FileCheck2, Boxes, Star } from "lucide-react";
import { getCatalog, getMacroAreas, getChemicalClasses, getMyFollowedProducts, getSession } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import ProductFollowButton from "@/components/BulkStrikeProductFollow";
import { BSIcon } from "@/components/BSLogo";
import { IvaChip } from "@/components/BulkStrikeBadges";

const C = { blue: "#0EA5E9", dark: "#0284C7", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", amber: "#D97706", purple: "#7C3AED" };

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const BENEFITS = [
  { icon: ShieldCheck, title: "Anonimato garantito", text: "Le identità di acquirenti e fornitori restano riservate fino alla chiusura." },
  { icon: FileCheck2, title: "Pagamento in escrow", text: "Il fornitore viene pagato solo dopo la conferma di consegna conforme." },
  { icon: Gavel, title: "Aste al ribasso", text: "I fornitori certificati competono: il prezzo può solo scendere." },
  { icon: Layers, title: "Aggregazione volumi", text: "Più aziende insieme sbloccano scaglioni di prezzo più bassi per tutti." },
  { icon: Boxes, title: "600+ materie prime", text: "Dalla chimica di base all'edilizia, farmaceutica, tessile e oltre." },
  { icon: FileCheck2, title: "Conformità normativa", text: "Standard e certificazioni dichiarati per ogni materia prima." },
];

export default function CatalogPage() {
  const [all, setAll] = useState([]);
  const [macros, setMacros] = useState([]);
  const [chemGroups, setChemGroups] = useState([]); // [{slug,name,ord,classes:[...]}]
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [activeMacro, setActiveMacro] = useState(null); // slug
  const [activeSector, setActiveSector] = useState(null); // slug
  const [activeClasses, setActiveClasses] = useState(() => new Set()); // slug[] (multi, OR)
  // Le due sotto-sezioni di "Tipo di sostanza" partono aperte; l'utente le chiude.
  const [openChemGroups, setOpenChemGroups] = useState(() => new Set(["famiglia-chimica", "tipo-materiale"]));
  const [minP, setMinP] = useState("");
  const [maxP, setMaxP] = useState("");
  const [poolOnly, setPoolOnly] = useState(false);
  const [sort, setSort] = useState("name");
  const [showFilters, setShowFilters] = useState(false);
  const [favOnly, setFavOnly] = useState(true);          // default: solo preferiti
  const [followedIds, setFollowedIds] = useState(null);  // Set | null (non caricato)
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    Promise.all([getCatalog(), getMacroAreas(), getChemicalClasses()])
      .then(([c, m, cg]) => { setAll(c || []); setMacros(m || []); setChemGroups(cg || []); setLoading(false); })
      .catch(() => setLoading(false));
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("macro")) setActiveMacro(sp.get("macro"));
    if (sp.get("sector")) setActiveSector(sp.get("sector"));
    if (sp.get("sostanza")) setActiveClasses(new Set(sp.get("sostanza").split(",").map(s => s.trim()).filter(Boolean)));
    if (sp.get("q")) setQ(sp.get("q"));
    getSession().then(s => {
      if (!s) { setLoggedIn(false); return; }
      setLoggedIn(true);
      getMyFollowedProducts()
        .then(list => setFollowedIds(new Set((list || []).map(x => x.product_id))))
        .catch(() => setFollowedIds(new Set()));
    }).catch(() => setLoggedIn(false));
  }, []);

  const hasFavs = !!(followedIds && followedIds.size > 0);
  // Preferiti attivo solo se loggato, con almeno un preferito e toggle ON.
  const favActive = loggedIn && hasFavs && favOnly;
  const toggleFollow = (productId, next) => setFollowedIds(prev => {
    const set = new Set(prev || []);
    if (next) set.add(productId); else set.delete(productId);
    return set;
  });

  const filtered = useMemo(() => {
    let list = all;
    const s = q.trim().toLowerCase();
    if (s) list = list.filter(p =>
      (p.name || "").toLowerCase().includes(s) ||
      (p.cas_number || "").toLowerCase().includes(s) ||
      (p.e_number || "").toLowerCase().includes(s));
    if (activeMacro) list = list.filter(p => (p.macros || []).includes(activeMacro));
    if (activeSector) list = list.filter(p => (p.sectors || []).includes(activeSector));
    // Tipo di sostanza: multi-selezione, semantica OR (almeno una classe combacia).
    if (activeClasses.size) list = list.filter(p => (p.chemical_classes || []).some(c => activeClasses.has(c)));
    if (poolOnly) list = list.filter(p => p.has_pool);
    if (favActive) list = list.filter(p => followedIds.has(p.id));
    const mn = parseFloat(minP), mx = parseFloat(maxP);
    if (!isNaN(mn)) list = list.filter(p => p.best_price != null && p.best_price >= mn);
    if (!isNaN(mx)) list = list.filter(p => p.best_price != null && p.best_price <= mx);
    list = [...list];
    if (sort === "price_asc") list.sort((a, b) => (a.best_price ?? 1e9) - (b.best_price ?? 1e9));
    else if (sort === "price_desc") list.sort((a, b) => (b.best_price ?? -1) - (a.best_price ?? -1));
    else if (sort === "suppliers") list.sort((a, b) => (b.supplier_count || 0) - (a.supplier_count || 0));
    else list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return list;
  }, [all, q, activeMacro, activeSector, activeClasses, poolOnly, minP, maxP, sort, favActive, followedIds]);

  const activeMacroObj = macros.find(m => m.slug === activeMacro);
  const activeSectorObj = (activeMacroObj?.sub_areas || []).find(s => s.slug === activeSector);
  // Mappa slug→nome classe, per le chip dei filtri attivi.
  const classNameBySlug = useMemo(() => {
    const map = {};
    chemGroups.forEach(g => (g.classes || []).forEach(c => { map[c.slug] = c.name; }));
    return map;
  }, [chemGroups]);
  const toggleClass = (slug) => setActiveClasses(prev => {
    const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n;
  });
  const toggleChemGroup = (slug) => setOpenChemGroups(prev => {
    const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n;
  });
  const clearFilters = () => { setQ(""); setActiveMacro(null); setActiveSector(null); setActiveClasses(new Set()); setMinP(""); setMaxP(""); setPoolOnly(false); };
  const activeCount = (activeMacro ? 1 : 0) + (activeSector ? 1 : 0) + activeClasses.size + (poolOnly ? 1 : 0) + (minP ? 1 : 0) + (maxP ? 1 : 0);

  return (
    <div style={{ background: "#fff", color: C.text, fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh", colorScheme: "light" }}>
      <style>{`
        .cat-layout { display:grid; grid-template-columns:264px 1fr; gap:24px; }
        .cat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:14px; }
        .cat-card { transition:transform 0.12s, box-shadow 0.12s; }
        .cat-card:hover { transform:translateY(-2px); box-shadow:0 10px 24px rgba(15,23,42,0.08); border-color:#BAE6FD !important; }
        .cat-sidebar { position:sticky; top:80px; align-self:start; max-height:calc(100vh - 96px); overflow-y:auto; }
        .cat-filter-toggle { display:none; }
        .cat-nav-links { display:flex; }
        @media (max-width:860px) {
          .cat-layout { grid-template-columns:1fr; }
          .cat-sidebar { position:fixed; inset:0; z-index:200; background:#fff; max-height:none; padding:20px; display:${showFilters ? "block" : "none"}; }
          .cat-filter-toggle { display:inline-flex; }
          .cat-nav-links { display:none; }
        }
        .cat-benefit:hover { border-color:#BAE6FD !important; }
      `}</style>

      {/* NAV */}
      <BulkStrikeNav />

      {/* HEADER */}
      <div style={{ borderBottom: `1px solid ${C.border}`, background: "linear-gradient(135deg,#F8FAFF,#F0FDFF)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "26px 20px" }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span onClick={() => { window.location.href = "/"; }} style={{ cursor: "pointer" }}>Home</span><ChevronRight size={12} /><span style={{ color: C.text, fontWeight: 600 }}>Catalogo</span>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 6px" }}>Catalogo materie prime</h1>
          <p style={{ fontSize: 15, color: C.muted, margin: 0 }}>Sfoglia le materie prime disponibili con prezzo indicativo, fornitori e aste attive. Filtra per area, prezzo o disponibilità.</p>
        </div>
      </div>

      {/* BODY */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "22px 20px 40px" }}>
        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 4 }}>
          <div style={{ fontSize: 14, color: C.muted }}>
            {loading ? "Caricamento catalogo…" : <><b style={{ color: C.text }}>{filtered.length}</b> materie prime{activeCount > 0 ? " (filtrate)" : ""}</>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="cat-filter-toggle" onClick={() => setShowFilters(true)} style={{ alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.text }}>
              <SlidersHorizontal size={15} /> Filtri{activeCount > 0 ? ` · ${activeCount}` : ""}
            </button>
            {loggedIn && hasFavs && (
              <button onClick={() => setFavOnly(v => !v)} title={favOnly ? "Mostra tutte le materie prime" : "Mostra solo i preferiti"}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: `1px solid ${favOnly ? "#FDE68A" : C.border}`, background: favOnly ? "#FEF3C7" : "#fff", color: favOnly ? "#B45309" : C.text, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>
                <Star size={14} fill={favOnly ? "#D97706" : "none"} color={favOnly ? "#D97706" : C.muted} /> Preferiti
              </button>
            )}
            <span style={{ fontSize: 13, color: C.muted }}>Ordina</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", fontSize: 13, fontFamily: "Inter,system-ui", color: C.text, cursor: "pointer" }}>
              <option value="name">Nome (A→Z)</option>
              <option value="price_asc">Prezzo crescente</option>
              <option value="price_desc">Prezzo decrescente</option>
              <option value="suppliers">Più fornitori</option>
            </select>
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>* Prezzi IVA esclusa · spedizione esclusa (calcolate al checkout)</div>

        <div className="cat-layout">
          {/* SIDEBAR FILTRI */}
          <aside className="cat-sidebar">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Filtri</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {activeCount > 0 && <span onClick={clearFilters} style={{ fontSize: 12, color: C.blue, cursor: "pointer", fontWeight: 600 }}>Pulisci</span>}
                <button className="cat-filter-toggle" onClick={() => setShowFilters(false)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}><X size={20} color={C.muted} /></button>
              </div>
            </div>

            {/* pool attivo */}
            <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", border: `1px solid ${poolOnly ? "#0EA5E9" : C.border}`, borderRadius: 10, cursor: "pointer", background: poolOnly ? "#EFF6FF" : "#fff", marginBottom: 18 }}>
              <input type="checkbox" checked={poolOnly} onChange={(e) => setPoolOnly(e.target.checked)} style={{ accentColor: C.blue, width: 16, height: 16 }} />
              <Flame size={15} color={poolOnly ? C.blue : C.amber} />
              <span style={{ fontSize: 13, fontWeight: 600, color: poolOnly ? "#0369A1" : C.text }}>Solo con asta attiva</span>
            </label>

            {/* prezzo */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Prezzo €/kg <span style={{ fontWeight: 400, textTransform: "none" }}>· IVA escl.</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" value={minP} onChange={(e) => setMinP(e.target.value)} placeholder="min" style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "Inter,system-ui" }} />
                <span style={{ color: C.muted }}>–</span>
                <input type="number" value={maxP} onChange={(e) => setMaxP(e.target.value)} placeholder="max" style={{ width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "Inter,system-ui" }} />
              </div>
            </div>

            {/* macro-aree + settori */}
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Aree</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {macros.map(m => {
                const on = activeMacro === m.slug;
                return (
                  <div key={m.id}>
                    <div onClick={() => { const next = on ? null : m.slug; setActiveMacro(next); setActiveSector(null); }}
                      style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: on ? "#EFF6FF" : "transparent", fontSize: 13, fontWeight: on ? 700 : 500, color: on ? "#0369A1" : C.text }}>
                      <span style={{ fontSize: 15 }}>{m.icon || "📦"}</span>
                      <span style={{ flex: 1 }}>{m.name}</span>
                      <ChevronRight size={14} color={C.muted} style={{ transform: on ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                    </div>
                    {on && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "4px 0 8px 14px", borderLeft: `2px solid ${C.border}`, marginLeft: 14 }}>
                        {(m.sub_areas || []).filter(s => (s.product_count || 0) > 0).map(s => {
                          const son = activeSector === s.slug;
                          return (
                            <div key={s.id} onClick={() => setActiveSector(son ? null : s.slug)}
                              style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", borderRadius: 7, cursor: "pointer", background: son ? "#DBEAFE" : "transparent", fontSize: 12.5, fontWeight: son ? 700 : 500, color: son ? "#0369A1" : C.muted }}>
                              <span>{s.icon || "•"}</span>
                              <span style={{ flex: 1 }}>{s.name}</span>
                              <span style={{ fontSize: 11, color: C.muted }}>{s.product_count}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* tipo di sostanza (tassonomia chimica) — 2 gruppi collassabili,
                multi-selezione con semantica OR. Indipendente dalle Aree. */}
            {chemGroups.length > 0 && (
              <div style={{ marginTop: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Tipo di sostanza</div>
                {chemGroups.map(g => {
                  const gopen = openChemGroups.has(g.slug);
                  return (
                    <div key={g.slug} style={{ marginBottom: 4 }}>
                      <div onClick={() => toggleChemGroup(g.slug)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: C.text }}>
                        <span style={{ flex: 1 }}>{g.name}</span>
                        <ChevronRight size={14} color={C.muted} style={{ transform: gopen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                      </div>
                      {gopen && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "2px 0 6px 6px" }}>
                          {(g.classes || []).map(c => {
                            const con = activeClasses.has(c.slug);
                            return (
                              <label key={c.slug}
                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, cursor: "pointer", background: con ? "#DBEAFE" : "transparent", fontSize: 12.5, fontWeight: con ? 700 : 500, color: con ? "#0369A1" : C.muted }}>
                                <input type="checkbox" checked={con} onChange={() => toggleClass(c.slug)} style={{ accentColor: C.blue, width: 14, height: 14, flexShrink: 0 }} />
                                <span style={{ flex: 1 }}>{c.name}</span>
                                <span style={{ fontSize: 11, color: C.muted }}>{c.product_count}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button className="cat-filter-toggle" onClick={() => setShowFilters(false)} style={{ marginTop: 18, width: "100%", justifyContent: "center", padding: "12px", borderRadius: 9, border: "none", background: C.blue, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Mostra {filtered.length} risultati
            </button>
          </aside>

          {/* GRIGLIA PRODOTTI */}
          <main>
            {(activeMacro || activeSector || activeClasses.size > 0) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {activeMacroObj && <Chip label={activeMacroObj.name} onClear={() => { setActiveMacro(null); setActiveSector(null); }} />}
                {activeSector && <Chip label={(activeMacroObj?.sub_areas || []).find(s => s.slug === activeSector)?.name || activeSector} onClear={() => setActiveSector(null)} />}
                {[...activeClasses].map(slug => <Chip key={slug} label={classNameBySlug[slug] || slug} onClear={() => toggleClass(slug)} />)}
              </div>
            )}

            {loggedIn && followedIds && !hasFavs && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 16px", marginBottom: 14, fontSize: 13.5, color: "#92400E" }}>
                <Star size={17} color="#D97706" style={{ flexShrink: 0 }} />
                <span>Segui le materie prime che ti interessano con la <b>stella</b> ⭐ sulle card: la prossima volta le ritrovi subito qui, filtrate come <b>Preferiti</b>.</span>
              </div>
            )}
            {loading ? (
              <div style={{ padding: "60px 0", textAlign: "center", color: C.muted, fontSize: 14 }}>Caricamento catalogo…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "60px 20px", textAlign: "center", color: C.muted }}>
                <Package size={30} color={C.border} style={{ marginBottom: 10 }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>Nessuna materia prima trovata</div>
                <div style={{ fontSize: 13 }}>Prova ad allargare i filtri o cambiare ricerca.</div>
              </div>
            ) : (
              <div className="cat-grid">
                {filtered.map(p => (
                  <div key={p.id} className="cat-card" onClick={() => { window.location.href = `/prodotto?id=${p.id}`; }}
                    style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, cursor: "pointer", background: "#fff", display: "flex", flexDirection: "column", gap: 10, minHeight: 150 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: C.muted, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 100, padding: "3px 9px", maxWidth: "100%", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      <span>{activeSectorObj?.icon || p.primary_icon || "📦"}</span>{activeSectorObj?.name || p.primary_sector || "Materie prime"}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                        {p.has_pool && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, color: "#B45309", background: "#FEF3C7", borderRadius: 100, padding: "3px 8px", flexShrink: 0 }}><Flame size={11} />ASTA</span>}
                        <ProductFollowButton productId={p.id} following={!!(followedIds && followedIds.has(p.id))} onChange={(next) => toggleFollow(p.id, next)} compact muted={C.muted} border={C.border} />
                      </div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25, flex: 1 }}>{p.name}</div>
                    {(p.cas_number || p.e_number) && (
                      <div style={{ fontSize: 11, color: C.muted }}>{[p.e_number, p.cas_number && `CAS ${p.cas_number}`].filter(Boolean).join(" · ")}</div>
                    )}
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                      <div>
                        <div style={{ fontSize: 10, color: C.muted }}>da</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: C.blue, letterSpacing: "-0.02em", lineHeight: 1 }}>€{fmt(p.best_price)}<span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>/kg</span></div>
                        <IvaChip style={{ marginTop: 4 }} />
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, textAlign: "right" }}>{p.supplier_count} {p.supplier_count === 1 ? "fornitore" : "fornitori"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* BENEFICI (ispirati a PlasticFinder) */}
      <div style={{ background: "#F8FAFE", borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "44px 20px" }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textAlign: "center", marginBottom: 8 }}>Perché comprare su BulkStrike</h2>
          <p style={{ fontSize: 14, color: C.muted, textAlign: "center", margin: "0 0 28px" }}>Il mercato B2B delle materie prime sfuse, a prezzi industriali.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
            {BENEFITS.map((b, i) => (
              <div key={i} className="cat-benefit" style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px", display: "flex", gap: 13, alignItems: "flex-start", transition: "border-color 0.12s" }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <b.icon size={18} color={C.blue} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{b.title}</div>
                  <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.45 }}>{b.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ background: "#050D18", padding: "28px 20px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
            <BSIcon size={26} uid="foot" /><span style={{ fontSize: 15, fontWeight: 900, color: "#F0F6FF" }}>BulkStrike</span>
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {[["Termini", "/legale#termini"], ["Privacy", "/legale#privacy"], ["Cookie", "/legale#cookie"], ["Contatti", "mailto:info@bulkstrike.com"]].map(([l, href]) => <a key={l} href={href} style={{ fontSize: 13, color: "#3B5A7A", cursor: "pointer", textDecoration: "none" }}>{l}</a>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, onClear }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 100, background: "#EFF6FF", border: "1px solid #BAE6FD", fontSize: 12.5, fontWeight: 600, color: "#0369A1" }}>
      {label}
      <X size={13} style={{ cursor: "pointer" }} onClick={onClear} />
    </span>
  );
}
