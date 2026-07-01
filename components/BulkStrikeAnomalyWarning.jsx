import { useState, useEffect } from "react";
import { AlertTriangle, ShieldCheck, Scale, X } from "lucide-react";

/**
 * Avviso "prezzo anomalo" per i fornitori.
 *
 * NON impone, suggerisce né blocca alcun prezzo: il fornitore può sempre
 * confermare qualsiasi cifra. "reference" è solo un riferimento di mercato
 * informativo, non un minimo né un prezzo consigliato.
 *
 * Props:
 *  - open        : boolean
 *  - price       : numero (€/kg) offerto
 *  - reference   : numero (€/kg) di riferimento di mercato
 *  - deltaPct    : numero, % sotto il riferimento (da assessPriceAnomaly)
 *  - productName : string
 *  - repeatCount : numero di offerte anomale già registrate (90 gg) — opzionale
 *  - onConfirm() : prosegui con l'offerta (dopo l'autocertificazione)
 *  - onCancel()  : annulla
 */
const C = {
  blue: "#0EA5E9", dark: "#0284C7", text: "#0F172A", muted: "#64748B",
  border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", amber: "#D97706",
};

const fmtEur = (n) =>
  "€" + Number(n ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BulkStrikeAnomalyWarning({
  open, price, reference, deltaPct = 0, productName = "questo prodotto",
  repeatCount = 0, onConfirm, onCancel,
}) {
  const [ack, setAck] = useState(false);

  // azzera la spunta ogni volta che il popup si riapre
  useEffect(() => { if (open) setAck(false); }, [open]);

  if (!open) return null;

  const high = deltaPct >= 30 || repeatCount >= 3;
  const accent = high ? C.red : C.amber;

  const overlay = {
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16, zIndex: 1000, fontFamily: "Inter, system-ui, sans-serif",
  };
  const card = {
    width: "100%", maxWidth: 480, background: "#fff", borderRadius: 16,
    boxShadow: "0 20px 60px rgba(15,23,42,0.25)", overflow: "hidden",
  };
  const box = (bg, bd) => ({
    background: bg, border: `1px solid ${bd}`, borderRadius: 12, padding: "12px 14px",
    fontSize: 13.5, lineHeight: 1.5, color: C.text,
  });

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Avviso prezzo anomalo">
      <div style={card}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: `${accent}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle size={19} color={accent} />
          </div>
          <div style={{ flex: 1, fontSize: 16.5, fontWeight: 800, color: C.text }}>Prezzo anomalo rilevato</div>
          <button onClick={onCancel} aria-label="Chiudi"
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: C.text }}>
            La tua offerta di <b>{fmtEur(price)}/kg</b> è circa <b style={{ color: accent }}>{deltaPct}%</b> sotto
            il prezzo di riferimento di mercato (<b>{fmtEur(reference)}/kg</b>) per <b>{productName}</b>.
          </p>

          {/* avviso legale */}
          <div style={box(`${accent}10`, `${accent}40`)}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, marginBottom: 4, color: accent }}>
              <Scale size={15} /> Concorrenza sì, esclusione no
            </div>
            Praticare prezzi sotto costo allo scopo di danneggiare i concorrenti ed eliminarli dal mercato per
            creare un monopolio è una pratica vietata dalla normativa sulla concorrenza (abuso di posizione
            dominante). Se la condotta è continuativa, BulkStrike potrà segnalarla all'autorità competente (AGCM).
          </div>

          {/* missione BulkStrike */}
          <div style={box(`${C.blue}0D`, `${C.blue}33`)}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700, marginBottom: 4, color: C.dark }}>
              <ShieldCheck size={15} /> Perché esiste BulkStrike
            </div>
            Far acquistare le materie prime al prezzo giusto, tutelando gli acquirenti — ma anche tutelare i
            fornitori e preservare una concorrenza leale. Un prezzo equo e sostenibile è nell'interesse di tutti,
            incluso il tuo.
          </div>

          {/* continuità */}
          {repeatCount > 0 && (
            <div style={{ fontSize: 13, color: high ? C.red : C.muted }}>
              Hai già presentato <b>{repeatCount}</b> offerte segnalate come anomale negli ultimi 90 giorni.
              {high && " Ulteriori offerte continuative di questo tipo potranno essere oggetto di segnalazione."}
            </div>
          )}

          {/* autocertificazione */}
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 13.5, color: C.text }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, accentColor: C.blue, cursor: "pointer" }} />
            <span>Confermo che questa offerta riflette un prezzo equo e sostenibile e non ha finalità di esclusione dei concorrenti.</span>
          </label>
        </div>

        {/* footer */}
        <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11.5, color: C.muted }}>Questo avviso non costituisce consulenza legale.</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onCancel}
              style={{ background: "#fff", color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Annulla
            </button>
            <button onClick={onConfirm} disabled={!ack}
              style={{ background: ack ? C.blue : "#CBD5E1", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: ack ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              Conferma offerta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
