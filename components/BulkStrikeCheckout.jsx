"use client";
// BulkStrikeCheckout — checkout ONE-PAGE (/checkout; il Carrello resta una pagina
// a sé, prima del checkout). Tutto su una sola schermata, con il totale sempre
// visibile nella colonna di destra (sticky) e un unico "Conferma e paga":
//   • Indirizzo (fatturazione + consegna da rubrica salvata, o aggiunto al volo, + note)
//   • Spedizione (righe carrello con stima consegna + preventivi corriere per fornitore)
//   • Metodo di pagamento (selettore per fornitore; soglia €10.000 per sub-ordine)
//   • Riepilogo economico REALE (preview_checkout: spedizione + IVA 22% server-side)
//     + eventuali costi di elaborazione escrow, nella colonna sticky.
// La conferma chiama UNA sola RPC place_order, che crea gli ordini già nello stato
// finale corretto (niente 'paid' ottimistico poi degradato); per i sub-ordini in
// escrow crea poi il pay-in Stripe consolidato.
import { useState, useEffect, useMemo } from "react";
import { ArrowRight, Check, ChevronRight, Package, FileText, AlertTriangle, MapPin, Mail, CreditCard, Truck, Clock3, PauseCircle, Plus, X, Receipt } from "lucide-react";
import { getCart, placeOrder, previewCheckout, getMyCompany, getMyCompanyAddress, getShippingAddresses, addShippingAddress, getSession, poolErrorMessage, getShippingQuotes } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import PaymentMethodSelector from "@/components/checkout/PaymentMethodSelector";
import EscrowPayinPanel from "@/components/checkout/EscrowPayinPanel";
import { countryToIso } from "@/components/CountryFlag";
import { stripeProcessingFee } from "@/lib/payments/paymentConfig";
import { TrustBadge, IvaChip } from "@/components/BulkStrikeBadges";

const C = { blue: "#0EA5E9", dark: "#0284C7", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", amber: "#D97706" };
const eur = (n) => n == null ? "—" : "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Intestazione di sezione riutilizzata dai blocchi della pagina.
function SectionTitle({ icon: Icon, children }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: C.muted, marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
      <Icon size={15} /> {children}
    </div>
  );
}
const cardStyle = { border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 18 };

