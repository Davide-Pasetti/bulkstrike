"use client";
// BulkStrikeCatalog — pagina marketplace sfogliabile con filtri a faccette.
// Ispirata a PlasticFinder: griglia di card prodotto con miglior prezzo €/kg,
// n° fornitori, badge pool; sidebar filtri (macro-area → settore, prezzo, pool),
// ordinamento e ricerca. Tutto lato client sui dati di get_catalog().
// I prezzi (best_price) sono già IVA e spedizione escluse lato server (min
// price_per_kg dai price_tiers) — qui aggiungiamo solo la dicitura esplicita.
import { useState, useEffect, useMemo } from "react";
import { Search, ChevronRight, X, Flame, Package, SlidersHorizontal, ShieldCheck, Gavel, Layers, FileCheck2, Boxes } from "lucide-react";
import { getCatalog, getMacroAreas } from "@/lib/api";
import NavAuth from "@/components/BulkStrikeNavAuth";

const C = { blue: "#0EA5E9", dark: "#0284C7", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", amber: "#D97706", purple: "#7C3AED" };

function BSIcon({ size = 36, uid = "a" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#0D2137" /><stop offset="100%" stopColor="#0C4A6E" /></linearGradient>
        <linearGradient id={`ar${uid}`} x1="42" y1="12" x2="42" y2="40" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#38BDF8" /><stop offset="100%" stopColor="#22D3EE" /></linearGradient>
      </defs>
      <rect width="56" height="56" rx="13" fill={`url(#bg${uid})`} />
      <rect x="10" y="14" width="22" height="5.5" rx="2.75" fill="white" />
      <rect x="10" y="23" width="16" height="5.5" rx="2.75" fill="white" fillOpacity="0.65" />
      <rect x="10" y="32" width="10" height="5.5" rx="2.75" fill="white" fillOpacity="0.35" />
      <rect x="36" y="12" width="1" height="32" fill="white" fillOpacity="0.07" />
      <path d="M42 12 L42 34" stroke={`url(#ar${uid})`} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M35.5 28.5 L42 38 L48.5 28.5" stroke={`url(#ar${uid})`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

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
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [activeMacro, setActiveMacro] = useState(null); // slug
  const [activeSector, setActiveSector] = useState(null); // slug
  const [minP, setMinP] = useState("");
  const [maxP, setMaxP] = useState("");
  const [poolOnly, setPoolOnly] = useState(false);
  const [sort, setSort] = useState("name");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    Promise.all([getCatalog(), getMacroAreas()])
      .then(([c, m]) => { setAll(c || []); setMacros(m || []); setLoading(false); })
      .catch(() => setLoading(false));
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("macro")) setActiveMacro(sp.get("macro"));
    if (sp.get("sector")) setActiveSector(sp.get("sector"));
    if (sp.get("q")) setQ(sp.get("q"));
  }, []);

  const filtered = useMemo(() => {
    let list = all;
    const s = q.trim().toLowerCase();
    if (s) list = list.filter(p =>
      (p.name || "").toLowerCase().includes(s) ||
      (p.cas_number || "").toLowerCase().includes(s) ||
      (p.e_number || "").toLowerCase().includes(s));
    if (activeMacro) list = list.filter(p => (p.macros || []).includes(activeMacro));
    if (activeSector) list = list.filter(p => (p.sectors || []).includes(activeSector));
    if (poolOnly) list = list.filter(p => p.has_pool);
    const mn = parseFloat(minP), mx = parseFloat(maxP);
    if (!isNaN(mn)) list = list.filter(p => p.best_price != null && p.best_price >= mn);
    if (!isNaN(mx)) list = list.filter(p => p.best_price != null && p.best_price <= mx);
    list = [...list];
    if (sort === "price_asc") list.sort((a, b) => (a.best_price ?? 1e9) - (b.best_price ?? 1e9));
    else if (sort === "price_desc") list.sort((a, b) => (b.best_price ?? -1) - (a.best_price ?? -1));
    else if (sort === "suppliers") list.sort((a, b) => (b.supplier_count || 0) - (a.supplier_count || 0));
    else list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return list;
  }, [all, q, activeMacro, activeSector, poolOnly, minP, maxP, sort]);

  const activeMacroObj = macros.find(m => m.slug === activeMacro);
  const activeSectorObj = (activeMacroObj?.sub_areas || []).find(s => s.slug === activeSector);
  const clearFilters = () => { setQ(""); setActiveMacro(null); setActiveSector(null); setMinP(""); setMaxP(""); setPoolOnly(false); };
  const activeCount = (activeMacro ? 1 : 0) + (activeSector ? 1 : 0) + (poolOnly ? 1 : 0) + (minP ? 1 : 0) + (maxP ? 1 : 0);

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
      <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(255,255,255,0.96)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 20px", height: 64, display: "flex", alignItems: "center", gap: 18 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0, cursor: "pointer" }}>
            <BSIcon size={34} uid="nav" />
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.03em" }}>Bulk</span>
              <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Strike</span>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <div style={{ display: "flex", border: `2px solid ${C.blue}`, borderRadius: 10, overflow: "hidden", height: 42, width: "100%", maxWidth: 520, background: "#fff" }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca materie prime, CAS, E-number..." style={{ flex: 1, border: "none", padding: "0 14px", fontSize: 14, outline: "none", fontFamily: "Inter,system-ui" }} />
              <button style={{ background: C.blue, border: "none", padding: "0 16px", cursor: "pointer" }}><Search size={18} color="#fff" /></button>
            </div>
          </div>
          <div className="cat-nav-links" style={{ gap: 18, alignItems: "center" }}>
            {[["Pool", "/pool"], ["Catalogo", "/catalogo"], ["Fornitori", "/fornitori"]].map(([l, href]) => <span key={l} onClick={() => { window.location.href = href; }} style={{ fontSize: 14, color: C.muted, cursor: "pointer", fontWeight: 500 }}>{l}</span>)}
            <NavAuth />
          </div>
        </div>
      </nav>

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
              <span style={{ fontSize: 13, fontWeight: 600, color: poolOnly ? "#0369A1" : C.text }}>Solo con pool attivo</span>
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

            <button className="cat-filter-toggle" onClick={() => setShowFilters(false)} style={{ marginTop: 18, width: "100%", justifyContent: "center", padding: "12px", borderRadius: 9, border: "none", background: C.blue, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Mostra {filtered.length} risultati
            </button>
          </aside>

          {/* GRIGLIA PRODOTTI */}
          <main>
            {(activeMacro || activeSector) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {activeMacroObj && <Chip label={activeMacroObj.name} onClear={() => { setActiveMacro(null); setActiveSector(null); }} />}
                {activeSector && <Chip label={(activeMacroObj?.sub_areas || []).find(s => s.slug === activeSector)?.name || activeSector} onClear={() => setActiveSector(null)} />}
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
                      {p.has_pool && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, color: "#B45309", background: "#FEF3C7", borderRadius: 100, padding: "3px 8px", flexShrink: 0 }}><Flame size={11} />POOL</span>}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25, flex: 1 }}>{p.name}</div>
                    {(p.cas_number || p.e_number) && (
                      <div style={{ fontSize: 11, color: C.muted }}>{[p.e_number, p.cas_number && `CAS ${p.cas_number}`].filter(Boolean).join(" · ")}</div>
                    )}
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                      <div>
                        <div style={{ fontSize: 10, color: C.muted }}>da</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: C.blue, letterSpacing: "-0.02em", lineHeight: 1 }}>€{fmt(p.best_price)}<span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>/kg*</span></div>
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
