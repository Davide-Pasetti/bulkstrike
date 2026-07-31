import { useState, useEffect } from "react";
import { Gavel, ShoppingCart, X } from "lucide-react";

/**
 * Conferma VINCOLANTE prima di aderire/aprire un'asta a ribasso (o un acquisto
 * di gruppo). Ultimo passaggio esplicito: crea/aderisce davvero solo dopo che
 * l'utente ha spuntato l'accettazione dei termini e condizioni.
 *
 * Stesso pattern modale di BulkStrikeAnomalyWarning (overlay + card + footer con
 * Annulla e conferma disabilitata finché la checkbox non è spuntata).
 *
 * Props:
 *  - open        : boolean
 *  - mode        : "join" (adesione a un'asta esistente) | "open" (apertura nuova)
 *  - groupBuy    : boolean — acquisto di gruppo (1 solo fornitore) invece di asta
 *  - productName : string — nome del prodotto
 *  - quantityKg  : number — quantità in kg che l'utente sta impegnando
 *  - busy        : boolean — azione in corso (disabilita il pulsante)
 *  - onConfirm() : esegue l'azione reale (adesione / creazione del pool)
 *  - onCancel()  : chiude senza fare nulla
 */
const C = { blue: "#0EA5E9", dark: "#0284C7", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", purple: "#7C3AED" };

const kg = (n) => Number(n ?? 0).toLocaleString("it-IT");

export default function BulkStrikeAuctionConfirm({
  open, mode = "join", groupBuy = false, productName = "questo prodotto",
  quantityKg = 0, busy = false, onConfirm, onCancel,
}) {
  const [ack, setAck] = useState(false);

  // azzera la spunta ogni volta che il popup si riapre
  useEffect(() => { if (open) setAck(false); }, [open]);

  if (!open) return null;

  const accent = groupBuy ? C.blue : C.purple;
  const kind = groupBuy ? "acquisto di gruppo" : "asta";
  // Frase principale: verbo diverso per apertura vs adesione, asta vs gruppo.
  const verb = mode === "open"
    ? (groupBuy ? "avviare un acquisto di gruppo" : "aprire un'asta")
    : (groupBuy ? "aderire all'acquisto di gruppo" : "aderire all'asta");
  const cta = mode === "open"
    ? (groupBuy ? "Avvia l'acquisto di gruppo" : "Apri l'asta")
    : (groupBuy ? "Aderisci all'acquisto di gruppo" : "Aderisci all'asta");

  const overlay = {
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16, zIndex: 1000, fontFamily: "Inter, system-ui, sans-serif",
  };
  const card = {
    width: "100%", maxWidth: 460, background: "#fff", borderRadius: 16,
    boxShadow: "0 20px 60px rgba(15,23,42,0.25)", overflow: "hidden",
  };

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Conferma vincolante">
      <div style={card}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {groupBuy ? <ShoppingCart size={18} color="#fff" /> : <Gavel size={18} color="#fff" />}
          </div>
          <div style={{ flex: 1, fontSize: 16.5, fontWeight: 800, color: C.text }}>Conferma vincolante</div>
          <button onClick={onCancel} aria-label="Chiudi"
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: C.text }}>
            Stai per {verb} per <b>{productName}</b> con <b className="bs-num">{kg(quantityKg)} kg</b>. La scelta è <b style={{ color: accent }}>vincolante</b>.
          </p>

          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", fontSize: 13, lineHeight: 1.5, color: C.muted }}>
            Potrai seguire l'andamento dell'{kind} nella sezione <b style={{ color: C.text }}>«Aste personali»</b> del tuo profilo.
          </div>

          {/* accettazione T&C obbligatoria: "termini e condizioni" è un link */}
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 13.5, color: C.text }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, accentColor: accent, cursor: "pointer", flexShrink: 0 }} />
            <span>
              Accetto i{" "}
              <a href="/legale#termini" target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: C.blue, fontWeight: 700, textDecoration: "none" }}>
                termini e condizioni
              </a>
            </span>
          </label>
        </div>

        {/* footer */}
        <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onCancel} disabled={busy}
            style={{ background: "#fff", color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>
            Annulla
          </button>
          <button onClick={onConfirm} disabled={!ack || busy}
            style={{ background: (ack && !busy) ? accent : "#CBD5E1", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: (ack && !busy) ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            {busy ? "Attendere…" : cta}
          </button>
        </div>
      </div>
    </div>
  );
}
