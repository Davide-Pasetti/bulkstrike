"use client";

import { useState } from "react";
import { Clock, Tag, ArrowRight, X } from "lucide-react";
import { addPromotionToCart, promotionErrorMessage, getSession } from "@/lib/api";

// Card della Bacheca Promozioni (DAV-76). Autonoma: mostra lo sconto fisso a
// tempo e gestisce l'"Acquista in promozione" (scelta quantità → carrello con
// promotion_id → checkout). NON è un'asta: nessun linguaggio da asta.
//
// Props: promo (oggetto da getActivePromotions), width (opzionale, px).

const C = {
  text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE",
  green: "#059669", amber: "#D97706", promoBg: "#FFF7ED", promoBorder: "#FED7AA",
};

const eur = (n) => `€${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const kgFmt = (n) => `${Number(n).toLocaleString("it-IT")} kg`;

function countdown(endsIso) {
  const ms = new Date(endsIso).getTime() - Date.now();
  if (ms <= 0) return "In scadenza";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `Scade tra ${d}g ${h}h` : `Scade tra ${h}h`;
}

// Etichetta prezzo di riferimento: "6 mesi" solo con storico completo (>=180 gg),
// altrimenti il numero reale di giorni con l'avviso "storico in accumulo".
function baseLabel(promo) {
  const n = Number(promo.base_price_window_days) || 0;
  const ref = eur(promo.base_price_reference);
  return n >= 180
    ? `vs ${ref}/kg medio ultimi 6 mesi`
    : `vs ${ref}/kg medio ultimi ${n} ${n === 1 ? "giorno" : "giorni"} (storico in accumulo)`;
}

export default function BulkStrikePromoCard({ promo, width }) {
  const remaining = promo.available_kg != null ? Number(promo.remaining_kg) : null;
  const defaultQty = remaining != null && remaining < 1000 ? remaining : 1000;

  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(defaultQty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const openModal = async () => {
    // Coerente col resto del sito: se non loggato, manda al login.
    const session = await getSession().catch(() => null);
    if (!session) { window.location.href = "/auth/login"; return; }
    setErr(null); setQty(defaultQty); setOpen(true);
  };

  const confirm = async () => {
    const q = Number(qty);
    if (!q || q <= 0) { setErr("Inserisci una quantità valida."); return; }
    if (remaining != null && q > remaining) { setErr(`Restano solo ${kgFmt(remaining)} in promozione.`); return; }
    setBusy(true); setErr(null);
    try {
      await addPromotionToCart(promo.id, q);
      window.location.href = "/checkout";
    } catch (e) {
      setErr(promotionErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div style={{
      width: width || undefined, flex: width ? "0 0 auto" : undefined,
      background: "#FFFFFF", border: `1px solid ${C.border}`, borderRadius: 16,
      padding: 20, display: "flex", flexDirection: "column", gap: 14,
      boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    }}>
      {/* badge riga: categoria + PROMO */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {promo.merch_classes && (
            <span style={{ background: "#EFF6FF", color: "#1D4ED8", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
              {String(promo.merch_classes).split(",")[0].trim()}
            </span>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.promoBg, color: C.amber, border: `1px solid ${C.promoBorder}`, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em" }}>
            <Tag size={11} /> PROMO
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.amber, fontWeight: 600 }}>
          <Clock size={12} /> {countdown(promo.ends_at)}
        </div>
      </div>

      {/* prodotto + fornitore (sempre visibile, a differenza delle aste) */}
      <div>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0 }}>{promo.product_name}</h3>
        <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>di {promo.supplier_name}</p>
      </div>

      {/* prezzo promo + risparmio */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ background: C.promoBg, border: `1px solid ${C.promoBorder}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Prezzo promo</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: C.amber }}>
            {eur(promo.discounted_price_per_kg)}<span style={{ fontSize: 11 }}>/kg</span>
          </div>
        </div>
        <div style={{ background: C.bg, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Risparmio</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: C.green }}>
            -{promo.discount_percent}%
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: -6 }}>{baseLabel(promo)}</div>

      {/* banner quantità residua (solo se impostata) */}
      {remaining != null && (
        <div style={{ background: C.bg, border: `1px dashed ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.text }}>
          Quantità residua: <strong>{kgFmt(remaining)}</strong>
        </div>
      )}

      <button onClick={openModal} style={{
        marginTop: "auto", width: "100%", background: C.amber, color: "#fff", border: "none",
        borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        fontFamily: "'Inter',system-ui",
      }}>
        Acquista in promozione <ArrowRight size={15} />
      </button>

      {/* modale scelta quantità */}
      {open && (
        <div onClick={() => !busy && setOpen(false)} style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1200,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 16, color: C.text }}>Acquista in promozione</strong>
              <button onClick={() => !busy && setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 14, color: C.text }}>
                {promo.product_name} — <strong>{eur(promo.discounted_price_per_kg)}/kg</strong> di {promo.supplier_name}
              </div>
              <label style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>
                Quantità (kg)
                <input
                  type="number" min={1} max={remaining != null ? remaining : undefined} step={1}
                  value={qty} onChange={(e) => setQty(e.target.value)} disabled={busy}
                  style={{ marginTop: 6, width: "100%", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 15, fontFamily: "'JetBrains Mono',monospace" }}
                />
              </label>
              {remaining != null && <div style={{ fontSize: 12, color: C.muted }}>Massimo disponibile: {kgFmt(remaining)}</div>}
              <div style={{ background: C.bg, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text }}>
                Totale merce stimato: <strong style={{ fontFamily: "'JetBrains Mono',monospace" }}>
                  {qty && Number(qty) > 0 ? eur(Number(qty) * Number(promo.discounted_price_per_kg)) : "—"}
                </strong> <span style={{ color: C.muted, fontSize: 12 }}>(IVA e spedizione al checkout)</span>
              </div>
              {err && <div style={{ fontSize: 13, color: "#DC2626" }}>{err}</div>}
              <button onClick={confirm} disabled={busy} style={{
                width: "100%", background: C.amber, color: "#fff", border: "none", borderRadius: 10,
                padding: "12px", fontSize: 15, fontWeight: 700, cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.7 : 1, fontFamily: "'Inter',system-ui",
              }}>
                {busy ? "Aggiungo…" : "Vai al pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