export default function CheckoutPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const [buyerEmail, setBuyerEmail] = useState("");

  // Pagamento per fornitore: id azienda acquirente (per la soglia escrow lato RPC),
  // metodo scelto per ciascun fornitore, e la struttura del pay-in escrow consolidato.
  const [buyerCompanyId, setBuyerCompanyId] = useState(null);
  const [methodBySupplier, setMethodBySupplier] = useState({});
  const [consolidatedEscrow, setConsolidatedEscrow] = useState(null);
  // Pay-in Stripe da confermare (da /api/stripe/create-payin) e risultato di
  // place_order tenuto da parte finché il pagamento non è confermato.
  const [payins, setPayins] = useState(null);
  const [pendingDone, setPendingDone] = useState(null);

  // Rubrica indirizzi di spedizione salvati dal cliente + la sede legale (sempre
  // disponibile, non richiede salvataggio) + form per aggiungerne uno nuovo.
  const [addresses, setAddresses] = useState([]);
  const [companyAddress, setCompanyAddress] = useState(null); // testo sede legale, o null se non impostata
  const [companyAddrObj, setCompanyAddrObj] = useState(null); // sede legale strutturata (per precompilare la fatturazione Stripe)
  const [companyName, setCompanyName] = useState(null); // ragione sociale azienda loggata (per la riga Fatturazione)
  const [selectedAddressId, setSelectedAddressId] = useState(""); // "__legal__" | id salvato
  const [billingAddressId, setBillingAddressId] = useState(""); // "__legal__" | id salvato — indipendente dalla consegna
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAddrText, setNewAddrText] = useState("");
  const [newAddrLabel, setNewAddrLabel] = useState("");
  const [savingAddress, setSavingAddress] = useState(false);

  // Riepilogo reale (spedizione + IVA) — calcolato server-side una volta noto l'indirizzo.
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState("");

  // Preventivi corriere per fornitore: { [supplierId]: { quotes:[...], cheapest_id, fastest_id } | "loading" | "none" }
  const [quotesBySupplier, setQuotesBySupplier] = useState({});
  const [selectedCarrier, setSelectedCarrier] = useState({}); // { [supplierId]: carrierId }

  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      setBuyerEmail(session.user?.email || "");
      try {
        const [cart, savedAddrs, companyAddr, company] = await Promise.all([
          getCart(),
          getShippingAddresses().catch(() => []),
          getMyCompanyAddress().catch(() => null),
          getMyCompany().catch(() => null),
        ]);
        setItems(cart);
        setAddresses(savedAddrs || []);
        setCompanyName(company?.legal_name || null);
        setBuyerCompanyId(company?.id || null);
        const legalText = companyAddr ? [companyAddr.address, companyAddr.city, companyAddr.country].filter(Boolean).join(", ") : null;
        setCompanyAddress(legalText);
        setCompanyAddrObj(companyAddr || null);

        const def = (savedAddrs || []).find(a => a.is_default);
        // Fatturazione: di default la sede legale (corretto per l'emissione fattura),
        // altrimenti il primo indirizzo salvato. Selezione indipendente dalla consegna.
        setBillingAddressId(legalText ? "__legal__" : (savedAddrs?.[0]?.id || ""));
        if (def) {
          setSelectedAddressId(def.id);
          setAddress(def.address);
        } else if (legalText) {
          // Di default proponiamo la sede legale: è sempre nota, non richiede
          // di essere salvata come "indirizzo di spedizione" per essere usata.
          setSelectedAddressId("__legal__");
          setAddress(legalText);
        } else if (savedAddrs && savedAddrs.length > 0) {
          setSelectedAddressId(savedAddrs[0].id);
          setAddress(savedAddrs[0].address);
        } else {
          // Nessuna sede legale nota e nessun indirizzo salvato: unico caso in
          // cui apriamo subito il form per aggiungerne uno.
          setShowAddForm(true);
        }
      } catch (e) { setErr(poolErrorMessage(e)); }
      setLoading(false);
    })();
  }, []);

  function selectAddress(id) {
    if (id === "__new__") { setShowAddForm(true); return; }
    setShowAddForm(false);
    setSelectedAddressId(id);
    if (id === "__legal__") { setAddress(companyAddress || ""); return; }
    const found = addresses.find(a => a.id === id);
    if (found) setAddress(found.address);
  }

  async function saveNewAddress() {
    setErr("");
    if (!newAddrText.trim()) { setErr("Inserisci l'indirizzo da salvare."); return; }
    setSavingAddress(true);
    try {
      const row = await addShippingAddress(newAddrText.trim(), newAddrLabel.trim() || null);
      setAddresses(prev => [...prev, row]);
      setSelectedAddressId(row.id);
      setAddress(row.address);
      setShowAddForm(false);
      setNewAddrText(""); setNewAddrLabel("");
    } catch (e) { setErr(poolErrorMessage(e)); }
    finally { setSavingAddress(false); }
  }

  // fornitori distinti nel carrello, con kg totali — un preventivo di spedizione è per fornitore, non per prodotto
  const suppliers = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      const cur = m.get(it.supplier_company_id) || { id: it.supplier_company_id, name: it.supplier_name, country: it.supplier_country, qty: 0 };
      cur.qty += Number(it.quantity_kg);
      m.set(it.supplier_company_id, cur);
    }
    return [...m.values()];
  }, [items]);

  // Preventivi corriere per ogni fornitore: calcolati appena il carrello è noto.
  // get_shipping_quotes non dipende dall'indirizzo (solo fornitore + kg).
  useEffect(() => {
    if (suppliers.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(suppliers.map(async (s) => {
        try {
          const res = await getShippingQuotes(s.id, s.qty);
          return [s.id, (res?.quotes?.length ? res : "none")];
        } catch (e) { return [s.id, "none"]; }
      }));
      if (cancelled) return;
      const map = Object.fromEntries(entries);
      setQuotesBySupplier(map);
      // default: il corriere più economico per ciascun fornitore, il cliente può cambiarlo
      setSelectedCarrier(prev => {
        const next = { ...prev };
        for (const [supplierId, q] of entries) {
          if (q !== "none" && !next[supplierId]) next[supplierId] = q.cheapest_id;
        }
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [suppliers]);

  // Stima consegna per una riga del carrello: giorni di preparazione del fornitore +
  // giorni di trasporto del corriere selezionato = data di arrivo stimata da oggi.
  function estimateDelivery(it) {
    const prepDays = it.lead_time_days != null ? Number(it.lead_time_days) : 0;
    const q = quotesBySupplier[it.supplier_company_id];
    if (q === undefined) return { prepDays, label: "calcolo corriere…", dateLabel: null };
    if (q === "none") return { prepDays, label: "nessun corriere sulla tratta", dateLabel: null };
    const chosenId = selectedCarrier[it.supplier_company_id] || q.cheapest_id;
    const chosen = (q.quotes || []).find(c => c.carrier_id === chosenId) || q.quotes[0];
    const carrierDays = chosen?.lead_time_days != null ? Number(chosen.lead_time_days) : null;
    if (carrierDays == null) return { prepDays, label: "tempi corriere variabili", dateLabel: null };
    const d = new Date();
    d.setDate(d.getDate() + prepDays + carrierDays);
    const dateLabel = d.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
    return { prepDays, carrierDays, label: `+${carrierDays} gg trasporto`, dateLabel };
  }

  // Riepilogo economico: dipende dalle selezioni corriere, si ricalcola quando
  // cambiano (e appena il carrello è noto). Niente più gate per step.
  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    setPreview(null); setPreviewErr(""); setPreviewLoading(true);
    previewCheckout(address, selectedCarrier)
      .then((res) => { if (!cancelled) setPreview(res); })
      .catch((e) => { if (!cancelled) setPreviewErr(poolErrorMessage(e)); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [items.length, address, selectedCarrier]);

  const subtotal = useMemo(() => items.reduce((a, it) => a + (it.unit_price != null ? Number(it.unit_price) * Number(it.quantity_kg) : 0), 0), [items]);
  const hasIssues = useMemo(() => items.some(it => !it.offer_active || it.unit_price == null || (it.min_order_kg != null && Number(it.quantity_kg) < Number(it.min_order_kg))), [items]);
  const billingAddressText = billingAddressId === "__legal__" ? (companyAddress || "") : (addresses.find(a => a.id === billingAddressId)?.address || companyAddress || "");

  // Precompilazione dei dati di fatturazione per il PaymentElement (Stripe) dalla
  // sede legale già nota. Il paese va convertito in ISO alpha-2 (Stripe lo richiede).
  const billingPrefill = useMemo(() => {
    const bd = {};
    if (companyName) bd.name = companyName;
    if (buyerEmail) bd.email = buyerEmail;
    const addr = {};
    if (companyAddrObj?.address) addr.line1 = companyAddrObj.address;
    if (companyAddrObj?.city) addr.city = companyAddrObj.city;
    if (companyAddrObj?.postal_code) addr.postal_code = companyAddrObj.postal_code;
    const iso = countryToIso(companyAddrObj?.country);
    if (iso) addr.country = iso;
    if (Object.keys(addr).length) bd.address = addr;
    return Object.keys(bd).length ? bd : null;
  }, [companyName, buyerEmail, companyAddrObj]);

  // pronti a pagare solo quando: i preventivi sono tutti arrivati, e ogni fornitore CHE HA
  // corrieri disponibili ha una selezione fatta (i fornitori senza corrieri vanno in attesa da soli).
  const quotesReady = suppliers.length > 0 && suppliers.every(s => quotesBySupplier[s.id] !== undefined);
  const selectionsComplete = suppliers.every(s => {
    const q = quotesBySupplier[s.id];
    return q === "none" || !q || !!selectedCarrier[s.id];
  });
  // Righe senza prezzo unitario valido (0/NaN/negativi inclusi): bloccano il pagamento.
  const unpricedLines = items.filter(it => {
    const p = Number(it.unit_price);
    return !Number.isFinite(p) || p <= 0;
  });
  const hasUnpricedLines = unpricedLines.length > 0;

  const goodsForDisplay = preview?.goods_subtotal ?? subtotal;
  const shippingForDisplay = preview?.shipping_amount ?? null;
  const vatForDisplay = preview?.vat_amount ?? null;
  const totalForDisplay = preview?.total ?? null;
  const payReady = quotesReady && selectionsComplete && !previewLoading && !previewErr && preview != null && !hasUnpricedLines;

  // Costo di ELABORAZIONE PAGAMENTO (tariffa Stripe) per i sub-ordini in escrow:
  // SEPA 0,8%, Carta 1,5% + €0,25, sul totale IVA inclusa (×1,22) — stessi tassi
  // dei trigger DB apply_escrow_service_fee. Dipende dal solo metodo scelto.
  const escrowSepaSuppliers = (preview?.by_supplier || []).filter(
    (s) => methodBySupplier[s.supplier_company_id] === "escrow_sepa"
  );
  const escrowFeeTotal = escrowSepaSuppliers.reduce(
    (a, s) => { const t = subOrderTotal(s); return t == null ? a : a + stripeProcessingFee("sepa", t * 1.22); }, 0
  );
  const premiumFeeSuppliers = (preview?.by_supplier || []).filter(
    (s) => methodBySupplier[s.supplier_company_id] === "escrow_premium"
  );
  const premiumFeeTotal = premiumFeeSuppliers.reduce(
    (a, s) => { const t = subOrderTotal(s); return t == null ? a : a + stripeProcessingFee("card", t * 1.22); }, 0
  );
  const grandTotalForDisplay = totalForDisplay != null ? totalForDisplay + escrowFeeTotal + premiumFeeTotal : null;

  // Messaggio leggibile: dice QUALE riga è senza prezzo.
  function unpricedMessage(lines) {
    const nomi = lines.map(l => l.product_name || "prodotto").join(", ");
    return lines.length === 1
      ? `Prezzo non disponibile per ${nomi} — impossibile procedere. Rimuovilo dal carrello o chiedi un preventivo al fornitore.`
      : `Prezzo non disponibile per: ${nomi} — impossibile procedere. Rimuovi queste righe dal carrello o chiedi un preventivo ai fornitori.`;
  }

  // Merce (IVA esclusa) di un fornitore: null se anche una sola riga non ha prezzo valido.
  function supplierGoods(supplierId) {
    const lines = items.filter(it => it.supplier_company_id === supplierId);
    let sum = 0;
    for (const it of lines) {
      const price = Number(it.unit_price);
      const qty = Number(it.quantity_kg);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0) return null;
      sum += price * qty;
    }
    return sum;
  }
  // Imponibile del sub-ordine (soglia escrow): merce IVA esclusa + spedizione.
  function subOrderTotal(s) {
    const goods = supplierGoods(s.supplier_company_id);
    if (goods == null) return null;
    return goods + Number(s.shipping_amount || 0);
  }

  const allMethodsChosen = (preview?.by_supplier || []).length > 0
    && preview.by_supplier.every(s => methodBySupplier[s.supplier_company_id]);

  // Conferma: UNA sola chiamata place_order (indirizzo + corrieri + metodi) → ordini
  // già nello stato finale corretto. Per l'escrow crea poi il pay-in Stripe.
  async function confirmPayment() {
    if (hasUnpricedLines) { setErr(unpricedMessage(unpricedLines)); return; }
    if (!address.trim()) { setErr("Seleziona o aggiungi l'indirizzo di spedizione."); return; }
    if (!allMethodsChosen) { setErr("Scegli un metodo di pagamento per ogni fornitore."); return; }
    setSubmitting(true); setErr("");
    try {
      // terms_days è risolto server-side dalla whitelist: NON lo inviamo dal client.
      const methods = Object.fromEntries((preview?.by_supplier || []).map(s => [s.supplier_company_id, { method: methodBySupplier[s.supplier_company_id] }]));
      const res = await placeOrder(address, notes, selectedCarrier, methods);

      // Consolidamento escrow: raggruppa i sub-ordini in garanzia in un unico
      // addebito e crea il pay-in Stripe reale. res.payins contiene ESATTAMENTE
      // gli ordini escrow appena creati (niente backlog storico).
      if ((res?.payins || []).length > 0) {
        const escrowSuppliers = (preview?.by_supplier || []).filter(s => ["escrow_sepa", "escrow_premium"].includes(methodBySupplier[s.supplier_company_id]));
        setConsolidatedEscrow({
          supplierIds: escrowSuppliers.map(s => s.supplier_company_id),
          count: escrowSuppliers.length,
          total: escrowSuppliers.reduce((a, s) => { const t = subOrderTotal(s); return t == null ? a : a + t * 1.22; }, 0),
        });
        const r = await fetch("/api/stripe/create-payin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderIds: res.payins }) });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.payins?.length) {
          throw new Error(data.error || "Creazione del pagamento non riuscita. Riprova dalla pagina I miei ordini.");
        }
        setPendingDone(res);
        setPayins(data.payins); // il done arriva dopo la conferma del pagamento
        return;
      }

      setDone(res);
    } catch (e) {
      setErr(poolErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ background: "#fff", color: C.text, fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh", colorScheme: "light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .co-num { font-family:'JetBrains Mono',monospace; }
        .co-row { display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr; gap:12px; padding:13px 16px; border-bottom:1px solid ${C.border}; font-size:13.5px; align-items:center; }
        .co-table { overflow:hidden; }
        .co-input { width:100%; padding:11px 13px; border:1.5px solid ${C.border}; border-radius:9px; font-size:14px; outline:none; font-family:'Inter',system-ui; background:#fff; }
        .co-input:focus { border-color:${C.blue}; }
        .co-layout { display:grid; grid-template-columns:1fr 360px; gap:24px; align-items:start; }
        .co-summary { position:sticky; top:80px; }
        @media (max-width:860px) {
          .co-table { overflow-x:auto; -webkit-overflow-scrolling:touch; } .co-row { min-width:680px; }
          .co-layout { grid-template-columns:1fr; }
          .co-summary { position:static; }
        }
      `}</style>

      <BulkStrikeNav />

      <div style={{ maxWidth: done || payins ? 900 : 1120, margin: "0 auto", padding: "22px 20px 60px" }}>
        {!done && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginBottom: 18 }}>
            <span onClick={() => { window.location.href = "/"; }} style={{ cursor: "pointer" }}>Home</span><ChevronRight size={13} />
            <span onClick={() => { window.location.href = "/carrello"; }} style={{ cursor: "pointer" }}>Carrello</span><ChevronRight size={13} />
            <span style={{ color: C.text, fontWeight: 600 }}>Checkout</span>
          </div>
        )}

        {done ? (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Check size={30} color={C.green} />
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>{(done.orders || []).length > 0 ? "Ordine confermato" : "Ordine registrato"}</h1>
            <p style={{ fontSize: 14.5, color: C.muted, maxWidth: 520, margin: "0 auto 6px", lineHeight: 1.6 }}>
              {(done.orders || []).length > 0
                ? <>{done.count === 1 ? "Il tuo ordine è" : `I tuoi ${done.count} ordini sono`} stati registrati e {done.count === 1 ? "il fornitore è stato" : "i fornitori sono stati"} avvisat{done.count === 1 ? "o" : "i"}.</>
                : "Il tuo ordine è registrato, in attesa del costo di spedizione."}
            </p>
            {done.total != null && done.total > 0 && (
              <p style={{ fontSize: 13.5, color: C.muted, marginBottom: 6 }}>Totale ordine (IVA e spedizione incluse): <b style={{ color: C.text }}>{eur(done.total + escrowFeeTotal + premiumFeeTotal)}</b>{(escrowFeeTotal + premiumFeeTotal) > 0 && <span style={{ fontSize: 12, color: C.muted }}> (inclusi {eur(escrowFeeTotal + premiumFeeTotal)} di costi di elaborazione pagamento)</span>}</p>
            )}
            <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, color: C.muted, marginBottom: 26 }}>
              <Mail size={14} /> Conferma inviata a <b style={{ color: C.text }}>{buyerEmail}</b>
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 460, margin: "0 auto 26px" }}>
              {(done.orders || []).map((id, i) => (
                <div key={id} onClick={() => { window.location.href = `/ordine?id=${id}`; }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600 }}><FileText size={15} color={C.blue} /> Ordine #{i + 1} <span className="co-num" style={{ fontSize: 11, color: C.muted }}>{id.slice(0, 8)}…</span></span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: C.blue }}>Segui spedizione <ArrowRight size={13} /></span>
                </div>
              ))}
              {(done.held_orders || []).map((id, i) => (
                <div key={id} onClick={() => { window.location.href = `/ordine?id=${id}`; }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid #FED7AA", background: "#FFF7ED", borderRadius: 10, padding: "12px 16px", cursor: "pointer" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, color: "#9A3412" }}><PauseCircle size={15} /> Ordine in attesa di corriere <span className="co-num" style={{ fontSize: 11, color: "#9A3412" }}>{id.slice(0, 8)}…</span></span>
                  <span style={{ fontSize: 12, color: "#9A3412" }}>Dettagli</span>
                </div>
              ))}
            </div>

            {(done.held_orders || []).length > 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#9A3412", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 10, padding: "12px 16px", maxWidth: 520, margin: "0 auto 20px", textAlign: "left", lineHeight: 1.6 }}>
                <PauseCircle size={15} color={C.amber} style={{ marginTop: 1, flexShrink: 0 }} />
                <span>Per {(done.held_orders || []).length === 1 ? "un ordine" : `${(done.held_orders || []).length} ordini`} non abbiamo ancora un corriere attivo sulla tratta scelta. Restano in attesa: il nostro team logistico ti farà avere il costo di spedizione a breve, e completerai il pagamento solo a quel punto.</span>
              </div>
            )}

            {/* GUIDA PER METODO DI PAGAMENTO scelto per fornitore */}
            {(() => {
              const by = preview?.by_supplier || [];
              const pick = (methods) => by.filter(s => methods.includes(methodBySupplier[s.supplier_company_id]));
              const bonifico = pick(["bonifico_anticipato"]);
              const termini = pick(["termini_dilazionati"]);
              const boxBase = { fontSize: 12.5, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", maxWidth: 520, margin: "0 auto 14px", textAlign: "left", lineHeight: 1.6 };
              return (
                <>
                  {bonifico.length > 0 && (
                    <div style={{ ...boxBase, background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Bonifico bancario anticipato — {bonifico.map(s => s.supplier_name).join(", ")}</div>
                      Paga tramite bonifico bancario: i dati (IBAN del fornitore) sono nella pagina dell'ordine, sezione Pagamento.{" "}
                      <span onClick={() => { window.location.href = "/ordini"; }} style={{ fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>Vai ai miei ordini</span>
                    </div>
                  )}
                  {termini.length > 0 && (
                    <div style={{ ...boxBase, background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1E40AF" }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Pagamento dilazionato — {termini.map(s => s.supplier_name).join(", ")}</div>
                      Ordine confermato con pagamento dilazionato — nessun pagamento ora.
                    </div>
                  )}
                  {consolidatedEscrow && (
                    <div style={{ ...boxBase, background: "#F0FDF4", border: "1px solid #A7F3D0", color: "#065F46" }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Pagamento in garanzia consolidato (1 solo addebito)</div>
                      {consolidatedEscrow.count} {consolidatedEscrow.count === 1 ? "ordine in garanzia" : "ordini in garanzia"} raggruppati in un unico addebito di <b>{eur(consolidatedEscrow.total)}</b> (IVA inclusa). I fondi restano in deposito e vengono rilasciati ai fornitori solo dopo la consegna confermata.
                    </div>
                  )}
                </>
              );
            })()}

            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: C.muted, background: C.bg, borderRadius: 10, padding: "12px 16px", maxWidth: 520, margin: "0 auto 26px", textAlign: "left", lineHeight: 1.6 }}>
              <Truck size={15} color={C.blue} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>Segui l'avanzamento della spedizione dalla pagina di ogni ordine (anche dal tuo profilo, sezione <b>I miei ordini</b>). Alla consegna il pagamento si sblocca automaticamente al fornitore entro 7 giorni, salvo una tua contestazione.</span>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => { window.location.href = "/ordini"; }} style={{ background: "#0369A1", color: "#fff", border: "none", borderRadius: 9, padding: "12px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>Vai ai miei ordini</button>
              <button onClick={() => { window.location.href = "/catalogo"; }} style={{ background: "transparent", color: C.blue, border: `1.5px solid ${C.blue}`, borderRadius: 9, padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "Inter,system-ui" }}>Continua gli acquisti</button>
            </div>
          </div>
        ) : payins ? (
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6, textAlign: "center" }}>Completa il pagamento</h1>
            <p style={{ fontSize: 14, color: C.muted, textAlign: "center", margin: "0 0 20px", lineHeight: 1.6 }}>
              Gli ordini sono stati creati e restano <b>in attesa del pagamento in garanzia</b>: conferma qui sotto per depositare i fondi in escrow.
            </p>
            <EscrowPayinPanel
              billing={billingPrefill}
              payins={payins}
              onAllPaid={() => { setPayins(null); setDone(pendingDone || { orders: [] }); }}
            />
          </div>
        ) : loading ? (
          <div style={{ padding: "50px 0", textAlign: "center", color: C.muted }}>Caricamento…</div>
        ) : needLogin ? (
          <div style={{ padding: "40px 20px", textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Accedi per completare l'ordine</div>
            <button onClick={() => { window.location.href = "/login"; }} style={{ background: "#0369A1", color: "#fff", border: "none", borderRadius: 9, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>Accedi</button>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <Package size={30} color={C.border} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Il carrello è vuoto</div>
            <button onClick={() => { window.location.href = "/catalogo"; }} style={{ background: "#0369A1", color: "#fff", border: "none", borderRadius: 9, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>Vai al catalogo</button>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 18 }}>Checkout</h1>

            {hasIssues && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "#9A3412", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 10, padding: "11px 14px", marginBottom: 18 }}>
                <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
                <span>Alcune righe hanno problemi (quantità sotto il minimo o prezzo non disponibile). <span onClick={() => { window.location.href = "/carrello"; }} style={{ fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>Torna al carrello</span> per correggerle.</span>
              </div>
            )}
            {hasUnpricedLines && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: C.red, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "11px 14px", marginBottom: 18 }}>
                <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
                <span>
                  {unpricedMessage(unpricedLines)}{" "}
                  <span onClick={() => { window.location.href = "/carrello"; }} style={{ fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>Torna al carrello</span>
                </span>
              </div>
            )}
            {err && <div style={{ marginBottom: 18, padding: "11px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13, color: C.red }}>{err}</div>}

            <div className="co-layout">
              {/* COLONNA PRINCIPALE — sezioni */}
              <div>
                {/* INDIRIZZO DI FATTURAZIONE */}
                <div style={cardStyle}>
                  <SectionTitle icon={Receipt}>Indirizzo di fatturazione</SectionTitle>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Indirizzo di fatturazione *</label>
                  <select className="co-input" value={billingAddressId} onChange={e => setBillingAddressId(e.target.value)} style={{ marginBottom: 8 }}>
                    {companyAddress && <option value="__legal__">{companyName || `Sede legale — ${companyAddress}`}</option>}
                    {addresses.map(a => (
                      <option key={a.id} value={a.id}>{a.label ? `${a.label} — ` : ""}{a.address}</option>
                    ))}
                    {!companyAddress && addresses.length === 0 && <option value="">Nessun indirizzo disponibile</option>}
                  </select>
                  <div style={{ fontSize: 11.5, color: C.muted }}>
                    Usato per l'emissione della fattura. Di default è la sede legale — puoi scegliere un altro indirizzo salvato se la fattura va intestata altrove.
                  </div>
                </div>

                {/* INDIRIZZO DI CONSEGNA */}
                <div style={cardStyle}>
                  <SectionTitle icon={MapPin}>Indirizzo di consegna</SectionTitle>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Indirizzo di consegna *</label>
                  <select className="co-input" value={showAddForm ? "__new__" : selectedAddressId} onChange={e => selectAddress(e.target.value)} style={{ marginBottom: 14 }}>
                    {companyAddress && <option value="__legal__">Sede legale — {companyAddress}</option>}
                    {addresses.map(a => (
                      <option key={a.id} value={a.id}>{a.label ? `${a.label} — ` : ""}{a.address}</option>
                    ))}
                    <option value="__new__">+ Aggiungi indirizzo di luogo di spedizione</option>
                  </select>

                  {showAddForm && (
                    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 14, background: C.bg }}>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Nuovo indirizzo di spedizione *</label>
                      <input className="co-input" value={newAddrText} onChange={e => setNewAddrText(e.target.value)} placeholder="Via, civico, CAP, città, paese" style={{ marginBottom: 10 }} />
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Etichetta (facoltativo)</label>
                      <input className="co-input" value={newAddrLabel} onChange={e => setNewAddrLabel(e.target.value)} placeholder="Es. Magazzino Nord, Deposito Ovest" style={{ marginBottom: 12 }} />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button onClick={saveNewAddress} disabled={savingAddress}
                          style={{ background: "#0369A1", color: "#fff", border: "none", borderRadius: 9, padding: "10px 18px", fontSize: 13.5, fontWeight: 700, cursor: savingAddress ? "default" : "pointer", opacity: savingAddress ? 0.6 : 1, fontFamily: "Inter,system-ui", display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Plus size={14} /> {savingAddress ? "Salvataggio…" : "Salva indirizzo"}
                        </button>
                        {(companyAddress || addresses.length > 0) && (
                          <button onClick={() => { if (companyAddress) selectAddress("__legal__"); else selectAddress(addresses[0].id); }}
                            style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "Inter,system-ui", display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <X size={14} /> Annulla
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <label style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Note per la consegna (facoltativo)</label>
                  <textarea className="co-input" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Es. accesso automezzi, orari di ricevimento merce, magazzino di destinazione…" style={{ resize: "vertical" }} />
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>L'indirizzo selezionato viene salvato tra quelli della tua azienda per i prossimi ordini.</div>
                </div>

                {/* SPEDIZIONE */}
                <div style={cardStyle}>
                  <SectionTitle icon={Truck}>Spedizione</SectionTitle>
                  <div className="co-table" style={{ border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 10 }}>
                    <div className="co-row" style={{ background: C.bg, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: C.muted }}>
                      <span>Prodotto / fornitore</span><span>Quantità</span><span>Preparazione</span><span>Consegna</span><span>Data stimata</span><span style={{ textAlign: "right" }}>Totale</span>
                    </div>
                    {items.map(it => {
                      const est = estimateDelivery(it);
                      return (
                        <div key={`${it.product_id}|${it.supplier_company_id}`} className="co-row">
                          <div>
                            <div style={{ fontWeight: 700 }}>{it.product_name}</div>
                            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{it.supplier_name}</div>
                          </div>
                          <span className="co-num">{Number(it.quantity_kg).toLocaleString("it-IT")} kg</span>
                          <div style={{ fontWeight: 600 }}>{it.lead_time_days != null ? `${it.lead_time_days} gg` : "—"}</div>
                          <div style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 4 }}>
                            <Truck size={11} style={{ flexShrink: 0 }} /> {est.label}
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: est.dateLabel ? C.blue : C.muted }}>{est.dateLabel || "—"}</div>
                          <span className="co-num" style={{ textAlign: "right", fontWeight: 700 }}>{it.unit_price != null ? eur(Number(it.unit_price) * Number(it.quantity_kg)) : "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 18 }}>* IVA e spese di spedizione escluse — le vedi nel riepilogo a lato prima della conferma.</div>

                  {/* Preventivi corriere: un preventivo per fornitore. */}
                  {suppliers.map(s => {
                    const q = quotesBySupplier[s.id];
                    if (q === undefined) {
                      return (
                        <div key={s.id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 12, fontSize: 13, color: C.muted }}>
                          Calcolo corrieri disponibili per {s.name}…
                        </div>
                      );
                    }
                    if (q === "none") {
                      return (
                        <div key={s.id} style={{ border: `1px solid #FED7AA`, background: "#FFF7ED", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <PauseCircle size={18} color={C.amber} style={{ marginTop: 1, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#9A3412", marginBottom: 4 }}>{s.name} — nessun corriere su questa tratta</div>
                              <div style={{ fontSize: 12.5, color: "#9A3412", lineHeight: 1.6 }}>
                                Per questa spedizione non abbiamo ancora un corriere attivo sulla tratta {s.country || "—"} → {address || "—"}. L'ordine viene messo in attesa: il nostro team logistico ti farà avere il costo di spedizione a breve, e completerai il pagamento solo a quel punto.
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const sorted = [...q.quotes].sort((a, b) => {
                      if (a.carrier_id === q.cheapest_id) return -1; if (b.carrier_id === q.cheapest_id) return 1;
                      if (a.carrier_id === q.fastest_id) return -1; if (b.carrier_id === q.fastest_id) return 1;
                      return b.score - a.score;
                    });
                    return (
                      <div key={s.id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><Truck size={14} color={C.blue} /> Corriere per {s.name} <span style={{ fontWeight: 400, color: C.muted }}>({s.qty.toLocaleString("it-IT")} kg)</span></div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {sorted.map(carrier => {
                            const isCheapest = carrier.carrier_id === q.cheapest_id;
                            const isFastest = carrier.carrier_id === q.fastest_id;
                            const selected = selectedCarrier[s.id] === carrier.carrier_id;
                            return (
                              <div key={carrier.carrier_id} onClick={() => setSelectedCarrier(prev => ({ ...prev, [s.id]: carrier.carrier_id }))}
                                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer", border: `1.5px solid ${selected ? C.blue : C.border}`, background: selected ? "#EFF6FF" : "#fff", borderRadius: 10, padding: "10px 14px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ width: 17, height: 17, borderRadius: "50%", border: `2px solid ${selected ? C.blue : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    {selected && <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.blue }} />}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                                      {carrier.carrier_name}
                                      {isCheapest && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, color: C.green, background: "#ECFDF5", borderRadius: 100, padding: "2px 8px" }}>La più economica</span>}
                                      {isFastest && !isCheapest && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, color: C.blue, background: "#EFF6FF", borderRadius: 100, padding: "2px 8px" }}>La più rapida</span>}
                                    </div>
                                    <div style={{ fontSize: 11.5, color: C.muted, display: "flex", alignItems: "center", gap: 5 }}><Clock3 size={11} /> {carrier.lead_time_days != null ? `${carrier.lead_time_days} giorni` : "tempi variabili"}</div>
                                  </div>
                                </div>
                                <span className="co-num" style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{eur(carrier.price)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* METODO DI PAGAMENTO */}
                <div style={cardStyle}>
                  <SectionTitle icon={CreditCard}>Metodo di pagamento</SectionTitle>
                  {previewLoading && !preview ? (
                    <div style={{ fontSize: 13, color: C.muted }}>Preparazione metodi di pagamento…</div>
                  ) : previewErr ? (
                    <div style={{ padding: "11px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13, color: C.red }}>{previewErr}</div>
                  ) : (preview?.by_supplier || []).length > 0 ? (
                    <>
                      {preview.by_supplier.map(s => (
                        <PaymentMethodSelector
                          key={s.supplier_company_id}
                          buyerId={buyerCompanyId}
                          supplierId={s.supplier_company_id}
                          supplierName={s.supplier_name}
                          subOrderTotal={subOrderTotal(s)}
                          subOrderGross={subOrderTotal(s) * 1.22}
                          value={methodBySupplier[s.supplier_company_id]}
                          onChange={(m) => setMethodBySupplier(prev => ({ ...prev, [s.supplier_company_id]: m }))}
                        />
                      ))}
                      {!allMethodsChosen && (
                        <div style={{ fontSize: 12.5, color: C.amber, marginTop: 2 }}>Scegli un metodo di pagamento per ogni fornitore per proseguire.</div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: C.muted }}>Calcolo del riepilogo in corso…</div>
                  )}
                </div>
              </div>

              {/* COLONNA STICKY — riepilogo economico + conferma */}
              <aside className="co-summary">
                <div style={{ ...cardStyle, marginBottom: 12 }}>
                  <SectionTitle icon={Receipt}>Riepilogo</SectionTitle>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}><span style={{ color: C.muted }}>Righe</span><span className="co-num" style={{ fontWeight: 600 }}>{items.length}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8, gap: 10 }}><span style={{ color: C.muted }}>Fatturazione</span><span style={{ fontWeight: 600, textAlign: "right", maxWidth: 200, fontSize: 12 }}>{companyName || billingAddressText || "—"}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8, gap: 10 }}><span style={{ color: C.muted }}>Consegna</span><span style={{ fontWeight: 600, textAlign: "right", maxWidth: 200, fontSize: 12 }}>{address || "—"}</span></div>

                  {previewLoading ? (
                    <div style={{ fontSize: 13, color: C.muted, padding: "10px 0" }}>Calcolo spedizione e IVA…</div>
                  ) : previewErr ? (
                    <div style={{ fontSize: 12.5, color: C.red, padding: "6px 0 4px" }}>{previewErr}</div>
                  ) : (
                    <>
                      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12.5, fontWeight: 700, gap: 10 }}>
                          <span style={{ color: C.green }}>Commissioni BulkStrike</span>
                          <span className="co-num" style={{ whiteSpace: "nowrap", color: C.green }}>€0,00</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, marginTop: 6 }}>
                          <span>Subtotale materia prima</span>
                          <span className="co-num" style={{ whiteSpace: "nowrap" }}>{eur(goodsForDisplay)}</span>
                        </div>
                      </div>

                      {(preview?.by_supplier || []).length > 0 && (
                        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 10, paddingTop: 10 }}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 7 }}>Spedizione per fornitore</div>
                          {preview.by_supplier.map(s => (
                            <div key={s.supplier_company_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6, gap: 10 }}>
                              <span style={{ color: C.muted }}>
                                {s.supplier_name}
                                {s.is_hold && <span style={{ color: C.amber, fontWeight: 600 }}> · in attesa di corriere</span>}
                              </span>
                              <span className="co-num" style={{ whiteSpace: "nowrap" }}>{s.is_hold ? "—" : eur(s.shipping_amount)}</span>
                            </div>
                          ))}
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>
                            <span>Subtotale spedizione</span>
                            <span className="co-num" style={{ whiteSpace: "nowrap" }}>{eur(shippingForDisplay)}</span>
                          </div>
                        </div>
                      )}

                      <div style={{ borderTop: `1px solid ${C.border}`, margin: "10px 0 0", paddingTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Subtotale <IvaChip style={{ verticalAlign: "baseline" }} /></span>
                          <span className="co-num" style={{ fontSize: 22, fontWeight: 800, color: C.blue }}>{eur(goodsForDisplay + (shippingForDisplay ?? 0))}</span>
                        </div>
                        {escrowSepaSuppliers.length > 0 && (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8, gap: 10 }}>
                              <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>Elaborazione pagamento (SEPA){escrowSepaSuppliers.length > 1 ? ` ×${escrowSepaSuppliers.length}` : ""}</span>
                              <span className="co-num" style={{ whiteSpace: "nowrap", fontSize: 13, fontWeight: 700 }}>{eur(escrowFeeTotal)}</span>
                            </div>
                            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>0,8% del totale + €0,35 (tariffa SEPA del gestore di pagamento), non una commissione BulkStrike.</div>
                          </>
                        )}
                        {premiumFeeSuppliers.length > 0 && (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8, gap: 10 }}>
                              <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>Elaborazione pagamento (Carta){premiumFeeSuppliers.length > 1 ? ` ×${premiumFeeSuppliers.length}` : ""} <span style={{ fontWeight: 500, color: C.muted }}>— stima</span></span>
                              <span className="co-num" style={{ whiteSpace: "nowrap", fontSize: 13, fontWeight: 700 }}>{eur(premiumFeeTotal)}</span>
                            </div>
                            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>Stima 1,5% + €0,25 (tariffa carte SEE del gestore): l&apos;importo effettivo dipende dalla carta. Non è una commissione BulkStrike.</div>
                          </>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 800 }}>Totale da pagare</span>
                          <span className="co-num" style={{ fontSize: 18, fontWeight: 800 }}>{grandTotalForDisplay != null ? eur(grandTotalForDisplay) : "—"}</span>
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 3, textAlign: "right" }}>IVA 22% inclusa ({eur(vatForDisplay)})</div>
                      </div>
                    </>
                  )}
                </div>

                <button onClick={confirmPayment} disabled={submitting || !payReady || !allMethodsChosen}
                  style={{ width: "100%", background: "#0369A1", color: "#fff", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 15, fontWeight: 700, cursor: (submitting || !payReady || !allMethodsChosen) ? "default" : "pointer", opacity: (submitting || !payReady || !allMethodsChosen) ? 0.6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "Inter,system-ui", marginBottom: 10 }}>
                  {submitting ? "Elaborazione…" : !payReady ? "Calcolo totale…" : <>Conferma e paga {grandTotalForDisplay != null ? eur(grandTotalForDisplay) : ""} <ArrowRight size={17} /></>}
                </button>
                {payReady && !allMethodsChosen && (
                  <div style={{ fontSize: 12, color: C.amber, textAlign: "center", marginBottom: 10 }}>Scegli un metodo di pagamento per ogni fornitore.</div>
                )}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><TrustBadge /></div>
                <button onClick={() => { window.location.href = "/carrello"; }} style={{ width: "100%", background: "transparent", color: C.muted, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "11px 20px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "Inter,system-ui" }}>Torna al carrello</button>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
