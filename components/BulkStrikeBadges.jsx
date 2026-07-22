"use client";
// ─── MICRO-BADGE RIUSABILI ───────────────────────────────────────────────────
// TrustBadge — "Pagamento protetto" (stile Trade Assurance): SOLO icona + due
// parole, MAI un paragrafo (il paragrafo esplicativo escrow è stato rimosso
// volutamente da carrello/checkout/asta: non reintrodurlo). Collegato
// all'architettura escrow Stripe Connect/SEPA già implementata.
// IvaChip — etichetta compatta per-prezzo "IVA esclusa" (modello Amazon
// Business: il prezzo netto è dichiarato accanto al numero, non solo in una
// nota a fondo pagina). Colori brand: navy #0D2137→#0C4A6E, ciano #38BDF8.
// SupplierTypeBadge — produttore/distributore accanto al nome del fornitore,
// ovunque compaia (card candidati, coda admin, scheda pubblica, directory).
import { ShieldCheck } from "lucide-react";

export function TrustBadge({ style }) {
  return (
    <span
      title="Pagamento in garanzia: fondi rilasciati al fornitore solo dopo la consegna"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 100, background: "linear-gradient(90deg,#0D2137,#0C4A6E)", color: "#fff", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.01em", whiteSpace: "nowrap", ...style }}
    >
      <ShieldCheck size={13} color="#38BDF8" style={{ flexShrink: 0 }} />
      Pagamento protetto
    </span>
  );
}

export function IvaChip({ style }) {
  return (
    <span
      style={{ display: "inline-block", padding: "1px 6px", borderRadius: 5, border: "1px solid #E2E8F0", background: "#F8FAFE", color: "#64748B", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", whiteSpace: "nowrap", verticalAlign: "middle", ...style }}
    >
      IVA esclusa
    </span>
  );
}

// Produttore vs distributore. Va accanto al nome del fornitore, dopo la
// bandiera (CountryFlag): [bandiera] Nome Azienda [badge].
// Tipo null o sconosciuto (lead non ancora classificato) → non si renderizza
// nulla, invece di un badge vuoto o di un'etichetta inventata.
// Qui le emoji si possono usare: sono le sole emoji BANDIERA a non rendersi su
// Windows, ed è per quelle che esiste CountryFlag in SVG.
export const SUPPLIER_TYPES = {
  producer: { icon: "🏭", label: "Produttore", hint: "Produce direttamente la materia prima" },
  distributor: { icon: "🚚", label: "Distributore", hint: "Rivende materie prime di altri produttori" },
};

export function SupplierTypeBadge({ type, withLabel = false, size = 12.5, style }) {
  const t = SUPPLIER_TYPES[type];
  if (!t) return null;
  return (
    <span
      role="img"
      aria-label={t.label}
      title={`${t.label} — ${t.hint}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: size, lineHeight: 1, cursor: "help", ...style }}
    >
      <span aria-hidden="true">{t.icon}</span>
      {withLabel && <span style={{ fontWeight: 600, color: "#64748B" }}>{t.label}</span>}
    </span>
  );
}
