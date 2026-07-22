"use client";
// ─── MECCANISMO TENDINA CONDIVISO ────────────────────────────────────────────
// Estratto dal mega menu Categorie: è l'UNICA implementazione dell'apertura a
// tendina in nav. Chi ha bisogno di una tendina (Categorie, Prodotti) usa questo
// hook + questo pannello, non una copia.
//
// Comportamento (e motivo per cui è fatto così — non semplificare):
//  - hover con delay anti-flicker: 120ms in apertura, 220ms in chiusura, con i
//    timer che si annullano a vicenda. Senza i delay il menu sfarfalla quando il
//    mouse attraversa il trigger.
//  - il pannello NON viene smontato al toggle: resta montato e si anima solo
//    opacity/visibility/transform. Smontarlo faceva "flashare" il contenuto.
//  - paddingTop sul contenitore del pannello fa da ponte trasparente sul gap col
//    trigger: senza, c'è una zona morta che chiude il menu passandoci sopra.
//  - Escape chiude e riporta il focus al trigger; click fuori chiude.
import { useState, useEffect, useRef, useCallback } from "react";

const C = { border: "#E2E8F0" };

export function useHoverMenu() {
  const [open, setOpen] = useState(false);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);
  const triggerRef = useRef(null);
  const wrapRef = useRef(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);

  const scheduleOpen = useCallback(() => { clearTimers(); openTimer.current = setTimeout(() => setOpen(true), 120); }, [clearTimers]);
  const scheduleClose = useCallback(() => { clearTimers(); closeTimer.current = setTimeout(() => setOpen(false), 220); }, [clearTimers]);

  const close = useCallback((refocus = false) => {
    clearTimers();
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, [clearTimers]);

  const toggle = useCallback(() => {
    if (open) { close(false); } else { clearTimers(); setOpen(true); }
  }, [open, close, clearTimers]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(true); };
    const onClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) close(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open, close]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // Props pronte da spalmare su wrapper e trigger, così ogni chiamante aggancia
  // lo stesso comportamento senza reimplementarlo.
  const wrapProps = { ref: wrapRef, onPointerEnter: scheduleOpen, onPointerLeave: scheduleClose };
  const triggerProps = { ref: triggerRef, "aria-haspopup": "true", "aria-expanded": open, onClick: toggle };

  return { open, close, wrapProps, triggerProps };
}

// Contenitore del pannello: posizionamento, ponte anti-zona-morta e transizione.
// Il contenuto interno lo decide il chiamante (due colonne per Categorie, lista
// semplice per Prodotti).
export function HoverMenuPanel({ open, label, width, align = "left", children }) {
  return (
    <div
      role="region"
      aria-label={label}
      aria-hidden={!open}
      style={{
        position: "absolute", top: "100%", [align]: 0, zIndex: 60, paddingTop: 8, width,
        opacity: open ? 1 : 0,
        visibility: open ? "visible" : "hidden",
        transform: open ? "translateY(0)" : "translateY(-6px)",
        transition: "opacity .14s ease, transform .14s ease, visibility .14s",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: "0 18px 50px rgba(13,33,55,.16)", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
