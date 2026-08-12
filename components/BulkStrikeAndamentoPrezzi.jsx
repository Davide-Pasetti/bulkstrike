"use client";
// ============================================================
// BulkStrike — "Andamento prezzi" (screener stile terminale di mercato).
// Filtro per macro-area (le 13 esistenti), elenco prodotti col prezzo attuale
// BulkStrike + variazione "da gennaio" del riferimento esterno; espandendo un
// prodotto, grafico a DUE linee:
//   A = prezzo storico proprietario BulkStrike (transazioni: aste + Acquisto Rapido)
//   B = riferimento esterno: ISMEA/CUN (€/kg del prodotto) o Indice di SETTORE
//       Eurostat (etichettato esplicitamente come indice condiviso, non prezzo).
// Se manca A → solo B; se manca B → solo A; se mancano entrambe → messaggio,
// mai grafico vuoto. Dicitura fonte solo sotto il dato esterno.
// ============================================================
import { useState, useEffect, useMemo, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Search, ChevronDown, ChevronRight, TrendingDown, TrendingUp, Activity } from "lucide-react";
import { getPriceScreener, getProductPriceHistory, getMarketPriceSeries, getMarketIndexSeries, getMacroAreas, getCatalog, getChemicalClasses, getMyFollowedProducts, getMyFollowedSectors, followSector, unfollowSector, getSession } from "@/lib/api";
import { ytdChange } from "@/lib/priceTrend";
import PriceSourceNote from "@/components/PriceSourceNote";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import BulkStrikeCatalogFilters from "@/components/BulkStrikeCatalogFilters";
import { Star } from "lucide-react";

const C = { blue: "#0EA5E9", dark: "#0284C7", purple: "#7C3AED", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", card: "#fff" };
const eurKg = (n) => "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monthLabel = (t) => { const [y, m] = String(t).slice(0, 10).split("-"); return `${m}/${y.slice(2)}`; };

// Costruisce il dataset unito per il grafico (per data): { t, a, b }.
function mergeSeries(lineA, extSeries, extKind) {
  const map = new Map();
  for (const p of lineA || []) {
    const t = String(p.t).slice(0, 10);
    const o = map.get(t) || { t }; o.a = Number(p.price); map.set(t, o);
  }
  for (const p of extSeries || []) {
    const t = String(p.t).slice(0, 10);
    const val = extKind === "index" ? p.index : p.v;
    const o = map.get(t) || { t }; o.b = (val == null ? null : Number(val)); map.set(t, o);
  }
  return [...map.values()].sort((x, y) => (x.t < y.t ? -1 : x.t > y.t ? 1 : 0));
}

function VarPill({ v }) {
  if (v == null || !isFinite(v)) return <span style={{ color: C.muted }}>—</span>;
  const up = v > 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: up ? C.red : C.green, fontWeight: 700 }}>
      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{up ? "+" : ""}{v.toFixed(1)}%
    </span>
  );
}

function CoverageBadges({ row }) {
  const b = [];
  if (row.has_history) b.push(["Storico", C.blue]);
  if (row.external === "agri") b.push(["ISMEA/CUN", C.purple]);
  else if (row.external === "index") b.push(["Indice settore", C.purple]);
  if (!b.length) return <span style={{ fontSize: 11.5, color: "#94A3B8" }}>—</span>;
  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
      {b.map(([label, col]) => (
        <span key={label} style={{ fontSize: 10.5, fontWeight: 700, color: col, background: col + "14", border: `1px solid ${col}33`, borderRadius: 5, padding: "2px 7px" }}>{label}</span>
      ))}
    </span>
  );
}

