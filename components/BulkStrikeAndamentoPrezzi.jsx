"use client";
// ============================================================
// BulkStrike — "Andamento prezzi" (screener stile terminale di mercato).
// UNA riga per INDICATORE monitorato (non più una per prodotto): ogni indicatore
// ha una curva propria e distinta. Gli indicatori sono raggruppati per famiglia
// (Chimica, Metalli e minerali, Agroalimentare, Energia e logistica, Indici
// globali). Il primo indicatore in elenco è aperto di default, così è subito
// chiaro che le righe sono espandibili. Espandendo, grafico a linea singola
// dell'indice + fonte, licenza e link, con la nota che un indice di settore NON è
// il prezzo del singolo prodotto.
// Colonna sinistra: filtri (Famiglia / Fonte / Frequenza + "Solo prezzi").
// ============================================================
import { useState, useEffect, useMemo, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Search, ChevronDown, ChevronRight, TrendingDown, TrendingUp, Activity, Star, X } from "lucide-react";
import { getIndicatorScreener, getIndicatorSeries, getMyFollowedIndicators, getSession } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";

const C = { blue: "#0EA5E9", dark: "#0284C7", purple: "#7C3AED", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", card: "#fff" };
const monthLabel = (t) => { const [y, m] = String(t).slice(0, 10).split("-"); return `${m}/${y.slice(2)}`; };

// Ordine e nomi delle famiglie mostrate. Un indicatore con famiglia non elencata
// finisce comunque in coda sotto "Altri indicatori" (robustezza).
const FAMILIES = [
  ["chimica", "Chimica"],
  ["metalli", "Metalli e minerali"],
  ["agroalimentare", "Agroalimentare"],
  ["energia_logistica", "Energia e logistica"],
  ["indici_globali", "Indici globali"],
];
const FAM_LABEL = Object.fromEntries(FAMILIES);
const FREQ_LABEL = { giornaliera: "Giornaliera", settimanale: "Settimanale", mensile: "Mensile" };

// Variazione a 12 mesi in %, da ultimo valore e valore di un anno prima.
function yoyPct(row) {
  const a = row.last_value, b = row.value_yoy;
  if (a == null || b == null || Number(b) === 0) return null;
  return (Number(a) / Number(b) - 1) * 100;
}

function fmtVal(v, tipo) {
  if (v == null) return "—";
  const n = Number(v);
  // indici: 1 decimale senza valuta; prezzi (futuri): 2 decimali.
  return tipo === "prezzo" ? n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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

// Sparkline SVG leggera dai 24 punti già presenti nello screener (nessuna fetch).
// Colore per direzione: salita = rossa (costo in aumento per chi compra).
function Sparkline({ points, up }) {
  if (!Array.isArray(points) || points.length < 2) return <span style={{ fontSize: 11, color: "#CBD5E1" }}>—</span>;
  const vals = points.map(p => Number(p.v));
  const min = Math.min(...vals), max = Math.max(...vals);
  const w = 108, h = 30, pad = 3;
  const dx = (w - 2 * pad) / (points.length - 1);
  const y = (v) => (max === min ? h / 2 : pad + (h - 2 * pad) * (1 - (v - min) / (max - min)));
  const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${(pad + i * dx).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const col = up ? C.red : C.green;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={col} strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Grafico esteso di un indicatore: serie completa via get_indicator_series.
function IndicatorChart({ row }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    getIndicatorSeries(row.slug).then(r => { if (alive) setData(r || { series: [] }); }).catch(() => { if (alive) setData({ series: [] }); });
    return () => { alive = false; };
  }, [row.slug]);

  if (!data) return <div style={{ padding: "24px 4px", fontSize: 13, color: C.muted }}>Caricamento andamento…</div>;
  const series = (data.series || []).map(p => ({ t: String(p.t).slice(0, 10), v: Number(p.v) }));
  if (series.length === 0) {
    return (
      <div style={{ padding: "26px 20px", textAlign: "center", color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 12, background: "#fff" }}>
        <Activity size={22} color="#94A3B8" style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>Storico non ancora disponibile per questo indicatore</div>
      </div>
    );
  }
  const isIndex = (data.tipo || row.tipo) !== "prezzo";
  const sym = (data.valuta || row.valuta) === "USD" ? "$" : "€";
  return (
    <div style={{ padding: "6px 2px 2px" }}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
          <XAxis dataKey="t" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={monthLabel} minTickGap={28} />
          <YAxis tick={{ fill: C.muted, fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v) => (isIndex ? Number(v).toFixed(0) : `${sym}${Number(v).toFixed(Number(v) < 10 ? 2 : 0)}`)} />
          <Tooltip contentStyle={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 12 }} labelFormatter={monthLabel}
            formatter={(val) => [isIndex ? Number(val).toFixed(1) : `${sym}${Number(val).toFixed(2)}`, data.unita || row.unita]} />
          <Line type="monotone" dataKey="v" name={row.nome} stroke={C.purple} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>

      {/* Sotto OGNI grafico: fonte, licenza, link + nota "non è il prezzo del prodotto". */}
      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.55, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
        <b>{data.fonte || row.fonte}</b>
        {(data.licenza || row.licenza) ? ` · licenza ${data.licenza || row.licenza}` : ""}
        {(data.last_date) ? ` · ultimo dato ${monthLabel(data.last_date)}` : ""}
        {(data.fonte_url || row.fonte_url) ? <> · <a href={data.fonte_url || row.fonte_url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, fontWeight: 600 }}>fonte</a></> : null}
        {isIndex && (
          <div style={{ marginTop: 5 }}>
            È un <b>indice di tendenza settoriale</b> (base 2021=100), condiviso tra più prodotti dello stesso settore: <b>non</b> il prezzo del singolo prodotto.
          </div>
        )}
        {(data.attribuzione || row.attribuzione) && <div style={{ marginTop: 4, fontStyle: "italic" }}>{data.attribuzione || row.attribuzione}</div>}
      </div>
    </div>
  );
}

