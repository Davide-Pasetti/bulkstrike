"use client";
// ============================================================
// BulkStrike — Admin: Fornitori da verificare (coda pending, qualunque origine)
// Route: app/admin/fornitori/page.jsx
// Solo platform admin (companies.is_platform_admin): il gate reale è nelle RPC
// admin_list_pending_suppliers / admin_verify_suppliers / admin_discard_suppliers
// (SECURITY DEFINER lato DB). Qui il controllo client serve solo per l'UI.
//
// "Verifica" (DAV-33) → status='verified' + manually_verified insieme: è l'unica
// approvazione, dà il badge "Verificato" E abilita/rende pubblici i prezzi. I
// pending censiti dall'import sono comunque già visibili come "non verificati".
// Azione manuale, mai automatica. "Scarta" → DELETE del record (con conferma a due passi).
// Entrambe, singole o in blocco. Ordine di default: sector_hint, poi legal_name (RPC).
// ============================================================
import { useState, useEffect, useMemo } from "react";
import { Search, ShieldAlert, ShieldCheck, ExternalLink, AlertTriangle, Trash2, Check, ChevronDown, ChevronRight } from "lucide-react";
import {
  getSession, getMyCompany, poolErrorMessage,
  adminListPendingSuppliers, adminVerifySuppliers, adminDiscardSuppliers,
  adminGetSupplierDetail, adminListClaimRequests, adminReviewClaim, adminSetManuallyVerified,
  adminListRemovalRequests, adminReviewRemoval, adminSetCompanyHidden,
} from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import CountryFlag from "@/components/CountryFlag";
import { SupplierTypeBadge } from "@/components/BulkStrikeBadges";

