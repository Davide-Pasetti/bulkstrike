"use client";
// Bottone "Segui"/"Lo segui" per un PRODOTTO (tabella product_follows) — stesso
// stile visivo del bottone preferiti sui fornitori (stella ambra quando attivo).
// Controllato dal chiamante: `following` + `onChange(next)` aggiornano il set
// preferiti condiviso (card + filtro). `compact` = solo stella (per le card).
// Se l'utente non è loggato, la RPC fallisce e si va al login.
import { useState } from "react";
import { Star } from "lucide-react";
import { followProduct, unfollowProduct } from "@/lib/api";

const AMBER = { bg: "#FEF3C7", text: "#B45309", border: "#FDE68A", fill: "#D97706" };

export default function ProductFollowButton({ productId, following, onChange, compact = false, muted = "#64748B", text = "#0F172A", border = "#E2E8F0", stopPropagation = true }) {
  const [busy, setBusy] = useState(false);
  async function toggle(e) {
    if (stopPropagation && e) { e.stopPropagation(); e.preventDefault(); }
    if (busy || !productId) return;
    const next = !following;
    setBusy(true);
    try {
      if (next) await followProduct(productId); else await unfollowProduct(productId);
      onChange && onChange(next);
    } catch {
      window.location.href = "/auth/login"; // i preferiti richiedono un account
    } finally { setBusy(false); }
  }
  const title = following ? "Rimuovi dai prodotti preferiti" : "Aggiungi ai prodotti preferiti";
  if (compact) {
    return (
      <button onClick={toggle} disabled={busy} aria-pressed={following} title={title}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, background: following ? AMBER.bg : "#fff", border: `1.5px solid ${following ? AMBER.border : border}`, cursor: "pointer", flexShrink: 0, opacity: busy ? 0.6 : 1, padding: 0 }}>
        <Star size={15} fill={following ? AMBER.fill : "none"} color={following ? AMBER.fill : muted} />
      </button>
    );
  }
  return (
    <button onClick={toggle} disabled={busy} aria-pressed={following} title={title}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, background: following ? AMBER.bg : "#fff", color: following ? AMBER.text : text, border: `1.5px solid ${following ? AMBER.border : border}`, borderRadius: 9, padding: "10px 16px", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui", opacity: busy ? 0.6 : 1 }}>
      <Star size={15} fill={following ? AMBER.fill : "none"} color={following ? AMBER.fill : muted} />
      {following ? "Lo segui" : "Segui"}
    </button>
  );
}
