"use client";
// ─── SHELL DEL PROFILO (header + sidebar persistente) ────────────────────────
// Estratta da BulkStrikeDashboard: la stessa struttura (header slim con logo,
// campanella e avatar + sidebar a sinistra) avvolge ORA TUTTE le voci del menu
// laterale — Panoramica/Avvisi/Aste/Account (sezioni interne della dashboard,
// via /dashboard?section=…) e le pagine Ordini, Messaggi, Fornitori preferiti,
// Listino prodotti, Listino servizi, Admin. Cliccando una voce la sidebar
// resta al suo posto: cambia solo l'area di contenuto.
//
// `active` = id della voce evidenziata; `headerCenter` = nodo opzionale al
// centro dell'header (la dashboard ci mette il toggle Acquirente/Fornitore).
// Le voci con show:false sono nascoste per il ruolo corrente (flag
// companies.is_* da getMyCompany, stesso pattern della vecchia sidebar).
import { useState, useEffect } from "react";
import { LayoutGrid, Bell, ShoppingBag, Gavel, MessageSquare, Star, Package, Truck, Shield, ShieldCheck, Settings } from "lucide-react";
import { BSIcon } from "@/components/BSLogo";
import NavAuth from "@/components/BulkStrikeNavAuth";
import { getMyCompany, getNotifications, getUnreadMessagesCount, adminCountPendingSuppliers } from "@/lib/api";

const C = { blue: "#0EA5E9", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", red: "#DC2626" };

function Badge({ n }) {
  if (!n || n <= 0) return null;
  return (
    <span style={{ marginLeft: "auto", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: C.red, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

export default function ProfileShell({ active, headerCenter = null, children }) {
  const [company, setCompany] = useState(null);
  const [notifUnread, setNotifUnread] = useState(0);
  const [msgUnread, setMsgUnread] = useState(0);
  const [pendingSuppliers, setPendingSuppliers] = useState(0);

  useEffect(() => {
    getMyCompany().then(setCompany).catch(() => {});
    getNotifications().then((rows) => setNotifUnread((rows || []).filter((r) => !r.is_read).length)).catch(() => {});
    getUnreadMessagesCount().then((n) => setMsgUnread(n || 0)).catch(() => {});
    // Restituisce 0 per i non-admin (guardia lato RPC), quindi la chiamata è innocua.
    adminCountPendingSuppliers().then((n) => setPendingSuppliers(n || 0)).catch(() => {});
  }, []);

  const SIDEBAR = [
    { id: "overview",  label: "Panoramica",             icon: LayoutGrid,    href: "/dashboard?section=overview" },
    { id: "alerts",    label: "Avvisi & materie prime", icon: Bell,          href: "/dashboard?section=alerts", badge: notifUnread },
    { id: "ordini",    label: "Ordini",                 icon: ShoppingBag,   href: "/ordini" },
    { id: "pools",     label: "Aste attive",            icon: Gavel,         href: "/dashboard?section=pools" },
    { id: "messaggi",  label: "Messaggi",               icon: MessageSquare, href: "/messaggi", badge: msgUnread },
    { id: "preferiti", label: "Fornitori preferiti",    icon: Star,          href: "/preferiti" },
    { id: "prodotti",  label: "Listino prodotti",       icon: Package,       href: "/i-miei-prodotti", show: !!company?.is_supplier },
    { id: "servizi",   label: "Listino servizi",        icon: Truck,         href: "/corriere",        show: !!company?.is_carrier },
    { id: "admin",     label: "Admin",                  icon: Shield,        href: "/admin/prodotti",  show: !!company?.is_platform_admin },
    { id: "admin-fornitori", label: "Fornitori da verificare", icon: ShieldCheck, href: "/admin/fornitori", show: !!company?.is_platform_admin, badge: pendingSuppliers },
    { id: "account",   label: "Account",                icon: Settings,      href: "/dashboard?section=account" },
  ];

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh", colorScheme: "light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .bs-nav { display:flex; align-items:center; gap:11px; padding:10px 12px; border-radius:10px; cursor:pointer; font-size:14px; font-weight:600; font-family:'Inter',system-ui; transition:all 0.15s; text-decoration:none; }
        .bs-nav:focus-visible { outline:2px solid ${C.blue}; outline-offset:-2px; }
        @media (max-width:820px){ .bs-shell { grid-template-columns:1fr !important; } .bs-side { position:static !important; flex-direction:row !important; overflow-x:auto; } .bs-side .bs-nav span { display:none; } .bs-side .bs-nav { flex-shrink:0; } }
      `}</style>

      {/* HEADER slim (stessa struttura della vecchia dashboard) */}
      <header style={{ background: "#fff", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px", height: 62, display: "flex", alignItems: "center", gap: 16 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
            <BSIcon size={32} uid="shell" />
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.03em" }}>Bulk</span>
              <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Strike</span>
            </div>
          </div>

          {headerCenter ? <div style={{ marginLeft: "auto" }}>{headerCenter}</div> : <div style={{ marginLeft: "auto" }} />}

          {/* Stesso elemento in alto a destra della Home: carrello + menu account
              (NavAuth condiviso), così avatar e menu a tendina sono identici ovunque. */}
          <NavAuth />
        </div>
      </header>

      <div className="bs-shell" style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 20px 60px", display: "grid", gridTemplateColumns: "230px 1fr", gap: 22, alignItems: "start" }}>
        {/* SIDEBAR persistente */}
        <aside className="bs-side" style={{ position: "sticky", top: 84, display: "flex", flexDirection: "column", gap: 4 }}>
          {SIDEBAR.map((item) => {
            if (item.show === false) return null;
            const Ico = item.icon;
            const on = active === item.id;
            return (
              <a key={item.id} className="bs-nav" href={item.href} aria-current={on ? "page" : undefined} style={{ background: on ? "#EFF6FF" : "transparent", color: on ? C.blue : C.muted }}>
                <Ico size={18} /><span>{item.label}</span>
                <Badge n={item.badge} />
              </a>
            );
          })}
        </aside>

        {/* CONTENUTO */}
        <main style={{ minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}