function ExpandedChart({ row }) {
  const [loading, setLoading] = useState(true);
  const [lineA, setLineA] = useState([]);
  const [ext, setExt] = useState(null); // { kind:'agri'|'index', label, fonte, fonte_url, last, series:[{t,..}] }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const pB = row.external === "agri" ? getMarketPriceSeries(row.id)
      : row.external === "index" ? getMarketIndexSeries(row.id) : Promise.resolve(null);
    Promise.all([getProductPriceHistory(row.id).catch(() => []), pB.catch(() => null)]).then(([a, b]) => {
      if (!alive) return;
      setLineA(a || []);
      if (b && Array.isArray(b.series) && b.series.length) {
        if (row.external === "agri") setExt({ kind: "agri", label: `${b.fonte || "ISMEA/CUN"} — prezzo di mercato (€/kg)`, fonte: b.fonte, fonte_url: b.fonte_url, last: b.last_date, series: b.series });
        else setExt({ kind: "index", label: `Indice di settore: ${b.nace_label || "PPI"} — fonte Eurostat`, fonte: b.fonte || "Eurostat", fonte_url: b.fonte_url, last: b.last_month, series: b.series });
      } else setExt(null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [row.id]);

  if (loading) return <div style={{ padding: "26px 4px", fontSize: 13, color: C.muted }}>Caricamento andamento…</div>;

  const hasA = lineA.length > 0;
  const hasB = !!ext;
  if (!hasA && !hasB) {
    return (
      <div style={{ padding: "26px 20px", textAlign: "center", color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 12, background: C.bg }}>
        <Activity size={22} color="#94A3B8" style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>Storico non ancora disponibile per questo prodotto</div>
        <div style={{ fontSize: 12.5, marginTop: 4 }}>La copertura cresce con le transazioni sulla piattaforma e con le fonti esterne collegate.</div>
      </div>
    );
  }

  const isIndexB = hasB && ext.kind === "index";
  const data = mergeSeries(lineA, hasB ? ext.series : [], hasB ? ext.kind : null);
  const aYtd = hasA ? ytdChange(lineA.map(p => ({ t: p.t, v: p.price })), "v") : null;

  return (
    <div style={{ padding: "6px 2px 2px" }}>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline", marginBottom: 10 }}>
        {row.best_price != null && (
          <div>
            <span style={{ fontSize: 11.5, color: C.muted }}>Prezzo attuale BulkStrike</span>
            <div className="bs-num" style={{ fontSize: 22, fontWeight: 800, color: C.blue }}>{eurKg(row.best_price)}<span style={{ fontSize: 12, fontWeight: 400, color: C.muted }}>/kg</span></div>
          </div>
        )}
        {aYtd != null && (
          <div><span style={{ fontSize: 11.5, color: C.muted }}>Prezzo BulkStrike da gennaio</span><div style={{ fontSize: 16 }}><VarPill v={aYtd} /></div></div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 6, right: isIndexB ? 6 : 8, bottom: 0, left: -8 }}>
          <XAxis dataKey="t" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={monthLabel} minTickGap={28} />
          <YAxis yAxisId="left" tick={{ fill: C.muted, fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v) => `€${Number(v).toFixed(1)}`} />
          {isIndexB && <YAxis yAxisId="right" orientation="right" tick={{ fill: C.purple, fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v) => Number(v).toFixed(0)} />}
          <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 12 }} labelFormatter={monthLabel}
            formatter={(val, name) => [name.startsWith("Indice") ? Number(val).toFixed(1) : `€${Number(val).toFixed(2)}/kg`, name]} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
          {hasA && <Line yAxisId="left" type="monotone" dataKey="a" name="Prezzo BulkStrike (€/kg)" stroke={C.blue} strokeWidth={2.6} dot={{ fill: C.blue, r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />}
          {hasB && <Line yAxisId={isIndexB ? "right" : "left"} type="monotone" dataKey="b" name={ext.label} stroke={C.purple} strokeWidth={2.2} strokeDasharray={isIndexB ? "5 4" : undefined} dot={false} activeDot={{ r: 4 }} connectNulls />}
        </LineChart>
      </ResponsiveContainer>

      {/* Dicitura fonte SOLO per il dato esterno (non per il proprietario BulkStrike). */}
      {hasB && (
        ext.kind === "agri"
          ? <PriceSourceNote fonte={ext.fonte} fonteUrl={ext.fonte_url} lastDate={ext.last} muted={C.muted} border={C.border} />
          : (
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              La linea tratteggiata è un <b>indice di tendenza settoriale</b> Eurostat (base 2021=100), condiviso tra più prodotti dello stesso settore — <b>non</b> il prezzo diretto di questo prodotto. Fonte: {ext.fonte_url ? <a href={ext.fonte_url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue }}>Eurostat</a> : "Eurostat"}{ext.last ? ` · ultimo mese ${monthLabel(ext.last)}` : ""}.
            </div>
          )
      )}
    </div>
  );
}

export default function AndamentoPrezziPage() {
  const [rows, setRows] = useState(null);          // get_price_screener
  const [catalog, setCatalog] = useState([]);      // get_catalog (per settore/famiglia)
  const [macros, setMacros] = useState([]);
  const [chemGroups, setChemGroups] = useState([]);
  const [expanded, setExpanded] = useState(null);

  // Filtri: stessi del catalogo, senza "Aste attive" (non pertinente allo storico).
  const [q, setQ] = useState("");
  const [activeMacro, setActiveMacro] = useState(null);
  const [activeSector, setActiveSector] = useState(null);
  const [activeClasses, setActiveClasses] = useState(() => new Set());
  const [openAree, setOpenAree] = useState(false);
  const [openChemGroups, setOpenChemGroups] = useState(() => new Set());
  const [priceOnly, setPriceOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [favOnly, setFavOnly] = useState(true);    // Preferiti selezionato di default
  const [followedIds, setFollowedIds] = useState(null);
  const [followedSectorIds, setFollowedSectorIds] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const didAutoExpand = useRef(false);

  useEffect(() => {
    getPriceScreener().then(setRows).catch(() => setRows([]));
    getCatalog().then(c => setCatalog(c || [])).catch(() => setCatalog([]));
    getMacroAreas().then(setMacros).catch(() => {});
    getChemicalClasses().then(g => setChemGroups(g || [])).catch(() => {});
    getMyFollowedSectors().then(list => setFollowedSectorIds(new Set((list || []).map(x => x.sector_id)))).catch(() => setFollowedSectorIds(new Set()));
    getSession().then(s => {
      setSessionReady(true);
      if (!s) { setLoggedIn(false); return; }
      setLoggedIn(true);
      getMyFollowedProducts().then(list => setFollowedIds(new Set((list || []).map(x => x.product_id)))).catch(() => setFollowedIds(new Set()));
    }).catch(() => { setLoggedIn(false); setSessionReady(true); });
  }, []);

  const hasFavs = !!(followedIds && followedIds.size > 0);
  const favActive = loggedIn && hasFavs && favOnly;

  // Le righe screener espongono solo macro_slugs/best_price: le arricchisco con
  // settore/famiglia chimica dal catalogo (stesso id) per far funzionare i filtri.
  const rowsEnriched = useMemo(() => {
    if (!rows) return [];
    const catMap = new Map((catalog || []).map(p => [p.id, p]));
    return rows.map(r => {
      const cat = catMap.get(r.id) || {};
      return {
        ...r,
        macros: (cat.macros && cat.macros.length ? cat.macros : (r.macro_slugs || [])),
        sectors: cat.sectors || [],
        chemical_classes: cat.chemical_classes || [],
        best_price: r.best_price ?? cat.best_price ?? null,
      };
    });
  }, [rows, catalog]);

  const filtered = useMemo(() => {
    let list = rowsEnriched;
    const qq = q.trim().toLowerCase();
    if (qq) list = list.filter(r => (r.name || "").toLowerCase().includes(qq));
    if (activeMacro) list = list.filter(r => (r.macros || []).includes(activeMacro));
    if (activeSector) list = list.filter(r => (r.sectors || []).includes(activeSector));
    if (activeClasses.size) list = list.filter(r => (r.chemical_classes || []).some(c => activeClasses.has(c)));
    if (favActive) list = list.filter(r => followedIds.has(r.id));
    if (priceOnly) list = list.filter(r => r.best_price != null);
    const cover = (r) => (r.has_history ? 2 : 0) + (r.external ? 1 : 0);
    return [...list].sort((a, b) => (cover(b) - cover(a)) || (a.name || "").localeCompare(b.name || ""));
  }, [rowsEnriched, q, activeMacro, activeSector, activeClasses, favActive, priceOnly, followedIds]);

  const covered = filtered.filter(r => r.has_history || r.external).length;

  // All'apertura espande il grafico del PRIMO prodotto in elenco, così è subito
  // chiaro che le righe sono espandibili. Aspetta che sessione e preferiti siano
  // risolti, per rispettare il default "Preferiti" (evita di aprire un prodotto
  // che poi il filtro preferiti nasconderebbe). Solo la prima volta.
  useEffect(() => {
    if (didAutoExpand.current || rows == null || !sessionReady) return;
    if (loggedIn && followedIds == null) return; // preferiti ancora in caricamento
    if (filtered.length > 0) { setExpanded(filtered[0].id); didAutoExpand.current = true; }
  }, [rows, sessionReady, loggedIn, followedIds, filtered]);

  const toggleClass = (slug) => setActiveClasses(prev => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  const toggleChemGroup = (slug) => setOpenChemGroups(prev => { const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  // Stella settore: stesso comportamento del catalogo (ottimistico + rollback→login).
  const toggleSectorFollow = (e, sector) => {
    e.stopPropagation();
    const wasOn = !!(followedSectorIds && followedSectorIds.has(sector.id));
    const flipSector = (on) => setFollowedSectorIds(prev => { const n = new Set(prev || []); on ? n.add(sector.id) : n.delete(sector.id); return n; });
    const sectorProductIds = (catalog || []).filter(p => (p.sectors || []).includes(sector.slug)).map(p => p.id);
    const prevProducts = followedIds;
    flipSector(!wasOn);
    setFollowedIds(prev => { const n = new Set(prev || []); sectorProductIds.forEach(id => { wasOn ? n.delete(id) : n.add(id); }); return n; });
    (wasOn ? unfollowSector(sector.id) : followSector(sector.id))
      .then(() => getMyFollowedProducts().then(list => setFollowedIds(new Set((list || []).map(x => x.product_id)))).catch(() => {}))
      .catch(() => { flipSector(wasOn); setFollowedIds(prevProducts); window.location.href = "/auth/login"; });
  };
  const clearFilters = () => { setQ(""); setActiveMacro(null); setActiveSector(null); setActiveClasses(new Set()); setPriceOnly(false); };
  const activeCount = (activeMacro ? 1 : 0) + (activeSector ? 1 : 0) + activeClasses.size + (priceOnly ? 1 : 0);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "Inter, system-ui, sans-serif", color: C.text, colorScheme: "light" }}>
      <style>{`
        .cat-layout { display:grid; grid-template-columns:264px 1fr; gap:24px; }
        .cat-sidebar { position:sticky; top:80px; align-self:start; max-height:calc(100vh - 96px); overflow-y:auto; }
        .cat-filter-toggle { display:none; }
        @media (max-width:860px) {
          .cat-layout { grid-template-columns:1fr; }
          .cat-sidebar { position:fixed; inset:0; z-index:200; background:#fff; max-height:none; padding:20px; display:${showFilters ? "block" : "none"}; }
          .cat-filter-toggle { display:inline-flex; }
        }
        .ap-row:hover { background: ${C.bg} !important; }
        @media (max-width:768px){
          .ap-row { grid-template-columns: 1fr auto 26px !important; }
          .ap-row > div:nth-child(3), .ap-row > div:nth-child(4) { display:none; }
        }
      `}</style>
      <BulkStrikeNav />
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 20px 64px" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.09em", color: C.blue, textTransform: "uppercase", marginBottom: 6 }}>Andamento prezzi</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Prezzi di mercato delle materie prime</h1>
        <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.6, maxWidth: 720, margin: "0 0 22px" }}>
          Il prezzo reale sulla piattaforma BulkStrike affiancato, dove disponibile, al riferimento di mercato esterno (ISMEA/CUN per gli agricoli, indici settoriali Eurostat per gli altri comparti). La copertura cresce nel tempo.
        </p>

        {/* toolbar: apri filtri (mobile) + ricerca */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <button className="cat-filter-toggle" onClick={() => setShowFilters(true)} style={{ alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.text }}>
            Filtri{activeCount > 0 ? ` · ${activeCount}` : ""}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", flex: 1, minWidth: 220, maxWidth: 420 }}>
            <Search size={16} color={C.muted} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca materia prima…" style={{ border: "none", outline: "none", fontSize: 14, width: "100%", fontFamily: "Inter, system-ui", background: "transparent", color: C.text }} />
          </div>
        </div>

        <div className="cat-layout">
          <BulkStrikeCatalogFilters
            showPool={false}
            activeCount={activeCount} clearFilters={clearFilters} setShowFilters={setShowFilters}
            favActive={favActive} loggedIn={loggedIn} hasFavs={hasFavs} favOnly={favOnly} setFavOnly={setFavOnly}
            poolOnly={false} setPoolOnly={() => {}}
            priceOnly={priceOnly} setPriceOnly={setPriceOnly}
            openAree={openAree} setOpenAree={setOpenAree}
            macros={macros} activeMacro={activeMacro} setActiveMacro={setActiveMacro} activeSector={activeSector} setActiveSector={setActiveSector}
            followedSectorIds={followedSectorIds} toggleSectorFollow={toggleSectorFollow}
            chemGroups={chemGroups} openChemGroups={openChemGroups} toggleChemGroup={toggleChemGroup}
            activeClasses={activeClasses} toggleClass={toggleClass}
            resultsCount={filtered.length}
          />

          <main>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{rows == null ? "Caricamento…" : `${filtered.length} prodotti · ${covered} con andamento disponibile`}</div>

            {/* Preferiti attivo ma nessun preferito: invito, non tabella vuota. */}
            {loggedIn && followedIds && !hasFavs && favOnly && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 16px", marginBottom: 14, fontSize: 13.5, color: "#92400E" }}>
                <Star size={17} color="#D97706" style={{ flexShrink: 0 }} />
                <span>Non segui ancora nessuna materia prima. Aggiungile con la <b>stella</b> ⭐ dal <a href="/catalogo" style={{ color: "#B45309", fontWeight: 700 }}>catalogo</a> per ritrovarle qui filtrate come <b>Preferiti</b>.</span>
              </div>
            )}

            {/* Tabella screener */}
            <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 120px 150px 34px", gap: 10, padding: "11px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <span>Materia prima</span>
                <span style={{ textAlign: "right" }}>Prezzo BulkStrike</span>
                <span style={{ textAlign: "right" }}>Var. da gennaio</span>
                <span>Andamento</span>
                <span />
              </div>
              {rows == null ? (
                <div style={{ padding: 24, fontSize: 13, color: C.muted }}>Caricamento…</div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 24, fontSize: 13, color: C.muted }}>{favActive ? "Nessun prodotto tra i tuoi preferiti per questo filtro." : "Nessun prodotto per questo filtro."}</div>
              ) : filtered.map(r => {
                const open = expanded === r.id;
                return (
                  <div key={r.id} style={{ borderBottom: `1px solid #F1F5F9` }}>
                    <div onClick={() => setExpanded(open ? null : r.id)}
                      className="ap-row"
                      style={{ display: "grid", gridTemplateColumns: "1fr 130px 120px 150px 34px", gap: 10, padding: "12px 16px", alignItems: "center", cursor: "pointer", background: open ? C.bg : "#fff" }}>
                      <div>
                        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{r.name}</div>
                        {r.primary_macro && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{r.primary_macro}</div>}
                      </div>
                      <div className="bs-num" style={{ textAlign: "right", fontSize: 15, fontWeight: 700, color: r.best_price != null ? C.text : "#94A3B8" }}>{r.best_price != null ? eurKg(r.best_price) : "—"}</div>
                      <div style={{ textAlign: "right", fontSize: 13.5 }}><VarPill v={r.ext_ytd} /></div>
                      <div><CoverageBadges row={r} /></div>
                      <div style={{ display: "flex", justifyContent: "center", color: C.muted }}>{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</div>
                    </div>
                    {open && <div style={{ padding: "4px 16px 18px", background: C.bg }}><ExpandedChart row={r} /></div>}
                  </div>
                );
              })}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
