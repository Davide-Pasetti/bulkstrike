"use client";
// ============================================================
// BulkStrike — Admin: Fornitori da verificare (import Europages)
// Route: app/admin/fornitori/page.jsx
// Solo platform admin (companies.is_platform_admin): il gate reale è nelle RPC
// admin_list_pending_suppliers / admin_verify_suppliers / admin_discard_suppliers
// (SECURITY DEFINER lato DB). Qui il controllo client serve solo per l'UI.
//
// "Verifica" → status='verified' (li rende visibili in suppliers_public): azione
// manuale, mai automatica. "Scarta" → DELETE del record (con conferma a due passi).
// Entrambe, singole o in blocco. Ordine di default: sector_hint, poi legal_name (RPC).
// ============================================================
import { useState, useEffect, useMemo } from "react";
import { Search, ShieldAlert, ShieldCheck, ExternalLink, AlertTriangle, Trash2, Check } from "lucide-react";
import {
  getSession, getMyCompany, poolErrorMessage,
  adminListPendingSuppliers, adminVerifySuppliers, adminDiscardSuppliers,
} from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";

const C = { blue: "#0EA5E9", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", amber: "#D97706", purple: "#7C3AED" };
const GRID = "26px 1.5fr 1fr 80px 96px 92px 58px 84px";
const TIPO = { producer: "Produttore", distributor: "Distributore" };

export default function AdminSuppliersPage({ inShell = false }) {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [notAdmin, setNotAdmin] = useState(false);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("");     // "" = tutti i settori
  const [selected, setSelected] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null);  // chiave azione distruttiva "armata"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      try {
        const company = await getMyCompany().catch(() => null);
        if (!company?.is_platform_admin) { setNotAdmin(true); setLoading(false); return; }
        setRows(await adminListPendingSuppliers());
      } catch (e) {
        if (String(e?.message || e).includes("NOT_ADMIN")) setNotAdmin(true);
        else setErr(poolErrorMessage(e));
      }
      setLoading(false);
    })();
  }, []);

  // La conferma armata si disarma da sola dopo 4s (evita esecuzioni accidentali tardive).
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(null), 4000);
    return () => clearTimeout(t);
  }, [confirm]);

  const sectors = useMemo(
    () => Array.from(new Set(rows.map(r => r.sector_hint).filter(Boolean))).sort((a, b) => a.localeCompare(b, "it")),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r =>
      (!sector || r.sector_hint === sector) &&
      (!q || (r.legal_name || "").toLowerCase().includes(q))
    );
  }, [rows, query, sector]);

  const filteredIds = useMemo(() => filtered.map(r => r.id), [filtered]);
  const selCount = useMemo(() => filteredIds.filter(id => selected.has(id)).length, [filteredIds, selected]);
  const allSelected = filtered.length > 0 && selCount === filtered.length;

  function toggleOne(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(prev => {
      const n = new Set(prev);
      if (allSelected) filteredIds.forEach(id => n.delete(id));
      else filteredIds.forEach(id => n.add(id));
      return n;
    });
  }

  // Esegue verifica/scarto su una lista di id, poi rimuove le righe trattate.
  async function run(action, ids) {
    if (!ids.length || busy) return;
    setBusy(true); setErr(""); setConfirm(null);
    try {
      if (action === "verify") await adminVerifySuppliers(ids);
      else await adminDiscardSuppliers(ids);
      const done = new Set(ids);
      setRows(prev => prev.filter(r => !done.has(r.id)));
      setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
    } catch (e) { setErr(poolErrorMessage(e)); }
    finally { setBusy(false); }
  }

  // Click su un'azione distruttiva/di massa: primo click arma, secondo esegue.
  function guarded(key, action, ids) {
    if (confirm === key) run(action, ids);
    else setConfirm(key);
  }

  const wrap = (children) => (
    <div style={{ background: "#fff", color: C.text, fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh", colorScheme: "light" }}>
      {!inShell && <BulkStrikeNav />}
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "26px 20px 80px" }}>{children}</div>
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
      <div style={{ fontSize: 14, color: C.muted }}>Solo gli amministratori di piattaforma possono gestire i fornitori da verificare.</div>
    </div>
  );

  const cellHead = { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: C.muted };

  return wrap(
    <>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>Fornitori da verificare</h1>
      <p style={{ fontSize: 14, color: C.muted, marginBottom: 20, lineHeight: 1.6, maxWidth: 680 }}>
        Aziende importate da <b>Europages</b> in attesa di verifica (<span className="mono">status=pending</span>): non ancora visibili sul sito pubblico.
        <b> Verifica</b> le pubblica nella directory fornitori; <b>Scarta</b> elimina definitivamente il record. Nessun cambiamento è automatico.
      </p>

      {/* Filtri: ricerca su legal_name + dropdown per settore */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 360 }}>
          <Search size={16} color={C.muted} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca per ragione sociale…"
            style={{ width: "100%", padding: "10px 12px 10px 36px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 14, outline: "none", fontFamily: "Inter,system-ui" }} />
        </div>
        <select value={sector} onChange={e => setSector(e.target.value)}
          style={{ padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 14, outline: "none", fontFamily: "Inter,system-ui", background: "#fff", color: C.text, minWidth: 200 }}>
          <option value="">Tutti i settori ({rows.length})</option>
          {sectors.map(s => <option key={s} value={s}>{s} ({rows.filter(r => r.sector_hint === s).length})</option>)}
        </select>
      </div>

      {err && <div style={{ fontSize: 13, color: C.red, marginBottom: 12 }}>{err}</div>}

      {/* Barra azioni di massa (compare con almeno una riga selezionata) */}
      {selCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12, padding: "10px 14px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{selCount} selezionati</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button disabled={busy} onClick={() => guarded("bulk:verify", "verify", filteredIds.filter(id => selected.has(id)))}
              style={{ background: confirm === "bulk:verify" ? C.green : "#fff", color: confirm === "bulk:verify" ? "#fff" : C.green, border: `1.5px solid ${C.green}`, borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={14} />{confirm === "bulk:verify" ? `Confermi? Pubblica ${selCount}` : `Verifica selezionati`}
            </button>
            <button disabled={busy} onClick={() => guarded("bulk:discard", "discard", filteredIds.filter(id => selected.has(id)))}
              style={{ background: confirm === "bulk:discard" ? C.red : "#fff", color: confirm === "bulk:discard" ? "#fff" : C.red, border: `1.5px solid ${C.red}`, borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Trash2 size={14} />{confirm === "bulk:discard" ? `Confermi eliminazione ${selCount}?` : `Scarta selezionati`}
            </button>
          </div>
        </div>
      )}

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div>
          <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, padding: "11px 14px", background: C.bg, alignItems: "center" }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Seleziona tutti"
              ref={el => { if (el) el.indeterminate = selCount > 0 && !allSelected; }}
              style={{ width: 16, height: 16, accentColor: C.blue, cursor: "pointer" }} />
            <span style={cellHead}>Azienda</span>
            <span style={cellHead}>Settore</span>
            <span style={cellHead}>Paese</span>
            <span style={cellHead}>Dipendenti</span>
            <span style={cellHead}>Tipo</span>
            <span style={cellHead}>P.IVA</span>
            <span style={cellHead}>Azioni</span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center", color: C.muted, fontSize: 14 }}>
              {rows.length === 0 ? "Nessun fornitore in attesa di verifica." : "Nessun fornitore corrisponde ai filtri."}
            </div>
          ) : filtered.map(row => {
            const on = selected.has(row.id);
            const delKey = `del:${row.id}`;
            return (
              <div key={row.id} style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, padding: "10px 14px", borderTop: `1px solid ${C.border}`, alignItems: "center", fontSize: 13, background: on ? "#F0F9FF" : "transparent" }}>
                <input type="checkbox" checked={on} onChange={() => toggleOne(row.id)} aria-label={`Seleziona ${row.legal_name}`}
                  style={{ width: 16, height: 16, accentColor: C.blue, cursor: "pointer" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.legal_name}</div>
                  {row.europages_url && (
                    <a href={row.europages_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: C.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      Europages <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                <span style={{ color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.sector_hint || "—"}</span>
                <span style={{ color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.country || "—"}</span>
                <span style={{ color: C.muted }}>{row.employee_count_range || "—"}</span>
                <span style={{ color: C.muted }}>{TIPO[row.supplier_type] || "—"}</span>
                {/* P.IVA: solo icona con tooltip, per non allargare la colonna */}
                <span title={row.vat_pending ? "P.IVA da confermare" : "P.IVA confermata"} style={{ display: "flex", justifyContent: "center", cursor: "help" }}>
                  {row.vat_pending
                    ? <AlertTriangle size={16} color={C.amber} aria-label="P.IVA da confermare" />
                    : <Check size={16} color={C.green} aria-label="P.IVA confermata" />}
                </span>
                {/* Azioni: bottoni solo icona con tooltip (Scarta a due passi) */}
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button disabled={busy} onClick={() => run("verify", [row.id])} title="Verifica (pubblica sul sito)" aria-label="Verifica"
                    style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, width: 32, height: 32, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <ShieldCheck size={15} />
                  </button>
                  <button disabled={busy} onClick={() => guarded(delKey, "discard", [row.id])}
                    title={confirm === delKey ? "Clicca di nuovo per eliminare" : "Scarta (elimina definitivamente)"} aria-label="Scarta"
                    style={{ background: confirm === delKey ? C.red : "#fff", color: confirm === delKey ? "#fff" : C.red, border: `1.5px solid ${C.red}`, borderRadius: 8, width: 32, height: 32, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
