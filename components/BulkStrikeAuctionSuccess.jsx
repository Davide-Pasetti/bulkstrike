import { X } from "lucide-react";

/**
 * Pop-up 2 — conferma di avvenuta partecipazione. Appare SOLO dopo che l'azione
 * (adesione o apertura) è andata a buon fine. Tono professionale, niente emoji né
 * effetti festosi: una spunta semplice (che si disegna) nella palette del sito.
 *
 * Props:
 *  - open           : boolean
 *  - mode           : "join" (adesione) | "open" (apertura nuova asta)
 *  - groupBuy       : boolean — acquisto di gruppo invece di asta
 *  - productName    : string
 *  - quantityKg     : number
 *  - onGoToPersonal(): va alla sezione «Aste personali» del profilo
 *  - onClose()      : chiude il pop-up restando dove si è
 */
const C = { blue: "#0EA5E9", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", purple: "#7C3AED" };

const kg = (n) => Number(n ?? 0).toLocaleString("it-IT");

export default function BulkStrikeAuctionSuccess({
  open, mode = "join", groupBuy = false, productName = "questo prodotto",
  quantityKg = 0, onGoToPersonal, onClose,
}) {
  if (!open) return null;

  const accent = groupBuy ? C.blue : C.purple;
  const kindNoun = groupBuy ? "acquisto di gruppo" : "asta";

  const overlay = {
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16, zIndex: 1001, fontFamily: "Inter, system-ui, sans-serif",
  };
  const card = {
    width: "100%", maxWidth: 440, background: "#fff", borderRadius: 16,
    boxShadow: "0 20px 60px rgba(15,23,42,0.25)", overflow: "hidden",
  };

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Partecipazione confermata">
      <div style={card}>
        <style>{`@keyframes bsas-draw { to { stroke-dashoffset: 0 } }`}</style>

        {/* header: solo la X per chiudere restando dove si è */}
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 12px 0" }}>
          <button onClick={onClose} aria-label="Chiudi"
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* body centrato: spunta + messaggio */}
        <div style={{ padding: "4px 22px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${accent}14`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M20 6 L9 17 L4 12" stroke={accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                style={{ strokeDasharray: 28, strokeDashoffset: 28, animation: "bsas-draw .45s ease .1s forwards" }} />
            </svg>
          </div>

          <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.5, color: C.text }}>
            {mode === "open"
              ? (groupBuy ? "Il tuo acquisto di gruppo per " : "La tua asta per ")
              : (groupBuy ? "Hai aderito con successo all'acquisto di gruppo per " : "Hai aderito con successo all'asta per ")}
            <b>{productName}</b> con <b className="bs-num">{kg(quantityKg)} kg</b>
            {mode === "open" ? (groupBuy ? " è stato avviato con successo." : " è stata aperta con successo.") : "."}
          </p>

          <div style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", fontSize: 13, lineHeight: 1.5, color: C.muted }}>
            Potrai seguire l'andamento dell'{kindNoun} nella sezione <b style={{ color: C.text }}>«Aste personali»</b> del tuo profilo.
          </div>
        </div>

        {/* footer: azione principale + chiudi */}
        <div style={{ padding: "0 22px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={onGoToPersonal}
            style={{ width: "100%", background: accent, color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Vai alle aste personali
          </button>
          <button onClick={onClose}
            style={{ width: "100%", background: "#fff", color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
