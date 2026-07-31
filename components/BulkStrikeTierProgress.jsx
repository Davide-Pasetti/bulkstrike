"use client";
// Barra di avanzamento verso il PROSSIMO scaglione di volume (prezzo tetto).
// UNICA implementazione condivisa: usata sia nel box in evidenza della pagina
// asta (BulkStrikePool, con addedKg = quantità che l'utente sta aggiungendo,
// tratteggio blu) sia nel mini-widget del box asta della pagina prodotto
// (BulkStrikeProduct, compact, addedKg = 0). Stesso calcolo (lib/tiers), niente
// valori statici: tutto derivato dal volume reale del pool.
import { TIERS, tierIndexFor, tierFor } from "@/lib/tiers";

const C = { blue: "#0EA5E9", text: "#0F172A", muted: "#64748B", purple: "#7C3AED" };
const kg = (n) => Number(n || 0).toLocaleString("it-IT");
const eurKg = (n) => "€" + Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Props:
 *  - currentKg : volume aggregato attuale del pool (total_volume_kg)
 *  - addedKg   : quantità in aggiunta dell'utente (tratteggio blu), default 0
 *  - compact   : layout ridotto per box stretti — barra + "raggiunto / soglia",
 *                senza la riga "Mancano … kg" sotto (che resta nella pagina asta)
 *
 * Restituisce null quando si è già all'ultimo scaglione (nessun tetto più basso
 * da raggiungere): in quel caso il chiamante mostra il proprio messaggio.
 */
export default function BulkStrikeTierProgress({ currentKg = 0, addedKg = 0, compact = false }) {
  const projected = currentKg + addedKg;
  // Barra ancorata alla fascia che si sta chiudendo: dal bordo attuale si sale
  // solo se `projected` supera (strettamente) il confine, così una fascia appena
  // completata si legge PIENA invece di resettarsi sulla successiva.
  let barIdx = tierIndexFor(currentKg);
  while (TIERS[barIdx].max !== Infinity && projected > TIERS[barIdx].max) barIdx++;
  const barTarget = TIERS[barIdx].max === Infinity ? null : TIERS[barIdx].max;
  if (!barTarget) return null; // ultimo scaglione: nessun tetto più basso

  const toNext = Math.max(0, barTarget - projected);
  const nextPrice = tierFor(barTarget).price;
  const crossesTier = tierFor(projected).max !== tierFor(currentKg).max;
  const reachedPct = Math.min(currentKg, barTarget) / barTarget * 100;
  const addedPct = Math.max(0, Math.min((projected - currentKg) / barTarget * 100, 100 - reachedPct));

  return (
    <div>
      <style>{`@keyframes bstp-fill { from { width:0 } }`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4, fontSize: compact ? 11 : 12, marginBottom: 6 }}>
        <span style={{ color: C.muted }}>Prossimo scaglione: <b style={{ color: C.text }}>{kg(barTarget)} kg → tetto {eurKg(nextPrice)}/kg</b></span>
        <span className="bs-num" style={{ color: C.purple, fontWeight: 700 }}>{kg(Math.min(projected, barTarget))} / {kg(barTarget)}</span>
      </div>
      <div style={{ height: compact ? 12 : 16, background: "#EDE4F7", borderRadius: 100, overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${reachedPct}%`, height: "100%", background: `linear-gradient(90deg,${C.purple},#A855F7)`, animation: "bstp-fill 1s ease" }} />
        {addedKg > 0 && (
          <div style={{ width: `${addedPct}%`, height: "100%", background: `repeating-linear-gradient(45deg,${C.blue},${C.blue} 6px,#38BDF8 6px,#38BDF8 12px)` }} />
        )}
      </div>
      {!compact && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
          {toNext > 0 ? (
            <>Mancano <b className="bs-num" style={{ color: C.purple }}>{kg(toNext)} kg</b> per abbassare il tetto a {eurKg(nextPrice)}/kg.
              {crossesTier && <span style={{ color: C.blue, fontWeight: 600 }}> Con la tua quantità sblocchi un tetto più basso! 🎉</span>}</>
          ) : (
            <span style={{ color: C.blue, fontWeight: 600 }}>🎉 Scaglione completato: tetto abbassato a {eurKg(nextPrice)}/kg.</span>
          )}
        </div>
      )}
    </div>
  );
}
