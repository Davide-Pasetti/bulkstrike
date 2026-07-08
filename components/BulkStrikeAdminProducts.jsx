"use client";
// ============================================================
// BulkStrike — Admin: formati di vendita + minimo pedane per aprire un'asta
// (per-prodotto). Route: app/admin/prodotti/page.jsx
// Formati: kg di 1 pallet (obbligatorio) e kg di 1 sacco / 1 container
// (vuoto = formato non disponibile: il bottone non compare nel pannello asta).
// Solo platform admin (companies.is_platform_admin): il gate reale è nelle
// RPC admin_* (SECURITY DEFINER lato DB). Qui il controllo client serve solo
// a mostrare l'UI giusta.
// ============================================================
import { useState, useEffect, useMemo } from "react";
import { Search, Check, ShieldAlert } from "lucide-react";
import { getSession, getMyCompany, adminListProductsPoolMin, adminSetProductPoolMin, adminSetProductFormats, poolErrorMessage } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";

const C = { blue: "#0EA5E9", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", amber: "#D97706", purple: "#7C3AED" };
const kg = (n) => n == null ? "—" : Number(n).toLocaleString("it-IT") + " kg";

export default function AdminProductsPage({ inShell = false }) {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [notAdmin, setNotAdmin] = useState(false);
  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({});     // { [productId]: string }
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      try {
        const company = await getMyCompany().catch(() => null);
        if (!company?.is_platform_admin) { setNotAdmin(true); setLoading(false); return; }
        const list = await adminListProductsPoolMin();
        setRows(list);
      } catch (e) {
        // NOT_ADMIN dal DB → trattalo come accesso negato
        if (String(e?.message || e).includes("NOT_ADMIN")) setNotAdmin(true);
        else setErr(poolErrorMessage(e));
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => (r.canonical_name || "").toLowerCase().includes(q));
  }, [rows, query]);

  // valori mostrati per una riga: le modifiche in corso sopra i valori salvati.
  // I formati viaggiano come stringhe ("" = non disponibile per sacco/container).
  const shownFor = (row) => {
    const e = edits[row.id] || {};
    return {
      pallet: e.pallet ?? (row.pallet_kg != null ? String(row.pallet_kg) : ""),
      sacco: e.sacco ?? (row.sacco_kg != null ? String(row.sacco_kg) : ""),
      container: e.container ?? (row.container_kg != null ? String(row.container_kg) : ""),
      min: e.min ?? String(row.min_pool_pallets),
    };
  };
  const setField = (rowId, field, value) =>
    setEdits(prev => ({ ...prev, [rowId]: { ...(prev[rowId] || {}), [field]: value.replace(/\D/g, "") } }));

  async function save(row) {
    const s = shownFor(row);
    const pallet = parseInt(s.pallet || "0", 10) || 0;
    const sacco = s.sacco === "" ? null : (parseInt(s.sacco, 10) || 0);
    const container = s.container === "" ? null : (parseInt(s.container, 10) || 0);
    const min = parseInt(s.min || "0", 10) || 0;
    if (pallet < 1) { setErr("Il peso di 1 pallet è obbligatorio (almeno 1 kg)."); return; }
    if ((sacco != null && sacco < 1) || (container != null && container < 1)) { setErr("Il peso di un formato, se impostato, deve essere almeno 1 kg."); return; }
    if (min < 1) { setErr("Il minimo deve essere almeno 1 pedana."); return; }
    setSavingId(row.id); setErr(""); setSavedId(null);
    try {
      const formatsDirty = pallet !== row.pallet_kg || sacco !== (row.sacco_kg ?? null) || container !== (row.container_kg ?? null);
      if (formatsDirty) await adminSetProductFormats(row.id, pallet, sacco, container);
      if (min !== row.min_pool_pallets) await adminSetProductPoolMin(row.id, min);
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, pallet_kg: pallet, sacco_kg: sacco, container_kg: container, min_pool_pallets: min } : r));
      setEdits(prev => { const n = { ...prev }; delete n[row.id]; return n; });
      setSavedId(row.id);
    } catch (e) { setErr(poolErrorMessage(e)); }
    finally { setSavingId(null); }
  }

  const wrap = (children) => (
    <div style={{ background: "#fff", color: C.text, fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh", colorScheme: "light" }}>
      {!inShell && <BulkStrikeNav />}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 20px 80px" }}>{children}</div>
    </div>
  );

  if (loading) return wrap(<div style={{ padding: "60px 0", textAlign: "center", color: C.muted }}>Caricamento…</div>);
  if (needLogin) return wrap(
    <div style={{ padding: "50px 20px", textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Accedi per continuare</div>
      <div style={{ fontSize: 14, color: C.muted }}>Questa pagina è riservata agli amministratori di piattaforma.</div>
    </div>
  );
  if (notAdmin) return wrap(
    <div style={{ padding: "50px 20px", textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <ShieldAlert size={30} color={C.amber} />
      <div style={{ fontSize: 16, fontWeight: 700 }}>Accesso non consentito</div>
      <div style={{ fontSize: 14, color: C.muted }}>Solo gli amministratori di piattaforma possono gestire questi parametri.</div>
    </div>
  );

  return wrap(
    <>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>Apertura asta</h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 20, lineHeight: 1.6, maxWidth: 760 }}>
        Per ogni prodotto: i <b>formati di vendita</b> (kg di 1 pallet, obbligatorio; kg di 1 sacco e di 1 container,
        vuoti = formato non proposto nel pannello asta) e il numero minimo di <b>pedane</b> necessarie per <b>aprire</b> una
        nuova asta a ribasso. Il vincolo sul minimo è applicato lato server in <span className="mono">open_pool</span> e non è
        aggirabile; chi si <i>aggiunge</i> a un'asta già aperta non è soggetto al minimo.
      </p>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 360 }}>
        <Search size={16} color={C.muted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca prodotto…"
          style={{ width: "100%", padding: "10px 12px 10px 36px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 14, outline: "none", fontFamily: "Inter,system-ui" }} />
      </div>

      {err && <div style={{ fontSize: 13, color: C.red, marginBottom: 12 }}>{err}</div>}

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 220px", gap: 12, padding: "12px 16px", background: C.bg, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: C.muted }}>
          <span>Prodotto</span><span>1 pallet (kg)</span><span>1 sacco (kg)</span><span>1 container (kg)</span><span>Minimo pedane per aprire</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "28px 16px", textAlign: "center", color: C.muted, fontSize: 14 }}>Nessun prodotto.</div>
        ) : filtered.map(row => {
          const s = shownFor(row);
          const dirty =
            (parseInt(s.pallet || "0", 10) || 0) !== (row.pallet_kg || 0) ||
            (s.sacco === "" ? null : parseInt(s.sacco, 10) || 0) !== (row.sacco_kg ?? null) ||
            (s.container === "" ? null : parseInt(s.container, 10) || 0) !== (row.container_kg ?? null) ||
            (parseInt(s.min || "0", 10) || 0) !== row.min_pool_pallets;
          const minPallets = Math.max(1, parseInt(s.min || "1", 10) || 1);
          const palletNow = parseInt(s.pallet || "0", 10) || 0;
          const numInput = (field, value, { placeholder = "", width = 78 } = {}) => (
            <input value={value} placeholder={placeholder}
              onChange={e => setField(row.id, field, e.target.value)}
              style={{ width, textAlign: "center", padding: "7px 8px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13.5, fontWeight: 700, outline: "none", fontFamily: "'JetBrains Mono',monospace" }} />
          );
          return (
            <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 220px", gap: 12, padding: "12px 16px", borderTop: `1px solid ${C.border}`, alignItems: "center", fontSize: 13.5 }}>
              <span style={{ fontWeight: 600 }}>{row.canonical_name}</span>
              {numInput("pallet", s.pallet)}
              {numInput("sacco", s.sacco, { placeholder: "—" })}
              {numInput("container", s.container, { placeholder: "—" })}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {numInput("min", s.min, { width: 52 })}
                <span style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap" }}>= {kg(palletNow * minPallets)}</span>
                <button onClick={() => save(row)} disabled={!dirty || savingId === row.id}
                  style={{ marginLeft: "auto", background: dirty ? C.blue : "#E2E8F0", color: dirty ? "#fff" : C.muted, border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: dirty ? "pointer" : "default", fontFamily: "Inter,system-ui", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  {savingId === row.id ? "…" : savedId === row.id && !dirty ? <><Check size={13} /> Salvato</> : "Salva"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
