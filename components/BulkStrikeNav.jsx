"use client";
// ─── SHARED BULKSTRIKE NAVBAR — single source of truth ───────────────────────
// Modeled on the Home navbar: logo (doubles as home link) + centered product
// search + fixed link set + NavAuth (cart / avatar / logout). Same links, same
// names, same order on every page. Link visibility is intentionally NOT gated
// by role — these are all public browse pages; role only changes the NavAuth
// cluster (logged-in vs logged-out). Mobile: hamburger toggles a dropdown, the
// search drops to its own row.

import { useState } from "react";
import { Menu, X } from "lucide-react";
import ProductSearch from "@/components/BulkStrikeProductSearch";
import NavAuth from "@/components/BulkStrikeNavAuth";
import { BSIcon } from "@/components/BSLogo";

const C = { border: "#E2E8F0", text: "#0F172A", muted: "#64748B" };

// Fixed link set — same labels/order everywhere. "Come funziona" points at the
// Home anchor with a leading "/" so it works from any page, not just the Home.
const LINKS = [
  ["Aste attive", "/pool"],
  ["Prodotti", "/catalogo"],
  ["Fornitori", "/fornitori"],
  ["Corrieri", "/corrieri"],
  ["Come funziona", "/#come-funziona"],
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
        @media (max-width:768px) {
          .bsnav-links { display:none !important; }
          .bsnav-hamburger { display:flex !important; align-items:center; justify-content:center; }
          .bsnav-logo-wrap { flex:1 !important; display:flex !important; justify-content:center !important; }
          .bsnav-search-desktop { display:none !important; }
          .bsnav-search-mobile { display:block !important; padding:10px 16px 14px; border-top:1px solid ${C.border}; }
          .bsnav-menu-panel { display:block !important; border-top:1px solid ${C.border}; background:#fff; }
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

          {/* Ricerca — desktop */}
          <div className="bsnav-search-desktop" style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <ProductSearch height={46} maxWidth={580} placeholder="Cerca materie prime, CAS, E-number..." />
          </div>

          {/* Nav right */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0, marginLeft: "auto" }}>
            <div className="bsnav-links">
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

        {/* Menu mobile */}
        {mobileMenuOpen && (
          <div className="bsnav-menu-panel">
            {LINKS.map(([l, href]) => (
              <div key={l} onClick={() => { window.location.href = href; }} style={{ padding: "13px 20px", fontSize: 15, fontWeight: 600, color: C.text, borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>{l}</div>
            ))}
          </div>
        )}
      </nav>
    </>
  );
}