const C = { blue: "#0EA5E9", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", amber: "#D97706", purple: "#7C3AED" };
const GRID = "26px 1.5fr 1fr 80px 96px 92px 58px 84px 26px";
const TIPO = { producer: "Produttore", distributor: "Distributore", importer: "Importatore" };

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
  // Dettaglio espanso inline (stesso pattern di /andamento-prezzi): una riga
  // aperta per volta, così filtri e selezioni della lista restano dove sono
  // mentre si scorre la coda. I dettagli caricati restano in cache per id.
  const [expanded, setExpanded] = useState(null);
  const [details, setDetails] = useState({});   // id → oggetto dettaglio
  const [detailErr, setDetailErr] = useState({});
  // Due code distinte ma vicine: "questo lead è reale?" e "questa persona è
  // davvero di quest'azienda?" sono decisioni diverse, con prove diverse.
  const [tab, setTab] = useState("lead");       // "lead" | "claim" | "removal"
  const [claims, setClaims] = useState([]);
  const [removals, setRemovals] = useState([]); // richieste di rimozione pending (DAV-33-bis)

  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      try {
        const company = await getMyCompany().catch(() => null);
        if (!company?.is_platform_admin) { setNotAdmin(true); setLoading(false); return; }
        setRows(await adminListPendingSuppliers());
        setClaims(await adminListClaimRequests().catch(() => []));
        setRemovals(await adminListRemovalRequests().catch(() => []));
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
      // La riga trattata sparisce dalla coda: chiudo il dettaglio se era il suo.
      setExpanded(prev => (prev && done.has(prev) ? null : prev));
    } catch (e) { setErr(poolErrorMessage(e)); }
    finally { setBusy(false); }
  }

  // Apre/chiude il dettaglio di una riga, caricandolo la prima volta.
  async function toggleDetail(id) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (details[id] || detailErr[id]) return;
    try {
      const d = await adminGetSupplierDetail(id);
      setDetails(prev => ({ ...prev, [id]: d }));
    } catch (e) {
      setDetailErr(prev => ({ ...prev, [id]: poolErrorMessage(e) }));
    }
  }

  async function reviewClaim(requestId, approve) {
    if (busy) return;
    setBusy(true); setErr(""); setConfirm(null);
    try {
      await adminReviewClaim(requestId, approve, null);
      setClaims(prev => prev.filter(c => c.request_id !== requestId));
    } catch (e) { setErr(poolErrorMessage(e)); }
    finally { setBusy(false); }
  }

  // Richiesta di rimozione (DAV-33-bis): 'hide' nasconde l'azienda da tutte le
  // viste pubbliche e segna gestita; 'dismiss' la ignora senza toccare nulla.
  async function reviewRemoval(requestId, action) {
    if (busy) return;
    setBusy(true); setErr(""); setConfirm(null);
    try {
      await adminReviewRemoval(requestId, action);
      setRemovals(prev => prev.filter(r => r.request_id !== requestId));
    } catch (e) { setErr(poolErrorMessage(e)); }
    finally { setBusy(false); }
  }

  // Nascondi/ripristina un'azienda in tutte le viste pubbliche (reversibile).
  async function toggleHidden(companyId, hidden) {
    if (busy) return;
    setBusy(true); setErr(""); setConfirm(null);
    try {
      await adminSetCompanyHidden(companyId, hidden, null);
      setDetails(prev => prev[companyId]
        ? { ...prev, [companyId]: { ...prev[companyId], hidden_from_public: hidden } }
        : prev);
    } catch (e) { setErr(poolErrorMessage(e)); }
    finally { setBusy(false); }
  }

  // L'unica approvazione (DAV-33): lato DB imposta INSIEME manually_verified
  // (rende pubblici i prezzi già compilati) e status='verified' (badge pubblico,
  // esce dalla sezione "Fornitori non verificati").
  async function markVerified(companyId) {
    if (busy) return;
    setBusy(true); setErr(""); setConfirm(null);
    try {
      await adminSetManuallyVerified(companyId, true, null);
      setDetails(prev => prev[companyId]
        ? { ...prev, [companyId]: { ...prev[companyId], manually_verified: true, status: "verified" } }
        : prev);
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
        Aziende in attesa di verifica (<span className="mono">status=pending</span>), qualunque sia la loro provenienza: non ancora visibili sul sito pubblico.
        Clicca una riga per aprire la scheda completa prima di decidere.
        <b> Verifica</b> le pubblica nella directory fornitori; <b>Scarta</b> elimina definitivamente il record. Nessun cambiamento è automatico.
      </p>

      {/* Due code, stessa pagina: sono decisioni dello stesso tipo (approvo o no)
          ma su prove diverse, quindi tab separati e non una lista unica. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, borderBottom: `1px solid ${C.border}` }}>
        {[["lead", `Fornitori da verificare (${rows.length})`], ["claim", `Richieste di rivendicazione (${claims.length})`], ["removal", `Richieste di rimozione (${removals.length})`]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ background: "none", border: "none", borderBottom: `2px solid ${tab === id ? C.blue : "transparent"}`, padding: "9px 4px", marginBottom: -1, fontSize: 13.5, fontWeight: 700, color: tab === id ? C.text : C.muted, cursor: "pointer", fontFamily: "Inter,system-ui" }}>
            {label}
          </button>
        ))}
      </div>

      {err && <div style={{ fontSize: 13, color: C.red, marginBottom: 12 }}>{err}</div>}

      {tab === "claim" && (
        <ClaimQueue claims={claims} busy={busy} onReview={reviewClaim} />
      )}

      {tab === "removal" && (
        <RemovalQueue removals={removals} busy={busy} onReview={reviewRemoval} />
      )}

      {tab === "lead" && (<>
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
            <span />
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center", color: C.muted, fontSize: 14 }}>
              {rows.length === 0 ? "Nessun fornitore in attesa di verifica." : "Nessun fornitore corrisponde ai filtri."}
            </div>
          ) : filtered.map(row => {
            const on = selected.has(row.id);
            const delKey = `del:${row.id}`;
            const open = expanded === row.id;
            return (
              <div key={row.id} style={{ borderTop: `1px solid ${C.border}` }}>
              {/* Riga cliccabile: apre/chiude il dettaglio. I controlli interni
                  (checkbox, azioni, link) fermano la propagazione, così cliccarli
                  non apre anche il pannello. */}
              <div className="as-row" onClick={() => toggleDetail(row.id)} role="button" tabIndex={0} aria-expanded={open}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDetail(row.id); } }}
                style={{ display: "grid", gridTemplateColumns: GRID, gap: 8, padding: "10px 14px", alignItems: "center", fontSize: 13, cursor: "pointer", background: on ? "#F0F9FF" : open ? C.bg : "transparent" }}>
                <input type="checkbox" checked={on} onChange={() => toggleOne(row.id)} onClick={e => e.stopPropagation()} aria-label={`Seleziona ${row.legal_name}`}
                  style={{ width: 16, height: 16, accentColor: C.blue, cursor: "pointer" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <CountryFlag code={row.country_iso2} country={row.country} size={12} />
                    <span style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.legal_name}</span>
                    <SupplierTypeBadge type={row.supplier_type} />
                  </div>
                  {row.europages_url && (
                    <a href={row.europages_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
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
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={e => e.stopPropagation()}>
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
                <span style={{ display: "flex", justifyContent: "center", color: C.muted }}>
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
              </div>

              {open && (
                <SupplierDetail
                  detail={details[row.id]}
                  error={detailErr[row.id]}
                  busy={busy}
                  confirmKey={confirm}
                  onVerify={() => run("verify", [row.id])}
                  onDiscard={() => guarded(`detail:${row.id}`, "discard", [row.id])}
                  discardArmed={confirm === `detail:${row.id}`}
                  onMarkVerified={() => markVerified(row.id)}
                  onToggleHidden={(hidden) => toggleHidden(row.id, hidden)}
                />
              )}
              </div>
            );
          })}
        </div>
      </div>

      </>)}

      <style>{`.as-row:hover { background: ${C.bg} !important; }`}</style>
    </>
  );
}

