"use client";
// ============================================================
// BulkStrike — Admin: minimo pedane per aprire un'asta (per-prodotto)
// Route: app/admin/prodotti/page.jsx
// Solo platform admin (companies.is_platform_admin): il gate reale è nelle
// RPC admin_list_products_pool_min / admin_set_product_pool_min (SECURITY
// DEFINER lato DB). Qui il controllo client serve solo a mostrare l'UI giusta.
// ============================================================
import { useState, useEffect, useMemo } from "react";
import { Search, Check, ShieldAlert } from "lucide-react";
import { getSession, getMyCompany, adminListProductsPoolMin, adminSetProductPoolMin, poolErrorMessage } from "@/lib/api";
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

  async function save(row) {
    const raw = edits[row.id];
    const val = Math.max(1, parseInt(String(raw ?? row.min_pool_pallets).replace(/\D/g, "") || "0", 10) || 0);
    if (val < 1) { setErr("Il minimo deve essere almeno 1 pedana."); return; }
    setSavingId(row.id); setErr(""); setSavedId(null);
    try {
      await adminSetProductPoolMin(row.id, val);
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, min_pool_pallets: val } : r));
      setEdits(prev => { const n = { ...prev }; delete n[row.id]; return n; });
      setSavedId(row.id);
    } catch (e) { setErr(poolErrorMessage(e)); }
    finally { setSavingId(null); }
  }

  const wrap = (children) => (
    <div style={{ background: "#fff", color: C.text, fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh", colorScheme: "light" }}>
      {!inShell && <BulkStrikeNav />}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "26px 20px 80px" }}>{children}</div>
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
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 20, lineHeight: 1.6, maxWidth: 640 }}>
        Per ogni prodotto, il numero minimo di <b>pedane</b> necessarie per <b>aprire</b> una nuova asta a ribasso.
        Il vincolo è applicato lato server in <span className="mono">open_pool</span> e non è aggirabile. Chi si <i>aggiunge</i> a un'asta già aperta non è soggetto a questo minimo.
      </p>

      <div style={{ position: "relative", marginBottom: 16, maxWidth: 360 }}>
        <Search size={16} color={C.muted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca prodotto…"
          style={{ width: "100%", padding: "10px 12px 10px 36px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 14, outline: "none", fontFamily: "Inter,system-ui" }} />
      </div>

      {err && <div style={{ fontSize: 13, color: C.red, marginBottom: 12 }}>{err}</div>}

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 200px", gap: 12, padding: "12px 16px", background: C.bg, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: C.muted }}>
          <span>Prodotto</span><span>1 pedana</span><span>Minimo pedane per aprire</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "28px 16px", textAlign: "center", color: C.muted, fontSize: 14 }}>Nessun prodotto.</div>
        ) : filtered.map(row => {
          const editing = edits[row.id];
          const shown = editing ?? String(row.min_pool_pallets);
          const dirty = editing != null && parseInt(editing || "0", 10) !== row.min_pool_pallets;
          const minPallets = Math.max(1, parseInt(String(shown).replace(/\D/g, "") || "1", 10) || 1);
          return (
            <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1fr 140px 200px", gap: 12, padding: "12px 16px", borderTop: `1px solid ${C.border}`, alignItems: "center", fontSize: 13.5 }}>
              <span style={{ fontWeight: 600 }}>{row.canonical_name}</span>
              <span style={{ color: C.muted }}>{kg(row.pallet_kg)}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input value={shown}
                  onChange={e => setEdits(prev => ({ ...prev, [row.id]: e.target.value.replace(/\D/g, "") }))}
                  style={{ width: 56, textAlign: "center", padding: "7px 8px", border: `1.5px solid ${dirty ? C.blue : C.border}`, borderRadius: 8, fontSize: 14, fontWeight: 700, outline: "none", fontFamily: "'JetBrains Mono',monospace" }} />
                <span style={{ fontSize: 11.5, color: C.muted, whiteSpace: "nowrap" }}>= {kg((row.pallet_kg || 0) * minPallets)}</span>
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
