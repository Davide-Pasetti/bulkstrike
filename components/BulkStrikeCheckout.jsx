"use client";
// BulkStrikeCheckout — checkout in 2 step (/checkout):
//  1) Spedizione — conferma indirizzo (precompilato dai dati aziendali) + note,
//     riepilogo di ogni riga (fornitore, quantità, lead time)
//  2) Pagamento — riepilogo economico, conferma → checkout_cart crea gli ordini
//     GIÀ PAGATI (DEMO) e svuota il carrello → pagina "Pagamento eseguito"
// Il pagamento chiude il checkout: non è più un passo separato successivo.
import { useState, useEffect, useMemo } from "react";
import { ShieldCheck, ArrowRight, ArrowLeft, Check, ChevronRight, Package, FileText, AlertTriangle, MapPin, Mail, CreditCard, Truck } from "lucide-react";
import { getCart, checkoutCart, getMyCompanyAddress, getSession, poolErrorMessage } from "@/lib/api";
import NavAuth from "@/components/BulkStrikeNavAuth";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706" };
const eur = (n) => n == null ? "—" : "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });

function BSIcon({ size = 36, uid = "a" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#0D2137"/><stop offset="100%" stopColor="#0C4A6E"/></linearGradient>
        <linearGradient id={`ar${uid}`} x1="42" y1="12" x2="42" y2="40" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#38BDF8"/><stop offset="100%" stopColor="#22D3EE"/></linearGradient>
      </defs>
      <rect width="56" height="56" rx="13" fill={`url(#bg${uid})`}/>
      <rect x="10" y="14" width="22" height="5.5" rx="2.75" fill="white"/>
      <rect x="10" y="23" width="16" height="5.5" rx="2.75" fill="white" fillOpacity="0.65"/>
      <rect x="10" y="32" width="10" height="5.5" rx="2.75" fill="white" fillOpacity="0.35"/>
      <rect x="36" y="12" width="1" height="32" fill="white" fillOpacity="0.07"/>
      <path d="M42 12 L42 34" stroke={`url(#ar${uid})`} strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M35.5 28.5 L42 38 L48.5 28.5" stroke={`url(#ar${uid})`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

function Stepper({ step }) {
  const steps = [["Spedizione", MapPin], ["Pagamento", CreditCard]];
  return (
    <div style={{ display:"flex", alignItems:"center", marginBottom:28, maxWidth:360 }}>
      {steps.map(([label, Icon], i) => {
        const n = i + 1;
        const activeOrDone = n <= step;
        return (
          <div key={label} style={{ display:"flex", alignItems:"center", flex:i === 0 ? "0 0 auto" : 1 }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:88 }}>
              <div style={{ width:34, height:34, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", background:activeOrDone ? C.blue : "#fff", border:`2px solid ${activeOrDone ? C.blue : C.border}`, color:activeOrDone ? "#fff" : C.muted }}>
                {n < step ? <Check size={16}/> : <Icon size={15}/>}
              </div>
              <span style={{ fontSize:12, fontWeight:activeOrDone ? 700 : 500, color:activeOrDone ? C.text : C.muted, marginTop:5 }}>{label}</span>
            </div>
            {i === 0 && <div style={{ flex:1, height:2, background:step > 1 ? C.blue : C.border, marginTop:-17, minWidth:40 }}/>}
          </div>
        );
      })}
    </div>
  );
}

export default function CheckoutPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [step, setStep] = useState(1);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const [buyerEmail, setBuyerEmail] = useState("");

  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      setBuyerEmail(session.user?.email || "");
      try {
        const [cart, addr] = await Promise.all([getCart(), getMyCompanyAddress().catch(() => null)]);
        setItems(cart);
        if (addr) setAddress([addr.address, addr.city, addr.country].filter(Boolean).join(", "));
      } catch (e) { setErr(poolErrorMessage(e)); }
      setLoading(false);
    })();
  }, []);

  const subtotal = useMemo(() => items.reduce((a, it) => a + (it.unit_price != null ? Number(it.unit_price) * Number(it.quantity_kg) : 0), 0), [items]);
  const hasIssues = useMemo(() => items.some(it => !it.offer_active || it.unit_price == null || (it.min_order_kg != null && Number(it.quantity_kg) < Number(it.min_order_kg))), [items]);

  function goToPayment() {
    setErr("");
    if (!address.trim()) { setErr("Inserisci l'indirizzo di spedizione."); return; }
    setStep(2);
  }

  async function confirmPayment() {
    setSubmitting(true); setErr("");
    try {
      const res = await checkoutCart(address, notes);
      setDone(res);
    } catch (e) {
      setErr(poolErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ background:"#fff", color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", colorScheme:"light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .co-num { font-family:'JetBrains Mono',monospace; }
        .co-row { display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:12px; padding:13px 16px; border-bottom:1px solid ${C.border}; font-size:13.5px; align-items:center; }
        .co-input { width:100%; padding:11px 13px; border:1.5px solid ${C.border}; border-radius:9px; font-size:14px; outline:none; font-family:'Inter',system-ui; }
        .co-input:focus { border-color:${C.blue}; }
        @media (max-width:760px) { .co-row { grid-template-columns:1fr 1fr !important; } }
      `}</style>

      <nav style={{ position:"sticky", top:0, zIndex:50, background:"rgba(255,255,255,0.96)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:900, margin:"0 auto", padding:"0 20px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
          <div onClick={() => { if (!done) window.location.href = "/"; }} style={{ display:"flex", alignItems:"center", gap:10, cursor:done ? "default" : "pointer" }}>
            <BSIcon size={34} uid="nav" />
            <div style={{ display:"flex", alignItems:"baseline" }}>
              <span style={{ fontSize:19, fontWeight:900, letterSpacing:"-0.03em" }}>Bulk</span>
              <span style={{ fontSize:19, fontWeight:900, letterSpacing:"-0.03em", background:"linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>Strike</span>
            </div>
          </div>
          <NavAuth />
        </div>
      </nav>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"22px 20px 60px" }}>
        {!done && (
          <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.muted, marginBottom:18 }}>
            <span onClick={() => { window.location.href = "/"; }} style={{ cursor:"pointer" }}>Home</span><ChevronRight size={13}/>
            <span onClick={() => { window.location.href = "/carrello"; }} style={{ cursor:"pointer" }}>Carrello</span><ChevronRight size={13}/>
            <span style={{ color:C.text, fontWeight:600 }}>Checkout</span>
          </div>
        )}

        {done ? (
          <div style={{ textAlign:"center", padding:"40px 20px" }}>
            <div style={{ width:64, height:64, borderRadius:"50%", background:"#ECFDF5", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
              <Check size={30} color={C.green}/>
            </div>
            <h1 style={{ fontSize:26, fontWeight:800, marginBottom:8 }}>Pagamento eseguito</h1>
            <p style={{ fontSize:14.5, color:C.muted, maxWidth:520, margin:"0 auto 6px", lineHeight:1.6 }}>
              {done.count === 1 ? "Il tuo ordine è" : `I tuoi ${done.count} ordini sono`} stati pagati e {done.count === 1 ? "il fornitore è stato" : "i fornitori sono stati"} avvisato{done.count === 1 ? "" : "i"}: la merce partirà a breve.
            </p>
            <p style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontSize:13, color:C.muted, marginBottom:26 }}>
              <Mail size={14}/> Conferma inviata a <b style={{ color:C.text }}>{buyerEmail}</b>
            </p>

            <div style={{ display:"flex", flexDirection:"column", gap:8, maxWidth:460, margin:"0 auto 26px" }}>
              {(done.orders || []).map((id, i) => (
                <div key={id} onClick={() => { window.location.href = `/ordine?id=${id}`; }}
                     style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 16px", cursor:"pointer" }}>
                  <span style={{ display:"flex", alignItems:"center", gap:8, fontSize:13.5, fontWeight:600 }}><FileText size={15} color={C.blue}/> Ordine #{i + 1} <span className="co-num" style={{ fontSize:11, color:C.muted }}>{id.slice(0, 8)}…</span></span>
                  <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:12.5, fontWeight:700, color:C.blue }}>Segui spedizione <ArrowRight size={13}/></span>
                </div>
              ))}
            </div>

            <div style={{ display:"flex", gap:8, alignItems:"flex-start", fontSize:12.5, color:C.muted, background:C.bg, borderRadius:10, padding:"12px 16px", maxWidth:520, margin:"0 auto 26px", textAlign:"left", lineHeight:1.6 }}>
              <Truck size={15} color={C.blue} style={{ marginTop:1, flexShrink:0 }}/>
              <span>Segui l'avanzamento della spedizione dalla pagina di ogni ordine (anche dal tuo profilo, sezione <b>I miei ordini</b>). Alla consegna il pagamento si sblocca automaticamente al fornitore entro 7 giorni, salvo una tua contestazione.</span>
            </div>

            <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
              <button onClick={() => { window.location.href = "/ordini"; }} style={{ background:C.blue, color:"#fff", border:"none", borderRadius:9, padding:"12px 22px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Vai ai miei ordini</button>
              <button onClick={() => { window.location.href = "/catalogo"; }} style={{ background:"transparent", color:C.blue, border:`1.5px solid ${C.blue}`, borderRadius:9, padding:"12px 22px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Continua gli acquisti</button>
            </div>
          </div>
        ) : loading ? (
          <div style={{ padding:"50px 0", textAlign:"center", color:C.muted }}>Caricamento…</div>
        ) : needLogin ? (
          <div style={{ padding:"40px 20px", textAlign:"center", border:`1px solid ${C.border}`, borderRadius:14 }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>Accedi per completare l'ordine</div>
            <button onClick={() => { window.location.href = "/login"; }} style={{ background:C.blue, color:"#fff", border:"none", borderRadius:9, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Accedi</button>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding:"40px 20px", textAlign:"center", border:`1px solid ${C.border}`, borderRadius:14 }}>
            <Package size={30} color={C.border} style={{ marginBottom:10 }}/>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:12 }}>Il carrello è vuoto</div>
            <button onClick={() => { window.location.href = "/catalogo"; }} style={{ background:C.blue, color:"#fff", border:"none", borderRadius:9, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Vai al catalogo</button>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize:26, fontWeight:800, letterSpacing:"-0.02em", marginBottom:6 }}>Checkout</h1>
            <Stepper step={step} />

            {hasIssues && (
              <div style={{ display:"flex", gap:8, alignItems:"flex-start", fontSize:13, color:"#9A3412", background:"#FFF7ED", border:"1px solid #FED7AA", borderRadius:10, padding:"11px 14px", marginBottom:18 }}>
                <AlertTriangle size={15} style={{ marginTop:1, flexShrink:0 }}/>
                <span>Alcune righe hanno problemi (quantità sotto il minimo o prezzo non disponibile). <span onClick={() => { window.location.href = "/carrello"; }} style={{ fontWeight:700, cursor:"pointer", textDecoration:"underline" }}>Torna al carrello</span> per correggerle.</span>
              </div>
            )}
            {err && <div style={{ marginBottom:18, padding:"11px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10, fontSize:13, color:C.red }}>{err}</div>}

            {step === 1 ? (
              <>
                <div style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:18 }}>
                  <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:14, display:"flex", alignItems:"center", gap:7 }}><MapPin size={15}/> Indirizzo di consegna</div>
                  <label style={{ fontSize:12.5, fontWeight:600, color:C.muted, display:"block", marginBottom:6 }}>Indirizzo *</label>
                  <input className="co-input" value={address} onChange={e => setAddress(e.target.value)} placeholder="Via, civico, CAP, città, paese" style={{ marginBottom:14 }}/>
                  <label style={{ fontSize:12.5, fontWeight:600, color:C.muted, display:"block", marginBottom:6 }}>Note per la consegna (facoltativo)</label>
                  <textarea className="co-input" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Es. accesso automezzi, orari di ricevimento merce, magazzino di destinazione…" style={{ resize:"vertical" }}/>
                  <div style={{ fontSize:11.5, color:C.muted, marginTop:8 }}>Precompilato con l'indirizzo della tua azienda — modificalo se la consegna va altrove.</div>
                </div>

                <div style={{ border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden", marginBottom:22 }}>
                  <div className="co-row" style={{ background:C.bg, fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.04em", color:C.muted }}>
                    <span>Prodotto / fornitore</span><span>Quantità</span><span>Lead time</span><span style={{ textAlign:"right" }}>Totale</span>
                  </div>
                  {items.map(it => (
                    <div key={`${it.product_id}|${it.supplier_company_id}`} className="co-row">
                      <div>
                        <div style={{ fontWeight:700 }}>{it.product_name}</div>
                        <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{it.supplier_name}</div>
                      </div>
                      <span className="co-num">{Number(it.quantity_kg).toLocaleString("it-IT")} kg</span>
                      <span>{it.lead_time_days != null ? `${it.lead_time_days} giorni` : "—"}</span>
                      <span className="co-num" style={{ textAlign:"right", fontWeight:700 }}>{it.unit_price != null ? eur(Number(it.unit_price) * Number(it.quantity_kg)) : "—"}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <button onClick={goToPayment} disabled={hasIssues}
                          style={{ background:C.blue, color:"#fff", border:"none", borderRadius:10, padding:"13px 26px", fontSize:14.5, fontWeight:700, cursor:hasIssues?"default":"pointer", opacity:hasIssues?0.5:1, display:"inline-flex", alignItems:"center", gap:8, fontFamily:"Inter,system-ui" }}>
                    Continua al pagamento <ArrowRight size={16}/>
                  </button>
                  <button onClick={() => { window.location.href = "/carrello"; }} style={{ background:"transparent", color:C.muted, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"13px 20px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Torna al carrello</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:18 }}>
                  <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:14 }}>Riepilogo</div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13.5, marginBottom:8 }}><span style={{ color:C.muted }}>Righe</span><span className="co-num" style={{ fontWeight:600 }}>{items.length}</span></div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13.5, marginBottom:8 }}><span style={{ color:C.muted }}>Consegna</span><span style={{ fontWeight:600, textAlign:"right", maxWidth:280 }}>{address}</span></div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13.5, marginBottom:8 }}><span style={{ color:C.muted }}>Commissioni BulkStrike</span><span className="co-num" style={{ fontWeight:700, color:C.green }}>€0,00</span></div>
                  <div style={{ borderTop:`1px solid ${C.border}`, margin:"12px 0 0", paddingTop:12, display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                    <span style={{ fontSize:14, fontWeight:700 }}>Totale da pagare</span>
                    <span className="co-num" style={{ fontSize:24, fontWeight:800, color:C.blue }}>{eur(subtotal)}</span>
                  </div>
                </div>

                <div style={{ display:"flex", gap:8, alignItems:"flex-start", fontSize:12.5, color:C.muted, background:C.bg, borderRadius:10, padding:"12px 14px", marginBottom:22, lineHeight:1.6 }}>
                  <ShieldCheck size={15} color={C.green} style={{ marginTop:1, flexShrink:0 }}/>
                  <span>Pagamento protetto in <b>escrow</b>: resta in deposito su BulkStrike finché la consegna non viene confermata (automaticamente 7 giorni dopo la spedizione, o subito se confermi tu prima). Ambiente dimostrativo: il versamento è simulato in attesa dell'integrazione con il gestore di pagamento.</span>
                </div>

                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <button onClick={confirmPayment} disabled={submitting}
                          style={{ background:C.blue, color:"#fff", border:"none", borderRadius:10, padding:"14px 28px", fontSize:15, fontWeight:700, cursor:submitting?"default":"pointer", opacity:submitting?0.6:1, display:"inline-flex", alignItems:"center", gap:8, fontFamily:"Inter,system-ui" }}>
                    {submitting ? "Pagamento in corso…" : <>Paga {eur(subtotal)} e conferma ordine <ArrowRight size={17}/></>}
                  </button>
                  <button onClick={() => setStep(1)} disabled={submitting} style={{ background:"transparent", color:C.muted, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"14px 20px", fontSize:14, fontWeight:600, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6, fontFamily:"Inter,system-ui" }}><ArrowLeft size={15}/> Indietro</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