// ─── Coda richieste di rivendicazione ───────────────────────────────────────
// Le prove sono congelate al momento della richiesta: dominio, P.IVA, somiglianza
// del nome. Vanno mostrate esplicitamente, perché sono l'unica base su cui
// l'admin decide se questa persona rappresenta davvero quell'azienda.
function ClaimQueue({ claims, busy, onReview }) {
  const [armed, setArmed] = useState(null);
  if (claims.length === 0) {
    return <div style={{ padding: "28px 16px", textAlign: "center", color: C.muted, fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 14 }}>
      Nessuna richiesta di rivendicazione in attesa.
    </div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {claims.map(c => (
        <div key={c.request_id} style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <CountryFlag code={c.country_iso2} country={c.country} size={13} />
            <span style={{ fontSize: 15, fontWeight: 700 }}>{c.legal_name}</span>
            <SupplierTypeBadge type={c.supplier_type} />
            {c.altre_anagrafiche > 0 && (
              <span className="bs-chip" style={{ background: "#FEF3C7", color: C.amber }}>
                +{c.altre_anagrafiche} anagrafiche verranno unificate
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>
            {[c.country, c.website, c.sector_hint].filter(Boolean).join(" · ")}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 14, fontSize: 12.5 }}>
            <div>
              <div style={{ color: C.muted, marginBottom: 2 }}>Richiesta da</div>
              <div style={{ fontWeight: 600 }}>{c.requester_name || "—"}</div>
              <div style={{ color: C.muted }}>{c.requester_email}</div>
            </div>
            <div>
              <div style={{ color: C.muted, marginBottom: 2 }}>Prove</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <Prova ok={c.domain_match} label={`Dominio email (${c.requester_domain || "—"})`} />
                <Prova ok={c.vat_match} label="P.IVA corrispondente" />
                <div style={{ color: C.muted }}>
                  Somiglianza nome: <b style={{ color: C.text }}>{c.name_similarity != null ? c.name_similarity : "—"}</b>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button disabled={busy} onClick={() => onReview(c.request_id, true)}
              style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={14} /> Approva e collega
            </button>
            <button disabled={busy}
              onClick={() => armed === c.request_id ? onReview(c.request_id, false) : setArmed(c.request_id)}
              style={{ background: armed === c.request_id ? C.red : "#fff", color: armed === c.request_id ? "#fff" : C.red, border: `1.5px solid ${C.red}`, borderRadius: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer" }}>
              {armed === c.request_id ? "Confermi il rifiuto?" : "Rifiuta"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Coda richieste di rimozione (DAV-33-bis) ────────────────────────────────
// Ogni richiesta arriva dal form pubblico "Richiedi la rimozione" (senza
// login): "Nascondi e segna gestita" toglie l'azienda da TUTTE le viste
// pubbliche senza cancellare nulla; "Ignora" chiude la richiesta come
// pretestuosa/spam. Entrambe con conferma armata come le altre azioni.
function RemovalQueue({ removals, busy, onReview }) {
  const [armed, setArmed] = useState(null);
  if (removals.length === 0) {
    return <div style={{ padding: "28px 16px", textAlign: "center", color: C.muted, fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 14 }}>
      Nessuna richiesta di rimozione in attesa.
    </div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {removals.map(r => (
        <div key={r.request_id} style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <CountryFlag code={r.country_iso2} country={r.country} size={13} />
            <span style={{ fontSize: 15, fontWeight: 700 }}>{r.legal_name}</span>
            {r.hidden_from_public && (
              <span className="bs-chip" style={{ background: "#F1F5F9", color: C.muted }}>già nascosta</span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>
            {[r.country, r.website].filter(Boolean).join(" · ")}
          </div>
          <div style={{ fontSize: 12.5, marginBottom: 12 }}>
            <div style={{ color: C.muted, marginBottom: 2 }}>Richiesta da</div>
            <div style={{ fontWeight: 600 }}>{r.requested_by_email}</div>
            {r.reason && <div style={{ color: C.muted, marginTop: 6, whiteSpace: "pre-wrap" }}>{r.reason}</div>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button disabled={busy}
              onClick={() => armed === `hide:${r.request_id}` ? onReview(r.request_id, "hide") : setArmed(`hide:${r.request_id}`)}
              style={{ background: armed === `hide:${r.request_id}` ? C.red : C.text, color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ShieldAlert size={14} /> {armed === `hide:${r.request_id}` ? "Confermi? Sparirà da tutte le viste pubbliche" : "Nascondi e segna gestita"}
            </button>
            <button disabled={busy}
              onClick={() => armed === `dismiss:${r.request_id}` ? onReview(r.request_id, "dismiss") : setArmed(`dismiss:${r.request_id}`)}
              style={{ background: "#fff", color: C.muted, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer" }}>
              {armed === `dismiss:${r.request_id}` ? "Confermi? La richiesta viene ignorata" : "Ignora"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Prova({ ok, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: ok ? C.green : C.muted }}>
      {ok ? <Check size={13} /> : <AlertTriangle size={13} color={C.amber} />} {label}
    </span>
  );
}

// ─── Dettaglio fornitore (pannello inline) ──────────────────────────────────
// Campi raggruppati per sezione invece che in elenco piatto: in revisione si
// guarda un blocco per volta (chi è / è in regola / come lo contatto / cosa fa).
// I campi vuoti non vengono mostrati, tranne quelli che contano proprio quando
// mancano (P.IVA, sito) — su un lead non verificato l'assenza è un'informazione.
function SupplierDetail({ detail, error, busy, onVerify, onDiscard, discardArmed, onMarkVerified, onToggleHidden }) {
  const box = { padding: "16px 18px 20px", background: C.bg, borderTop: `1px solid ${C.border}` };

  if (error) return <div style={{ ...box, fontSize: 13, color: C.red }}>{error}</div>;
  if (!detail) return <div style={{ ...box, fontSize: 13, color: C.muted }}>Caricamento dettaglio…</div>;

  const d = detail;
  const products = Array.isArray(d.candidate_products) ? d.candidate_products : [];

  const SECTIONS = [
    ["Anagrafica e verifica", [
      ["Ragione sociale", d.legal_name], ["Stato", d.status], ["Origine dato", d.import_source],
      ["Verificata a mano", d.manually_verified ? "Sì" : "No"], ["Note di verifica", d.verification_notes],
      ["Creata", fmtDate(d.created_at)], ["Aggiornata", fmtDate(d.updated_at)],
    ]],
    ["Dati fiscali", [
      ["P.IVA", d.vat, true], ["P.IVA verificata", d.vat_verified ? "Sì" : "No"],
      ["Fonte verifica P.IVA", d.vat_verification_source], ["Note verifica P.IVA", d.vat_verification_notes],
      ["Codice ATECO", d.ateco_code], ["Stato CCIAA", d.cciaa_status],
      ["Intestatario IBAN", d.iban_holder], ["IBAN", d.iban], ["BIC", d.bic],
    ]],
    ["Sede e contatti", [
      ["Paese", d.country], ["Regione", d.region], ["Città", d.city], ["Indirizzo", d.address],
      ["Coordinate", d.latitude != null && d.longitude != null ? `${d.latitude}, ${d.longitude}` : null],
      ["Referente", d.contact_name], ["Telefono", d.phone], ["Fax", d.fax],
      ["Sito web", d.website, true], ["Europages", d.europages_url], ["LinkedIn", d.linkedin_url], ["Facebook", d.facebook_url],
      ["Email assistenza", d.support_email], ["Email amministrazione", d.email_admin], ["Email direzione", d.email_mgmt],
      ["PEC", d.pec], ["Codice SDI", d.sdi],
    ]],
    ["Attività", [
      ["Tipo fornitore", TIPO[d.supplier_type] || d.supplier_type],
      ["Fornisce materie prime", d.raw_material_supplier == null ? null : d.raw_material_supplier ? "Sì" : "No"],
      ["Settore", d.sector_hint], ["Capacità produttiva", d.production_capacity],
      ["Paesi serviti", fmtList(d.countries_served)], ["Dipendenti", d.employee_count_range],
      ["Anno fondazione", d.founded_year], ["Certificazioni", fmtList(d.company_certifications)],
      ["Descrizione", d.description],
    ]],
  ];

  return (
    <div style={box}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18, marginBottom: 18 }}>
        {SECTIONS.map(([title, fields]) => {
          const shown = fields.filter(([, v, always]) => always || (v != null && v !== ""));
          if (shown.length === 0) return null;
          return (
            <div key={title}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: C.muted, marginBottom: 8 }}>{title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {shown.map(([label, value]) => (
                  <div key={label} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, fontSize: 12.5, alignItems: "baseline" }}>
                    <span style={{ color: C.muted }}>{label}</span>
                    <FieldValue value={value} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Prodotti abbinati: è ciò che il fornitore porterebbe a catalogo se verificato */}
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: C.muted, marginBottom: 8 }}>
        Prodotti abbinati ({products.length})
      </div>
      {products.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16 }}>Nessun prodotto abbinato a questo fornitore.</div>
      ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: "#fff", overflow: "hidden", marginBottom: 16 }}>
          {products.map(p => (
            <div key={p.supplier_product_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: `1px solid ${C.border}`, fontSize: 12.5 }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.product_name || "—"}</span>
              {p.grade && <span style={{ color: C.muted, flexShrink: 0 }}>{p.grade}</span>}
              <Badge on={p.active} onLabel="Attivo" offLabel="Non attivo" />
              <Badge on={p.has_price} onLabel="Con prezzo" offLabel="Senza prezzo" />
            </div>
          ))}
        </div>
      )}

      {/* Verifica azienda (DAV-33): unica azione di approvazione — badge
          "Verificato" pubblico + i listini già compilati dal fornitore
          rivendicato diventano visibili da soli (gate in lettura su price_tiers). */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: "#fff", padding: "12px 14px", marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>Verifica azienda</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
            {d.manually_verified
              ? "Verificata: badge pubblico e listini visibili ai clienti."
              : "Non verificata: profilo visibile come “in attesa di verifica”, listini salvabili ma non pubblici."}
          </div>
        </div>
        {d.manually_verified
          ? <Badge on={true} onLabel="Verificata" offLabel="" />
          : <button disabled={busy} onClick={onMarkVerified}
              style={{ background: "#fff", color: C.green, border: `1.5px solid ${C.green}`, borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={14} /> Segna verificata (badge + prezzi pubblici)
            </button>}
      </div>

      {/* Visibilità pubblica (DAV-33-bis): risposta immediata a una lamentela —
          l'azienda sparisce da directory/prodotto/profilo/candidati senza
          cancellare nulla. Reversibile. */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: "#fff", padding: "12px 14px", marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>Visibilità pubblica</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
            {d.hidden_from_public
              ? `Nascosta da tutte le viste pubbliche${d.hidden_reason ? ` — ${d.hidden_reason}` : ""}.`
              : "Visibile nelle viste pubbliche (directory, scheda prodotto, profilo)."}
          </div>
        </div>
        {d.hidden_from_public
          ? <button disabled={busy} onClick={() => onToggleHidden(false)}
              style={{ background: "#fff", color: C.text, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer" }}>
              Ripristina visibilità
            </button>
          : <button disabled={busy} onClick={() => onToggleHidden(true)}
              style={{ background: "#fff", color: C.red, border: `1.5px solid ${C.red}`, borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ShieldAlert size={14} /> Nascondi su richiesta
            </button>}
      </div>

      {/* Stesse azioni della lista, così la revisione si chiude da qui */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={busy} onClick={onVerify}
          style={{ background: C.green, color: "#fff", border: `1.5px solid ${C.green}`, borderRadius: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <ShieldCheck size={14} /> Verifica e pubblica
        </button>
        <button disabled={busy} onClick={onDiscard}
          style={{ background: discardArmed ? C.red : "#fff", color: discardArmed ? "#fff" : C.red, border: `1.5px solid ${C.red}`, borderRadius: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Trash2 size={14} /> {discardArmed ? "Confermi eliminazione?" : "Scarta"}
        </button>
      </div>
    </div>
  );
}

function Badge({ on, onLabel, offLabel }) {
  return (
    <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, borderRadius: 100, padding: "2px 8px", background: on ? "#ECFDF5" : "#F1F5F9", color: on ? C.green : C.muted }}>
      {on ? onLabel : offLabel}
    </span>
  );
}

function FieldValue({ value }) {
  if (value == null || value === "") return <span style={{ color: "#94A3B8" }}>—</span>;
  const s = String(value);
  if (/^https?:\/\//i.test(s)) {
    return (
      <a href={s} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
        style={{ color: C.blue, textDecoration: "none", wordBreak: "break-all", display: "inline-flex", alignItems: "center", gap: 4 }}>
        {s.replace(/^https?:\/\//i, "").replace(/\/$/, "")} <ExternalLink size={11} />
      </a>
    );
  }
  if (s.includes("@") && !s.includes(" ")) {
    return <a href={`mailto:${s}`} onClick={e => e.stopPropagation()} style={{ color: C.blue, textDecoration: "none", wordBreak: "break-all" }}>{s}</a>;
  }
  return <span style={{ fontWeight: 600, wordBreak: "break-word" }}>{s}</span>;
}

function fmtList(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  return String(v) || null;
}

function fmtDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("it-IT");
}
