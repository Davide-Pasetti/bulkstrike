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
import { useState, useEffect, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Search, ChevronDown, ChevronRight, TrendingDown, TrendingUp, Activity } from "lucide-react";
import { getPriceScreener, getProductPriceHistory, getMarketPriceSeries, getMarketIndexSeries, getMacroAreas } from "@/lib/api";
import { ytdChange } from "@/lib/priceTrend";
import PriceSourceNote from "@/components/PriceSourceNote";
import BulkStrikeNav from "@/components/BulkStrikeNav";

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
  const [rows, setRows] = useState(null);
  const [macros, setMacros] = useState([]);
  const [activeMacro, setActiveMacro] = useState(null); // slug | null (Tutti)
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => { getPriceScreener().then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { getMacroAreas().then(setMacros).catch(() => {}); }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const qq = q.trim().toLowerCase();
    let list = rows.filter(r =>
      (!activeMacro || (Array.isArray(r.macro_slugs) && r.macro_slugs.includes(activeMacro))) &&
      (!qq || (r.name || "").toLowerCase().includes(qq))
    );
    // Prima i prodotti con almeno una linea (storico o riferimento esterno), poi il resto.
    const cover = (r) => (r.has_history ? 2 : 0) + (r.external ? 1 : 0);
    return list.sort((a, b) => (cover(b) - cover(a)) || (a.name || "").localeCompare(b.name || ""));
  }, [rows, activeMacro, q]);

  const covered = filtered.filter(r => r.has_history || r.external).length;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "Inter, system-ui, sans-serif", color: C.text }}>
      <BulkStrikeNav />
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 20px 64px" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.09em", color: C.blue, textTransform: "uppercase", marginBottom: 6 }}>Andamento prezzi</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px" }}>Prezzi di mercato delle materie prime</h1>
        <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.6, maxWidth: 720, margin: "0 0 22px" }}>
          Il prezzo reale sulla piattaforma BulkStrike affiancato, dove disponibile, al riferimento di mercato esterno (ISMEA/CUN per gli agricoli, indici settoriali Eurostat per gli altri comparti). La copertura cresce nel tempo.
        </p>

        {/* Filtro macro-aree */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <button onClick={() => setActiveMacro(null)} style={chip(activeMacro === null)}>Tutti i settori</button>
          {macros.map(m => (
            <button key={m.slug} onClick={() => setActiveMacro(m.slug)} style={chip(activeMacro === m.slug)}>{m.name}</button>
          ))}
        </div>

        {/* Ricerca */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", marginBottom: 8, maxWidth: 360 }}>
          <Search size={16} color={C.muted} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca materia prima…" style={{ border: "none", outline: "none", fontSize: 14, width: "100%", fontFamily: "Inter, system-ui" }} />
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{rows == null ? "Caricamento…" : `${filtered.length} prodotti · ${covered} con andamento disponibile`}</div>

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
            <div style={{ padding: 24, fontSize: 13, color: C.muted }}>Nessun prodotto per questo filtro.</div>
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
      </div>

      <style>{`
        .ap-row:hover { background: ${C.bg} !important; }
        @media (max-width:768px){
          .ap-row { grid-template-columns: 1fr auto 26px !important; }
          .ap-row > div:nth-child(3), .ap-row > div:nth-child(4) { display:none; }
        }
      `}</style>
    </div>
  );
}

function chip(active) {
  return {
    padding: "7px 13px", borderRadius: 100, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
    fontFamily: "Inter, system-ui", whiteSpace: "nowrap",
    background: active ? C.blue : "#fff", color: active ? "#fff" : C.muted,
    border: `1px solid ${active ? C.blue : C.border}`,
  };
}
