"use client";
// ─── SHARED BULKSTRIKE NAVBAR — single source of truth ───────────────────────
// Modeled on the Home navbar: logo (doubles as home link) + centered product
// search + fixed link set + NavAuth (cart / avatar / logout). Same links, same
// names, same order on every page. Link visibility is intentionally NOT gated
// by role — these are all public browse pages; role only changes the NavAuth
// cluster (logged-in vs logged-out). Mobile: hamburger toggles a dropdown, the
// search drops to its own row.

import { useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import ProductSearch from "@/components/BulkStrikeProductSearch";
import NavAuth from "@/components/BulkStrikeNavAuth";
import MegaMenu, { MegaMenuMobile } from "@/components/BulkStrikeMegaMenu";
import { useHoverMenu, HoverMenuPanel } from "@/components/BulkStrikeHoverMenu";
import { BSIcon } from "@/components/BSLogo";

const C = { border: "#E2E8F0", text: "#0F172A", muted: "#64748B", blue: "#0EA5E9", dark: "#0D2137", bg: "#F8FAFE" };

// "Prodotti" non è più un link diretto: è una tendina che raccoglie catalogo,
// aste e andamento prezzi (queste ultime due non sono più voci separate).
const PRODOTTI_MENU = [
  ["Catalogo", "/catalogo", "Tutte le materie prime a catalogo"],
  ["Aste attive", "/pool", "Le aste a ribasso aperte in questo momento"],
  ["Andamento prezzi", "/andamento-prezzi", "Come si muovono i prezzi di mercato"],
];

// "Fornitori" segue lo stesso schema: le tre tipologie portano alla directory
// già filtrata per tipo (deep-link ?type= gestito da BulkStrikeSuppliers).
const FORNITORI_MENU = [
  ["Produttori", "/fornitori?type=producer", "Chi produce direttamente la materia prima"],
  ["Distributori", "/fornitori?type=distributor", "Chi rivende materie prime di altri produttori"],
  ["Importatori", "/fornitori?type=importer", "Chi importa materie prime da mercati esteri"],
  ["Mediatori", "/fornitori?type=broker", "Chi intermedia la compravendita tra venditori e acquirenti"],
];

// Fixed link set — same labels/order everywhere.
const LINKS = [
  ["Bacheca", "/bacheca"],
  ["Corrieri", "/corrieri"],
];

export default function BulkStrikeNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <>
      <style>{`
        .bsnav-hamburger { display:none; background:none; border:none; cursor:pointer; padding:6px; margin:-6px; flex-shrink:0; }
        .bsnav-links { display:flex; gap:20px; }
        .bsnav-search-mobile { display:none; }
        .bsnav-menu-panel { display:none; }
        @media (max-width:1080px) {
          .bsnav-links { display:none !important; }
        }
        @media (max-width:768px) {
          .bsnav-hamburger { display:flex !important; align-items:center; justify-content:center; }
          .bsnav-logo-wrap { flex:1 !important; display:flex !important; justify-content:center !important; }
          .bsnav-search-desktop { display:none !important; }
          .bsnav-megamenu-desktop { display:none !important; }
          .bsnav-search-mobile { display:block !important; padding:10px 16px 14px; border-top:1px solid ${C.border}; }
          .bsnav-menu-panel { display:block !important; border-top:1px solid ${C.border}; background:#fff; max-height:calc(100vh - 70px); overflow-y:auto; }
        }
      `}</style>

      <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(255,255,255,0.96)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px", height: 68, display: "flex", alignItems: "center", gap: 20 }}>
          {/* Hamburger — solo mobile */}
          <button className="bsnav-hamburger" onClick={() => setMobileMenuOpen(o => !o)} aria-label="Menu">
            {mobileMenuOpen ? <X size={22} color={C.text} /> : <Menu size={22} color={C.text} />}
          </button>

          {/* Logo → home */}
          <div className="bsnav-logo-wrap" style={{ flexShrink: 0 }}>
            <div onClick={() => { window.location.href = "/"; }} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <BSIcon size={36} uid="nav" />
              <div style={{ display: "flex", alignItems: "baseline", fontFamily: "Inter,system-ui,sans-serif" }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: C.text, letterSpacing: "-0.03em" }}>Bulk</span>
                <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Strike</span>
              </div>
            </div>
          </div>

          {/* Mega menu categorie + ricerca — desktop. La barra di ricerca resta
              prominente ACCANTO al selettore categorie, non dentro il menu. */}
          <div className="bsnav-megamenu-desktop" style={{ flexShrink: 0 }}>
            <MegaMenu />
          </div>
          <div className="bsnav-search-desktop" style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <ProductSearch height={46} maxWidth={580} placeholder="Cerca materie prime, CAS, E-number..." />
          </div>

          {/* Nav right */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0, marginLeft: "auto" }}>
            <div className="bsnav-links">
              <NavDropdown label="Prodotti" items={PRODOTTI_MENU} home="/catalogo" />
              <NavDropdown label="Fornitori" items={FORNITORI_MENU} home="/fornitori" />
              {LINKS.map(([l, href]) => (
                <span key={l} onClick={() => { window.location.href = href; }} style={{ fontSize: 14, color: C.muted, cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" }}>{l}</span>
              ))}
            </div>
            <NavAuth />
          </div>
        </div>

        {/* Ricerca — riga mobile */}
        <div className="bsnav-search-mobile">
          <ProductSearch height={46} placeholder="Cerca materie prime, CAS, E-number..." />
        </div>

        {/* Menu mobile: categorie (accordion tap-to-open), poi Prodotti e
            Fornitori con le loro voci — stesso tap-to-open, niente hover —
            poi i link fissi */}
        {mobileMenuOpen && (
          <div className="bsnav-menu-panel">
            <MegaMenuMobile />
            <NavDropdownMobile label="Prodotti" items={PRODOTTI_MENU} home="/catalogo" />
            <NavDropdownMobile label="Fornitori" items={FORNITORI_MENU} home="/fornitori" />
            {LINKS.map(([l, href]) => (
              <div key={l} onClick={() => { window.location.href = href; }} style={{ padding: "13px 20px", fontSize: 15, fontWeight: 600, color: C.text, borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>{l}</div>
            ))}
          </div>
        )}
      </nav>
    </>
  );
}

// ─── Tendina di nav generica — desktop ───────────────────────────────────────
// Stesso meccanismo di "Categorie" (useHoverMenu/HoverMenuPanel): hover con
// delay anti-flicker, click per chi non usa il mouse, pannello sempre montato.
// Allineata a destra perché le voci stanno nel gruppo di link di destra.
// Usata da "Prodotti" e "Fornitori": una sola implementazione, non copie.
function NavDropdown({ label, items, home }) {
  const { open, close, wrapProps, triggerProps } = useHoverMenu();
  return (
    <div {...wrapProps} style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
      <style>{`
        .bsnav-dd-trigger:focus-visible, .bsnav-dd-item:focus-visible {
          outline: 2px solid ${C.blue}; outline-offset: 2px; border-radius: 8px;
        }
        .bsnav-dd-item:hover { background: ${C.bg}; }
      `}</style>

      {/* La label è un vero link alla pagina principale della sezione: cliccarla
          naviga (Catalogo / Tutti i fornitori). La tendina si apre in hover
          (desktop) o cliccando la freccia — che resta il trigger per chi non usa
          il mouse (tastiera / focus). */}
      <a
        href={home}
        className="bsnav-dd-trigger"
        style={{ display: "flex", alignItems: "center", background: "none", border: "none", padding: 0, fontSize: 14, fontWeight: 500, color: open ? C.dark : C.muted, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "Inter,system-ui", textDecoration: "none" }}
      >
        {label}
      </a>
      <button
        {...triggerProps}
        aria-label={`Apri il menu ${label}`}
        className="bsnav-dd-trigger"
        style={{ display: "flex", alignItems: "center", background: "none", border: "none", padding: 0, color: open ? C.dark : C.muted, cursor: "pointer" }}
      >
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      <HoverMenuPanel open={open} label={label} width={280} align="right">
        <div style={{ padding: 8 }}>
          {items.map(([itemLabel, href, hint]) => (
            <a
              key={href}
              className="bsnav-dd-item"
              href={href}
              onClick={() => close(false)}
              style={{ display: "block", padding: "10px 12px", borderRadius: 10, textDecoration: "none" }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.dark }}>{itemLabel}</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{hint}</div>
            </a>
          ))}
        </div>
      </HoverMenuPanel>
    </div>
  );
}

// ─── Tendina di nav generica — mobile ────────────────────────────────────────
// Accordion tap-to-open, stesso schema di MegaMenuMobile (niente hover).
function NavDropdownMobile({ label, items, home }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      {/* Mobile: la label naviga subito (link), la freccia dedicata apre/chiude
          l'accordion delle sotto-voci — così cliccare la label non fa solo toggle. */}
      <div style={{ display: "flex", alignItems: "center", background: expanded ? C.bg : "transparent" }}>
        <a
          href={home}
          style={{ flex: 1, padding: "13px 20px", fontSize: 15, fontWeight: 600, color: C.text, textDecoration: "none", fontFamily: "Inter,system-ui" }}
        >
          {label}
        </a>
        <button
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          aria-label={`Mostra le voci di ${label}`}
          style={{ display: "flex", alignItems: "center", padding: "13px 20px", background: "none", border: "none", cursor: "pointer" }}
        >
          <ChevronDown size={15} color={C.muted} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
        </button>
      </div>
      {expanded && (
        <div style={{ padding: "2px 12px 10px 20px", display: "flex", flexDirection: "column" }}>
          {items.map(([itemLabel, href]) => (
            <a key={href} href={href} style={{ padding: "9px 10px", fontSize: 14, fontWeight: 600, color: C.text, textDecoration: "none" }}>{itemLabel}</a>
          ))}
        </div>
      )}
    </div>
  );
}
