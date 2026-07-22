"use client";
// ─── MEGA MENU CATEGORIE ─────────────────────────────────────────────────────
// Modello a due colonne (stile Alibaba/AliExpress, non drill-down): colonna
// sinistra = 13 macro-aree con icona (emoji dal DB via get_taxonomy), hover o
// focus cambia la colonna destra = settori della macro-area raggruppati, con
// conteggio prodotti. Ogni voce porta al catalogo deep-linkato
// (/catalogo?macro=<slug>&sector=<slug>, già supportato dai filtri catalogo).
//
// Desktop: apertura in hover con piccolo delay anti-flicker + click/Enter per
// chi non usa il mouse, Escape chiude e riporta il focus sul bottone. Quel
// comportamento vive in useHoverMenu/HoverMenuPanel (BulkStrikeHoverMenu),
// condiviso con la tendina "Prodotti" della nav: se va cambiato, si cambia lì,
// non qui. Su mobile NON si usa questo componente ma l'accordion esportato in
// fondo (MegaMenuMobile), dentro il menu hamburger.
//
// Niente immagini prodotto nella colonna destra: i prodotti non hanno asset
// immagine nel data model (products non ha colonne immagine), quindi i blocchi
// mostrano settori + conteggi, non tile fotografiche.
import { useState, useEffect } from "react";
import { LayoutGrid, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { getMacroAreas, getMacroAreasCached } from "@/lib/api";
import { useHoverMenu, HoverMenuPanel } from "@/components/BulkStrikeHoverMenu";

const C = { border: "#E2E8F0", text: "#0F172A", muted: "#64748B", blue: "#0EA5E9", dark: "#0D2137", bg: "#F8FAFE" };

export default function MegaMenu() {
  // Stato iniziale dalla cache sincrona: al remount della pagina (swap shell
  // statica → dinamica di cacheComponents) il bottone/pannello non flasha.
  const [taxonomy, setTaxonomy] = useState(() => getMacroAreasCached() || []);
  const [activeId, setActiveId] = useState(() => getMacroAreasCached()?.[0]?.id ?? null);
  const { open, wrapProps, triggerProps } = useHoverMenu();

  useEffect(() => {
    getMacroAreas().then((t) => {
      setTaxonomy(t || []);
      if (t?.length) setActiveId((prev) => prev ?? t[0].id);
    }).catch(() => {});
  }, []);

  // Il bottone è SEMPRE renderizzato (mai return null): così non "flasha" via
  // quando la tassonomia arriva o quando cacheComponents rimonta la shell.
  const active = taxonomy.find((m) => m.id === activeId) || taxonomy[0] || null;

  return (
    <div {...wrapProps} style={{ position: "relative", flexShrink: 0 }}>
      <style>{`
        .bsmm-trigger:focus-visible, .bsmm-macro:focus-visible, .bsmm-sector:focus-visible, .bsmm-all:focus-visible {
          outline: 2px solid ${C.blue}; outline-offset: 2px; border-radius: 8px;
        }
        .bsmm-macro:hover, .bsmm-macro[data-active="true"] { background: ${C.bg}; color: ${C.dark}; }
        .bsmm-sector:hover { border-color: ${C.blue}; background: #EFF6FF; }
      `}</style>

      <button
        {...triggerProps}
        className="bsmm-trigger"
        style={{ display: "flex", alignItems: "center", gap: 8, height: 46, padding: "0 16px", background: open ? C.dark : "#fff", color: open ? "#fff" : C.text, border: `1.5px solid ${open ? C.dark : C.border}`, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui", whiteSpace: "nowrap" }}
      >
        <LayoutGrid size={17} color={open ? "#38BDF8" : C.blue} />
        Categorie
        <ChevronDown size={15} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {/* Pannello: montato UNA volta (quando la tassonomia è pronta) e mai
          smontato al toggle — apertura/chiusura, ponte anti-zona-morta e
          transizione stanno in HoverMenuPanel, condiviso con la nav. */}
      {active && (
        <HoverMenuPanel open={open} label="Categorie prodotti" width="min(920px, calc(100vw - 48px))">
          <div style={{ display: "flex", width: "100%", maxHeight: "min(560px, calc(100vh - 120px))" }}>
          {/* Colonna sinistra — macro-aree */}
          <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflowY: "auto", padding: "10px 8px", background: "#fff" }}>
            {taxonomy.map((m) => (
              <button
                key={m.id}
                className="bsmm-macro"
                data-active={m.id === active.id}
                onPointerEnter={() => setActiveId(m.id)}
                onFocus={() => setActiveId(m.id)}
                onClick={() => { window.location.href = `/catalogo?macro=${m.slug}`; }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px", background: "transparent", border: "none", borderRadius: 10, fontSize: 13.5, fontWeight: m.id === active.id ? 700 : 500, color: m.id === active.id ? C.dark : C.muted, cursor: "pointer", fontFamily: "Inter,system-ui" }}
              >
                <span style={{ fontSize: 17, flexShrink: 0 }} aria-hidden="true">{m.icon || "📦"}</span>
                <span style={{ flex: 1 }}>{m.name}</span>
                <ChevronRight size={14} color={m.id === active.id ? "#38BDF8" : "#CBD5E1"} />
              </button>
            ))}
          </div>

          {/* Colonna destra — settori della macro-area attiva */}
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: 20 }} aria-hidden="true">{active.icon || "📦"}</span>
                <span style={{ fontSize: 15.5, fontWeight: 800, color: C.dark, letterSpacing: "-0.01em" }}>{active.name}</span>
              </div>
              <a className="bsmm-all" href={`/catalogo?macro=${active.slug}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: C.blue, textDecoration: "none", whiteSpace: "nowrap" }}>
                Vedi tutto <ArrowRight size={13} />
              </a>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
              {(active.sub_areas || []).map((s) => (
                <a
                  key={s.id}
                  className="bsmm-sector"
                  href={`/catalogo?macro=${active.slug}&sector=${s.slug}`}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", border: `1px solid ${C.border}`, borderRadius: 10, textDecoration: "none", background: "#fff" }}
                >
                  <span style={{ fontSize: 15, flexShrink: 0 }} aria-hidden="true">{s.icon || "•"}</span>
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{s.name}</span>
                  {s.product_count > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, background: C.bg, borderRadius: 100, padding: "2px 7px", flexShrink: 0 }}>{s.product_count}</span>}
                </a>
              ))}
              {(active.sub_areas || []).length === 0 && (
                <div style={{ fontSize: 12.5, color: C.muted }}>Nessun settore in questa area.</div>
              )}
            </div>
          </div>
          </div>
        </HoverMenuPanel>
      )}
    </div>
  );
}

// ─── Versione mobile: accordion dentro il menu hamburger ────────────────────
// Tap sulla macro-area espande i settori (tap-to-open, niente hover).
export function MegaMenuMobile() {
  const [taxonomy, setTaxonomy] = useState(() => getMacroAreasCached() || []);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    getMacroAreas().then((t) => setTaxonomy(t || [])).catch(() => {});
  }, []);

  if (taxonomy.length === 0) return null;

  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <div style={{ padding: "13px 20px 6px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: C.muted }}>Categorie</div>
      {taxonomy.map((m) => {
        const expanded = openId === m.id;
        return (
          <div key={m.id}>
            <button
              onClick={() => setOpenId(expanded ? null : m.id)}
              aria-expanded={expanded}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "12px 20px", background: expanded ? C.bg : "transparent", border: "none", fontSize: 14.5, fontWeight: 600, color: C.text, cursor: "pointer", fontFamily: "Inter,system-ui" }}
            >
              <span style={{ fontSize: 17 }} aria-hidden="true">{m.icon || "📦"}</span>
              <span style={{ flex: 1 }}>{m.name}</span>
              <ChevronDown size={15} color={C.muted} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            </button>
            {expanded && (
              <div style={{ padding: "2px 12px 10px 34px", display: "flex", flexDirection: "column" }}>
                <a href={`/catalogo?macro=${m.slug}`} style={{ padding: "8px 10px", fontSize: 13, fontWeight: 700, color: C.blue, textDecoration: "none" }}>Vedi tutto in {m.name}</a>
                {(m.sub_areas || []).map((s) => (
                  <a key={s.id} href={`/catalogo?macro=${m.slug}&sector=${s.slug}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", fontSize: 13.5, color: C.text, textDecoration: "none" }}>
                    <span aria-hidden="true">{s.icon || "•"}</span> {s.name}
                    {s.product_count > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>({s.product_count})</span>}
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
