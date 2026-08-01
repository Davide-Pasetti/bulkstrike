"use client";
// ─── MENU ACCOUNT (dropdown header) ──────────────────────────────────────────
// ATTENZIONE: è il dropdown dell'HEADER, NON la sidebar della dashboard
// (componente diverso, non toccarla). Modello AliExpress/Amazon Business:
// trigger prominente (avatar + etichetta + chevron) e pannello con le voci
// account, role-aware tramite i flag companies.is_* di getMyCompany().
//
// Le voci "Messaggi" e "Fornitori preferiti" compaiono solo quando le
// rispettive pagine esistono (FEATURE_MESSAGING/FEATURE_FOLLOWS sotto) —
// vengono attivate insieme alla loro implementazione (step 5/6 del task).
//
// Accessibilità: Enter/click apre, Escape chiude e rifocalizza il trigger,
// focus visibile su tutte le voci, chiusura su click fuori.
import { useState, useEffect, useRef, useCallback } from "react";
import {
  User, Gavel, Package, MessageSquare, Star, ShoppingCart, LayoutGrid, Receipt,
  Factory, LifeBuoy, LogOut, ChevronDown,
} from "lucide-react";
import { getMyCompany, signOut, getUnreadMessagesCount } from "@/lib/api";

const C = { border: "#E2E8F0", text: "#0F172A", muted: "#64748B", blue: "#0EA5E9", dark: "#0D2137", bg: "#F8FAFE", red: "#DC2626" };

// Messaggistica e fornitori preferiti (step 5/6): attive.
const FEATURE_MESSAGING = true;
const FEATURE_FOLLOWS = true;

function Item({ href, icon: Icon, label, badge, danger, onClick, note }) {
  return (
    <a
      className="bsam-item"
      href={href}
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 14px", textDecoration: "none", color: danger ? C.red : C.text, fontSize: 13.5, fontWeight: 600, borderRadius: 10, cursor: "pointer" }}
    >
      <Icon size={16} color={danger ? C.red : C.muted} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        {label}
        {note && <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: C.muted, marginTop: 1 }}>{note}</span>}
      </span>
      {badge > 0 && (
        <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 100, background: "#0369A1", color: "#fff", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </a>
  );
}

export default function AccountMenu({ email, cartCount = 0 }) {
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState(null);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);

  const initial = ((email || "U").trim()[0] || "U").toUpperCase();

  // Company (flag ruoli) e conteggio non letti: caricati una volta al mount,
  // così il badge messaggi è visibile anche a menu chiuso (sul trigger).
  useEffect(() => {
    getMyCompany().then(setCompany).catch(() => {});
    if (FEATURE_MESSAGING) {
      getUnreadMessagesCount().then((n) => setUnread(n || 0)).catch(() => {});
    }
  }, []);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(true); };
    const onClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) close(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open, close]);

  const logout = async (e) => {
    e.preventDefault();
    try { await signOut(); } catch { /* già scaduta */ }
    window.location.href = "/";
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <style>{`
        .bsam-trigger:focus-visible, .bsam-item:focus-visible { outline: 2px solid ${C.blue}; outline-offset: 2px; border-radius: 10px; }
        .bsam-item:hover { background: ${C.bg}; }
        @media (max-width: 900px) { .bsam-label { display: none !important; } }
      `}</style>

      <button
        ref={triggerRef}
        className="bsam-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={email ? `Account · ${email}` : "Account"}
        style={{ display: "flex", alignItems: "center", gap: 9, height: 46, padding: "0 10px 0 6px", background: open ? C.bg : "#fff", border: `1.5px solid ${open ? C.blue : C.border}`, borderRadius: 10, cursor: "pointer", fontFamily: "Inter,system-ui", position: "relative" }}
      >
        <span style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#0EA5E9,#22D3EE)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14.5 }}>{initial}</span>
        <span className="bsam-label" style={{ textAlign: "left", lineHeight: 1.15 }}>
          <span style={{ display: "block", fontSize: 10.5, color: C.muted, fontWeight: 500 }}>Il mio</span>
          <span style={{ display: "block", fontSize: 13, color: C.text, fontWeight: 700 }}>account</span>
        </span>
        <ChevronDown size={14} color={C.muted} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
        {unread > 0 && !open && (
          <span style={{ position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 100, background: C.red, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="menu" aria-label="Menu account" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 60, width: 284, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 18px 50px rgba(13,33,55,.16)", padding: 8, maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
          {/* intestazione: chi sei */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px 12px", borderBottom: `1px solid ${C.border}`, marginBottom: 6 }}>
            <span style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#0D2137,#0C4A6E)", color: "#38BDF8", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{initial}</span>
            <span style={{ minWidth: 0 }}>
              {company?.legal_name && <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{company.legal_name}</span>}
              <span style={{ display: "block", fontSize: 11.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</span>
            </span>
          </div>

          {/* Voci condivise col menu laterale: STESSI nomi e stesso ordine relativo
              (Panoramica, Ordini, Aste personali, Messaggi, Fornitori preferiti, Account). */}
          <Item href="/dashboard?section=overview" icon={LayoutGrid} label="Panoramica" />
          <Item href="/ordini" icon={Package} label="Ordini" />
          <Item href="/dashboard?section=pools" icon={Gavel} label="Aste personali" note={company?.is_buyer && company?.is_supplier ? "acquisti e vendite" : undefined} />
          {FEATURE_MESSAGING && <Item href="/messaggi" icon={MessageSquare} label="Messaggi" badge={unread} />}
          {FEATURE_FOLLOWS && <Item href="/preferiti" icon={Star} label="Fornitori preferiti" />}
          <Item href="/dashboard?section=account" icon={User} label="Account" />

          <div style={{ height: 1, background: C.border, margin: "6px 6px" }} />

          {/* Utility di accesso rapido (non presenti nel laterale). */}
          <Item href="/carrello" icon={ShoppingCart} label="Carrello" badge={cartCount} />
          <Item href="/dashboard?section=account" icon={Receipt} label="Fatturazione" note="dati IBAN e pagamento" />
          {company && !company.is_supplier && (
            <Item href="/dashboard?section=account" icon={Factory} label="Diventa fornitore" note="vendi le tue materie prime" />
          )}
          <Item href="/ordini" icon={LifeBuoy} label="Assistenza e contestazioni" note="si aprono dal dettaglio ordine" />

          <div style={{ height: 1, background: C.border, margin: "6px 6px" }} />

          <Item href="/" icon={LogOut} label="Esci" danger onClick={logout} />
        </div>
      )}
    </div>
  );
}
