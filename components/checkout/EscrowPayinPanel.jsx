"use client";
// ============================================================
// BulkStrike — pannello di conferma del pay-in escrow (Stripe).
// Riceve i pay-in creati da /api/stripe/create-payin (uno per tipo di
// strumento: sepa_debit | card) e li conferma in sequenza on-session con
// PaymentElement. Con SEPA lo stato del PaymentIntent resta 'processing'
// per giorni: è un esito POSITIVO (l'ordine passa a 'paid' solo quando il
// webhook riceve payment_intent.succeeded).
// Test mode: carta 4242 4242 4242 4242 (qualsiasi scadenza futura/CVC),
// IBAN SEPA di test DE89370400440532013000.
// ============================================================
import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { ArrowRight, ShieldCheck } from "lucide-react";

const C = { blue: "#0EA5E9", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626" };

// loadStripe una sola volta per pagina (lazy: la publishable key non è
// richiesta al load della pagina ma solo quando il pannello si monta).
let _stripePromise = null;
function getStripePromise() {
  if (!_stripePromise) _stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  return _stripePromise;
}

const eurCents = (cents) => (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

function PayinForm({ payin, index, count, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function pay() {
    if (!stripe || !elements || busy) return;
    setBusy(true); setMsg("");
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: `${window.location.origin}/ordini` },
    });
    if (error) {
      setMsg(error.message || "Pagamento non riuscito. Riprova.");
      setBusy(false);
      return;
    }
    onPaid(paymentIntent);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>
          {payin.kind === "card" ? "Carta (escrow premium)" : "Addebito SEPA (escrow)"}
          {count > 1 ? ` · pagamento ${index + 1} di ${count}` : ""}
        </span>
        <span className="co-num" style={{ fontSize: 18, fontWeight: 800 }}>{eurCents(payin.amountCents)}</span>
      </div>
      <PaymentElement options={{ layout: "tabs" }} />
      {msg && <div style={{ marginTop: 10, fontSize: 13, color: C.red }}>{msg}</div>}
      <button
        onClick={pay}
        disabled={busy || !stripe || !elements}
        style={{ width: "100%", marginTop: 14, background: C.blue, color: "#fff", border: "none", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "Inter,system-ui" }}
      >
        {busy ? "Pagamento in corso…" : <>Paga {eurCents(payin.amountCents)} in garanzia <ArrowRight size={16} /></>}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 10, fontSize: 12, color: C.muted }}>
        <ShieldCheck size={13} color={C.green} /> Fondi in escrow: il fornitore viene pagato solo dopo la tua conferma di consegna conforme.
      </div>
    </div>
  );
}

export default function EscrowPayinPanel({ payins, onAllPaid }) {
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState([]);
  const current = payins[idx];

  function handlePaid(paymentIntent) {
    const next = [...results, paymentIntent];
    setResults(next);
    if (idx + 1 < payins.length) setIdx(idx + 1);
    else onAllPaid(next);
  }

  if (!current) return null;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, background: "#fff" }}>
      {/* key=idx: al passaggio al pay-in successivo Elements va rimontato col nuovo clientSecret */}
      <Elements
        key={idx}
        stripe={getStripePromise()}
        options={{ clientSecret: current.clientSecret, locale: "it", appearance: { variables: { colorPrimary: C.blue, fontFamily: "Inter, system-ui, sans-serif" } } }}
      >
        <PayinForm payin={current} index={idx} count={payins.length} onPaid={handlePaid} />
      </Elements>
    </div>
  );
}
