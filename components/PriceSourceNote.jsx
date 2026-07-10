// Nota OBBLIGATORIA sotto ogni grafico di prezzi di mercato (ISMEA / CUN Grano Duro):
// citazione della fonte (dinamica, con link alla pagina ufficiale) + dicitura
// informativa richiesta dalla Camera di Commercio. Sempre visibile, mai nascosta
// in un tooltip. Testo approvato: i prezzi sono informativi e non vincolanti.
const DISCLAIMER =
  "I prezzi hanno carattere esclusivamente informativo, rappresentano l'andamento medio dei prezzi rilevati sul mercato e non sono vincolanti per i rapporti contrattuali.";

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}

export default function PriceSourceNote({ fonte, fonteUrl, lastDate, muted = "#64748B", border = "#E2E8F0" }) {
  if (!fonte) return null;
  // "listino" per la CUN (pubblica un listino), "rilevazione" per ISMEA.
  const dateLabel = fonte === "CUN Grano Duro" ? "listino" : "rilevazione";
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${border}`, fontSize: 11.5, color: muted, lineHeight: 1.5 }}>
      <div style={{ marginBottom: 3 }}>
        🛈 Fonte:{" "}
        {fonteUrl ? (
          <a href={fonteUrl} target="_blank" rel="noopener noreferrer" style={{ color: muted, textDecoration: "underline" }}>{fonte}</a>
        ) : (
          <b style={{ color: muted }}>{fonte}</b>
        )}
        {lastDate ? <> · {dateLabel} {fmtDate(lastDate)}</> : null}
      </div>
      <div style={{ fontStyle: "italic" }}>{DISCLAIMER}</div>
    </div>
  );
}
