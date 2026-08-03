"use client";
// Conferma di ricezione merce via QR (DAV-74) — pagina pubblica, senza login:
// il token nell'URL è la credenziale. Mostra il riepilogo dell'ordine (prodotto,
// quantità attesa, fornitore, DDT) e un form con quantità ricevuta + note.
// Alla conferma: delivered_at=now(), partono le 48 ore per le contestazioni.
import { useState, useEffect } from "react";
import { PackageCheck, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { getOrderReceiptInfo, confirmOrderReceipt } from "@/lib/api";
import BSLogo from "@/components/BSLogo";

const C = { text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", primary: "#0369A1" };

export default function BulkStrikeReceipt({ orderId, token }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [already, setAlready] = useState(false);

  useEffect(() => {
    let alive = true;
    getOrderReceiptInfo(orderId, token)
      .then((d) => {
        if (!alive) return;
        setInfo(d);
        setAlready(!!d.already_delivered);
        setQty(d.quantity_kg != null ? String(d.quantity_kg) : "");
      })
      .catch((e) => {
        if (!alive) return;
        const msg = String(e?.message || e);
        setLoadErr(msg.includes("RATE_LIMITED")
          ? "Troppi tentativi: riprova tra qualche minuto."
          : "Link non valido: il codice di questa pagina non corrisponde a nessun ordine.");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [orderId, token]);

  async function submit() {
    setSending(true); setErr("");
    try {
      const r = await confirmOrderReceipt(orderId, token, qty, notes);
      if (r?.already) setAlready(true);
      else setDone(true);
    } catch (e) {
      const msg = String(e?.message || e);
      setErr(msg.includes("RATE_LIMITED") ? "Troppi tentativi: riprova tra qualche minuto."
        : msg.includes("INVALID_STATE") ? "L'ordine non è in uno stato che permette la conferma di ricezione."
        : "Non è stato possibile registrare la ricezione. Riprova.");
    } finally {
      setSending(false);
    }
  }

  const Row = ({ label, value }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13.5 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ fontWeight: 700, color: C.text, textAlign: "right" }}>{value || "—"}</span>
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, colorScheme: "light", padding: "28px 16px" }}>
      <style>{`* { box-sizing: border-box; }`}</style>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <BSLogo iconSize={34} fontSize={19} uid="ric" />
        </div>

        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, boxShadow: "0 4px 24px rgba(15,23,42,0.06)" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: C.muted, padding: "30px 0", fontSize: 14 }}>Verifica del codice in corso…</div>
          ) : loadErr ? (
            <div style={{ textAlign: "center", padding: "18px 0" }}>
              <AlertTriangle size={34} color={C.red} style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 6 }}>Impossibile aprire la pagina</div>
              <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.6 }}>{loadErr}</div>
            </div>
          ) : done ? (
            <div style={{ textAlign: "center", padding: "18px 0" }}>
              <CheckCircle2 size={38} color={C.green} style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Ricezione registrata</div>
              <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.65 }}>
                Grazie! Abbiamo registrato la consegna dell'ordine <b>{info.order_ref}</b>.
                Hai <b>48 ore</b> per verificare la merce e segnalare eventuali difformità dalla pagina
                dell'ordine; senza segnalazioni, il pagamento al fornitore verrà sbloccato automaticamente.
              </div>
            </div>
          ) : already ? (
            <div style={{ textAlign: "center", padding: "18px 0" }}>
              <PackageCheck size={36} color={C.primary} style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 16.5, fontWeight: 800, marginBottom: 8 }}>Ricezione già registrata</div>
              <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.65 }}>
                La consegna dell'ordine <b>{info.order_ref}</b> risulta già confermata: non serve fare altro.
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.primary, marginBottom: 4 }}>Conferma ricezione</div>
              <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 14 }}>Ordine {info.order_ref}</div>

              <div style={{ marginBottom: 18 }}>
                <Row label="Prodotto" value={info.product_name} />
                <Row label="Quantità attesa" value={info.quantity_kg != null ? `${Number(info.quantity_kg).toLocaleString("it-IT")} kg` : null} />
                <Row label="Fornitore" value={info.supplier_name} />
                <Row label="DDT" value={info.ddt_number ? `${info.ddt_number}${info.ddt_date ? " del " + new Date(info.ddt_date).toLocaleDateString("it-IT") : ""}` : null} />
                <Row label="Lotto" value={info.lot_number} />
                {info.carrier && <Row label="Corriere" value={`${info.carrier}${info.tracking_number ? " · " + info.tracking_number : ""}`} />}
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, fontWeight: 700, color: C.muted, marginBottom: 12 }}>
                Quantità ricevuta (kg)
                <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} min="0" inputMode="decimal"
                       style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: "11px 12px", fontSize: 15, fontWeight: 400, color: C.text, outline: "none", fontFamily: "inherit" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, fontWeight: 700, color: C.muted, marginBottom: 16 }}>
                Note (facoltative)
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                          placeholder="Es. collo danneggiato, quantità diversa dall'atteso…"
                          style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: "11px 12px", fontSize: 14, fontWeight: 400, color: C.text, outline: "none", fontFamily: "inherit", resize: "vertical" }} />
              </label>

              {err && <div style={{ fontSize: 13, color: C.red, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9, padding: "9px 12px", marginBottom: 12 }}>{err}</div>}

              <button onClick={submit} disabled={sending}
                      style={{ width: "100%", background: C.primary, color: "#fff", border: "none", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 700, cursor: sending ? "default" : "pointer", opacity: sending ? 0.6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
                {sending ? "Registrazione…" : <>Conferma ricezione <PackageCheck size={17} /></>}
              </button>

              <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 1.55 }}>
                <Clock size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Con la conferma parte la finestra di <b>48 ore</b> per la verifica di conformità: senza contestazioni, il pagamento al fornitore viene sbloccato automaticamente.</span>
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign: "center", fontSize: 12, color: C.muted, marginTop: 16 }}>
          BulkStrike — Il mercato B2B delle materie prime sfuse
        </div>
      </div>
    </div>
  );
}