// Riga accordion di un gruppo di filtro (Famiglia / Fonte / Frequenza).
function FilterGroup({ title, open, onToggle, options, selected, onToggleOption, labelFor }) {
  if (!options.length) return null;
  return (
    <div style={{ marginBottom: 4 }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: C.text }}>
        <span style={{ flex: 1 }}>{title}</span>
        <ChevronRight size={14} color={C.muted} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
      </div>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "2px 0 6px 6px" }}>
          {options.map(opt => {
            const on = selected.has(opt.key);
            return (
              <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, cursor: "pointer", background: on ? "#DBEAFE" : "transparent", fontSize: 12.5, fontWeight: on ? 700 : 500, color: on ? "#0369A1" : C.muted }}>
                <input type="checkbox" checked={on} onChange={() => onToggleOption(opt.key)} style={{ accentColor: C.blue, colorScheme: "light", width: 15, height: 15, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{labelFor ? labelFor(opt.key) : opt.key}</span>
                <span style={{ fontSize: 11, color: C.muted }}>{opt.count}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AndamentoPrezziPage() {
  const [rows, setRows] = useState(null);          // get_indicator_screener
  const [expanded, setExpanded] = useState(null);  // slug aperto
  const [q, setQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [priceOnly, setPriceOnly] = useState(false); // "Solo prezzi (nascondi gli indici)"
  const [famSel, setFamSel] = useState(() => new Set());
  const [fonteSel, setFonteSel] = useState(() => new Set());
  const [freqSel, setFreqSel] = useState(() => new Set());
  const [openGroups, setOpenGroups] = useState(() => new Set(["fam"]));
  const didAutoExpand = useRef(false);
  // Preferiti (nuova semantica): indicatori legati ai prodotti seguiti. ON di
  // default come nel catalogo; per l'anonimo o chi non segue nulla è inattivo.
  const [favOnly, setFavOnly] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [followedInd, setFollowedInd] = useState(null); // Set di slug, null = in caricamento
  const [deepSlug, setDeepSlug] = useState(null); // ?slug= dalla scheda prodotto → apri quell'indicatore

  // Deep-link ?slug=: apri quell'indicatore invece del primo. Se presente,
  // disattivo "Preferiti" cosi' l'indicatore e' visibile anche se non e' seguito.
  useEffect(() => {
    try {
      const s = new URLSearchParams(window.location.search).get("slug");
      if (s) { setDeepSlug(s); setFavOnly(false); }
    } catch { /* no-op */ }
  }, []);

  useEffect(() => {
    getIndicatorScreener().then(setRows).catch(() => setRows([]));
    getSession().then(s => {
      if (!s) { setLoggedIn(false); return; }
      setLoggedIn(true);
      getMyFollowedIndicators().then(list => setFollowedInd(new Set(list || []))).catch(() => setFollowedInd(new Set()));
    }).catch(() => setLoggedIn(false));
  }, []);

  const hasFavs = !!(followedInd && followedInd.size > 0);
  const favActive = loggedIn && hasFavs && favOnly;

  const toggleSet = (setter) => (key) => setter(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleFam = toggleSet(setFamSel), toggleFonte = toggleSet(setFonteSel), toggleFreq = toggleSet(setFreqSel);
  const toggleGroup = (g) => setOpenGroups(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });

  // Opzioni dei filtri derivate dai dati (le nuove fonti/frequenze compaiono da sole).
  const famOptions = useMemo(() => buildOptions(rows, "famiglia"), [rows]);
  const fonteOptions = useMemo(() => buildOptions(rows, "fonte"), [rows]);
  const freqOptions = useMemo(() => buildOptions(rows, "frequenza"), [rows]);

  const filtered = useMemo(() => {
    let list = rows || [];
    const qq = q.trim().toLowerCase();
    if (qq) list = list.filter(r => (r.nome || "").toLowerCase().includes(qq));
    if (favActive) list = list.filter(r => followedInd.has(r.slug));
    if (priceOnly) list = list.filter(r => r.tipo === "prezzo");
    if (famSel.size) list = list.filter(r => famSel.has(r.famiglia));
    if (fonteSel.size) list = list.filter(r => fonteSel.has(r.fonte));
    if (freqSel.size) list = list.filter(r => freqSel.has(r.frequenza));
    return list;
  }, [rows, q, favActive, followedInd, priceOnly, famSel, fonteSel, freqSel]);

  // Raggruppa per famiglia nell'ordine fisso; le famiglie ignote vanno in coda.
  const groups = useMemo(() => {
    const byFam = new Map();
    for (const r of filtered) { const k = r.famiglia || "altri"; if (!byFam.has(k)) byFam.set(k, []); byFam.get(k).push(r); }
    for (const arr of byFam.values()) arr.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
    const ordered = [];
    for (const [key, label] of FAMILIES) if (byFam.has(key)) { ordered.push([label, byFam.get(key)]); byFam.delete(key); }
    for (const [key, arr] of byFam) ordered.push([FAM_LABEL[key] || "Altri indicatori", arr]);
    return ordered;
  }, [filtered]);

  // Sequenza piatta filtrata (per l'auto-espansione del primo indicatore).
  const flatOrder = useMemo(() => groups.flatMap(([, arr]) => arr), [groups]);

  useEffect(() => {
    if (didAutoExpand.current || rows == null) return;
    if (loggedIn && followedInd == null) return; // aspetta i preferiti (rispetta il default ON)
    // deep-link ?slug= valido → apri quello e scrolla; altrimenti il primo in lista.
    const target = (deepSlug && (rows || []).some(r => r.slug === deepSlug)) ? deepSlug : (flatOrder[0] && flatOrder[0].slug);
    if (target) {
      setExpanded(target);
      didAutoExpand.current = true;
      setTimeout(() => { const el = document.getElementById(`ind-${target}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 140);
    }
  }, [rows, loggedIn, followedInd, flatOrder, deepSlug]);

  const clearFilters = () => { setQ(""); setPriceOnly(false); setFamSel(new Set()); setFonteSel(new Set()); setFreqSel(new Set()); };
  const activeCount = (priceOnly ? 1 : 0) + famSel.size + fonteSel.size + freqSel.size;

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
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Indicatori di prezzo delle materie prime</h1>
        <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.6, maxWidth: 720, margin: "0 0 22px" }}>
          Gli indicatori di mercato che monitoriamo, ognuno con una sua curva. Indici di prezzo alla produzione per settore (Eurostat) e, dove disponibili, prezzi di mercato da fonti ufficiali. Clicca un indicatore per vederne l'andamento completo, con fonte e licenza.
        </p>

        {/* toolbar: apri filtri (mobile) + ricerca */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <button className="cat-filter-toggle" onClick={() => setShowFilters(true)} style={{ alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.text }}>
            Filtri{activeCount > 0 ? ` · ${activeCount}` : ""}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", flex: 1, minWidth: 220, maxWidth: 420 }}>
            <Search size={16} color={C.muted} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca un indicatore…" style={{ border: "none", outline: "none", fontSize: 14, width: "100%", fontFamily: "Inter, system-ui", background: "transparent", color: C.text }} />
          </div>
        </div>

        <div className="cat-layout">
          {/* SIDEBAR FILTRI — Famiglia / Fonte / Frequenza + "Solo prezzi". */}
          <aside className="cat-sidebar">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Filtri</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {activeCount > 0 && <span onClick={clearFilters} style={{ fontSize: 12, color: C.blue, cursor: "pointer", fontWeight: 600 }}>Pulisci</span>}
                <button className="cat-filter-toggle" onClick={() => setShowFilters(false)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}><X size={20} color={C.muted} /></button>
              </div>
            </div>

            {/* Preferiti — indicatori legati alle materie prime che segui.
                Anonimo: click → login; loggato senza preferiti: disabilitato. */}
            <label
              onClick={!loggedIn ? (e) => { e.preventDefault(); window.location.href = "/auth/login"; } : undefined}
              title={!loggedIn ? "Accedi per filtrare i tuoi preferiti" : !hasFavs ? "Segui materie prime con la stella ⭐ dal catalogo" : favOnly ? "Mostra tutti gli indicatori" : "Mostra solo gli indicatori dei tuoi preferiti"}
              style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", border: `1px solid ${favActive ? "#FDE68A" : C.border}`, borderRadius: 10, cursor: (loggedIn && !hasFavs) ? "not-allowed" : "pointer", background: favActive ? "#FEF3C7" : "#fff", marginBottom: 10, opacity: (loggedIn && !hasFavs) ? 0.55 : 1 }}>
              <input type="checkbox" checked={favActive} disabled={loggedIn && !hasFavs} onChange={(e) => { if (loggedIn && hasFavs) setFavOnly(e.target.checked); }} style={{ accentColor: "#D97706", colorScheme: "light", width: 16, height: 16 }} />
              <Star size={15} fill={favActive ? "#D97706" : "none"} color={favActive ? "#D97706" : C.muted} />
              <span style={{ fontSize: 13, fontWeight: 600, color: favActive ? "#B45309" : C.text, flex: 1 }}>Preferiti</span>
            </label>

            {/* Solo prezzi (nascondi gli indici) */}
            <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", border: `1px solid ${priceOnly ? "#0EA5E9" : C.border}`, borderRadius: 10, cursor: "pointer", background: priceOnly ? "#EFF6FF" : "#fff", marginBottom: 16 }}>
              <input type="checkbox" checked={priceOnly} onChange={e => setPriceOnly(e.target.checked)} style={{ accentColor: C.blue, colorScheme: "light", width: 16, height: 16 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: priceOnly ? "#0369A1" : C.text }}>Solo prezzi (nascondi gli indici)</span>
            </label>

            <FilterGroup title="Famiglia" open={openGroups.has("fam")} onToggle={() => toggleGroup("fam")}
              options={famOptions} selected={famSel} onToggleOption={toggleFam} labelFor={(k) => FAM_LABEL[k] || k} />
            <FilterGroup title="Fonte" open={openGroups.has("fonte")} onToggle={() => toggleGroup("fonte")}
              options={fonteOptions} selected={fonteSel} onToggleOption={toggleFonte} />
            <FilterGroup title="Frequenza" open={openGroups.has("freq")} onToggle={() => toggleGroup("freq")}
              options={freqOptions} selected={freqSel} onToggleOption={toggleFreq} labelFor={(k) => FREQ_LABEL[k] || k} />

            <button className="cat-filter-toggle" onClick={() => setShowFilters(false)} style={{ marginTop: 18, width: "100%", justifyContent: "center", padding: "12px", borderRadius: 9, border: "none", background: "#0369A1", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Mostra {filtered.length} indicatori
            </button>
          </aside>

          <main>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{rows == null ? "Caricamento…" : `${filtered.length} indicatori monitorati`}</div>

            {/* Preferiti attivo ma nessun preferito: invito, non tabella vuota. */}
            {loggedIn && followedInd && !hasFavs && favOnly && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 16px", marginBottom: 14, fontSize: 13.5, color: "#92400E" }}>
                <Star size={17} color="#D97706" style={{ flexShrink: 0 }} />
                <span>Non segui ancora nessuna materia prima. Aggiungile con la <b>stella</b> ⭐ dal <a href="/catalogo" style={{ color: "#B45309", fontWeight: 700 }}>catalogo</a> per vedere qui filtrati gli indicatori che le riguardano.</span>
              </div>
            )}

            {rows == null ? (
              <div style={{ padding: 24, fontSize: 13, color: C.muted }}>Caricamento…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 24, fontSize: 13, color: C.muted, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14 }}>{favActive ? "Nessun indicatore tra i tuoi preferiti per questo filtro." : "Nessun indicatore per questo filtro."}</div>
            ) : groups.map(([famLabel, arr]) => (
              <section key={famLabel} style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", color: C.muted, textTransform: "uppercase", margin: "0 2px 8px" }}>{famLabel}</div>
                <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 110px 120px 34px", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    <span>Indicatore</span>
                    <span style={{ textAlign: "right" }}>Ultimo valore</span>
                    <span style={{ textAlign: "right" }}>Var. 12 mesi</span>
                    <span>Andamento</span>
                    <span />
                  </div>
                  {arr.map(r => {
                    const open = expanded === r.slug;
                    const v = yoyPct(r);
                    return (
                      <div key={r.slug} id={`ind-${r.slug}`} style={{ borderBottom: `1px solid #F1F5F9`, scrollMarginTop: 88 }}>
                        <div onClick={() => setExpanded(open ? null : r.slug)} className="ap-row"
                          style={{ display: "grid", gridTemplateColumns: "1fr 130px 110px 120px 34px", gap: 10, padding: "12px 16px", alignItems: "center", cursor: "pointer", background: open ? C.bg : "#fff" }}>
                          <div>
                            <div style={{ fontSize: 14.5, fontWeight: 600 }}>{r.nome}</div>
                            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>{r.fonte} · {FREQ_LABEL[r.frequenza] || r.frequenza}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div className="bs-num" style={{ fontSize: 15, fontWeight: 700, color: r.last_value != null ? C.text : "#94A3B8" }}>{fmtVal(r.last_value, r.tipo)}</div>
                            <div style={{ fontSize: 10.5, color: C.muted }}>{r.unita}{r.last_provvisorio ? " · provv." : ""}</div>
                          </div>
                          <div style={{ textAlign: "right", fontSize: 13.5 }}><VarPill v={v} /></div>
                          <div><Sparkline points={r.spark} up={v != null && v > 0} /></div>
                          <div style={{ display: "flex", justifyContent: "center", color: C.muted }}>{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</div>
                        </div>
                        {open && <div style={{ padding: "4px 16px 18px", background: C.bg }}><IndicatorChart row={r} /></div>}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </main>
        </div>
      </div>
    </div>
  );
}

// Conta gli indicatori per valore distinto di un campo → opzioni filtro con conteggio.
function buildOptions(rows, field) {
  if (!rows) return [];
  const m = new Map();
  for (const r of rows) { const k = r[field]; if (!k) continue; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}
