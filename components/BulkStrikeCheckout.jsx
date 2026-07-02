"use client";
// BulkStrikeCheckout — conferma d'ordine (/checkout). Mostra il riepilogo del
// carrello e con la conferma crea un ordine per ogni riga (checkout_cart:
// transazionale, prezzi ricalcolati server-side, o tutti o nessuno).
// Dopo la creazione, gli ordini nascono in "pending_payment": il pagamento
// escrow si gestisce dalla pagina di ogni ordine.
import { useState, useEffect, useMemo } from "react";
import { ShieldCheck, ArrowRight, Check, ChevronRight, Package, FileText, AlertTriangle } from "lucide-react";
import { getCart, checkoutCart, getSession, poolErrorMessage } from "@/lib/api";
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

export default function CheckoutPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null); // { orders:[uuid], count }

  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      try { setItems(await getCart()); } catch (e) { setErr(poolErrorMessage(e)); }
      setLoading(false);
    })();
  }, []);

  const subtotal = useMemo(() => items.reduce((a, it) => a + (it.unit_price != null ? Number(it.unit_price) * Number(it.quantity_kg) : 0), 0), [items]);
  const hasIssues = useMemo(() => items.some(it => !it.offer_active || it.unit_price == null || (it.min_order_kg != null && Number(it.quantity_kg) < Number(it.min_order_kg))), [items]);

  async function confirm() {
    setSubmitting(true); setErr("");
    try {
      const res = await checkoutCart();
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
        @media (max-width:760px) { .co-row { grid-template-columns:1fr 1fr !important; } .co-nav-links { display:none !important; } }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ position:"sticky", top:0, zIndex:50, background:"rgba(255,255,255,0.96)", backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:900, margin:"0 auto", padding:"0 20px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
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
        {/* BREADCRUMB */}
        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.muted, marginBottom:18 }}>
          <span onClick={() => { window.location.href = "/"; }} style={{ cursor:"pointer" }}>Home</span><ChevronRight size={13}/>
          <span onClick={() => { window.location.href = "/carrello"; }} style={{ cursor:"pointer" }}>Carrello</span><ChevronRight size={13}/>
          <span style={{ color:C.text, fontWeight:600 }}>Checkout</span>
        </div>

        {done ? (
          /* ── STATO SUCCESSO ── */
          <div style={{ textAlign:"center", padding:"40px 20px" }}>
            <div style={{ width:64, height:64, borderRadius:"50%", background:"#ECFDF5", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
              <Check size={30} color={C.green}/>
            </div>
            <h1 style={{ fontSize:26, fontWeight:800, marginBottom:8 }}>{done.count === 1 ? "Ordine creato" : `${done.count} ordini creati`}!</h1>
            <p style={{ fontSize:14.5, color:C.muted, maxWidth:520, margin:"0 auto 24px", lineHeight:1.6 }}>
              {done.count === 1 ? "Il fornitore è stato notificato. L'ordine è" : "I fornitori sono stati notificati. Gli ordini sono"} in attesa di pagamento:
              completa il versamento in escrow dalla pagina di ogni ordine per far partire la spedizione.
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:8, maxWidth:460, margin:"0 auto 26px" }}>
              {(done.orders || []).map((id, i) => (
                <div key={id} onClick={() => { window.location.href = `/ordine?id=${id}`; }}
                     style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 16px", cursor:"pointer" }}>
                  <span style={{ display:"flex", alignItems:"center", gap:8, fontSize:13.5, fontWeight:600 }}><FileText size={15} color={C.blue}/> Ordine #{i + 1} <span className="co-num" style={{ fontSize:11, color:C.muted }}>{id.slice(0, 8)}…</span></span>
                  <span style={{ display:"flex", alignItems:"center", gap:5, fontSize:12.5, fontWeight:700, color:C.blue }}>Paga e segui <ArrowRight size={13}/></span>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
              <button onClick={() => { window.location.href = "/ordini"; }} style={{ background:C.blue, color:"#fff", border:"none", borderRadius:9, padding:"12px 22px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Vai ai miei ordini</button>
              <button onClick={() => { window.location.href = "/catalogo"; }} style={{ background:"transparent", color:C.blue, border:`1.5px solid ${C.blue}`, borderRadius:9, padding:"12px 22px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Continua gli acquisti</button>
            </div>
          </div>
        ) : (
          /* ── RIEPILOGO + CONFERMA ── */
          <>
            <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:"-0.02em", marginBottom:20 }}>Conferma il tuo ordine</h1>
            {loading ? (
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
                <div style={{ border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden", marginBottom:18 }}>
                  <div className="co-row" style={{ background:C.bg, fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.04em", color:C.muted }}>
                    <span>Prodotto / fornitore</span><span>Quantità</span><span>Prezzo</span><span style={{ textAlign:"right" }}>Totale</span>
                  </div>
                  {items.map(it => (
                    <div key={`${it.product_id}|${it.supplier_company_id}`} className="co-row">
                      <div>
                        <div style={{ fontWeight:700 }}>{it.product_name}</div>
                        <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{it.supplier_name}{it.lead_time_days != null ? ` · ${it.lead_time_days} gg` : ""}</div>
                      </div>
                      <span className="co-num">{Number(it.quantity_kg).toLocaleString("it-IT")} kg</span>
                      <span className="co-num">{it.unit_price != null ? `${eur(it.unit_price)}/kg` : "—"}</span>
                      <span className="co-num" style={{ textAlign:"right", fontWeight:700 }}>{it.unit_price != null ? eur(Number(it.unit_price) * Number(it.quantity_kg)) : "—"}</span>
                    </div>
                  ))}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", padding:"14px 16px", background:C.bg }}>
                    <div style={{ fontSize:13 }}>
                      <span style={{ fontWeight:700 }}>Subtotale merce</span>
                      <span style={{ color:C.muted }}> · commissioni BulkStrike </span><b style={{ color:C.green }}>€0,00</b>
                    </div>
                    <span className="co-num" style={{ fontSize:22, fontWeight:800, color:C.blue }}>{eur(subtotal)}</span>
                  </div>
                </div>

                {hasIssues && (
                  <div style={{ display:"flex", gap:8, alignItems:"flex-start", fontSize:13, color:"#9A3412", background:"#FFF7ED", border:"1px solid #FED7AA", borderRadius:10, padding:"11px 14px", marginBottom:14 }}>
                    <AlertTriangle size={15} style={{ marginTop:1, flexShrink:0 }}/>
                    <span>Alcune righe hanno problemi (quantità sotto il minimo o prezzo non disponibile). <span onClick={() => { window.location.href = "/carrello"; }} style={{ fontWeight:700, cursor:"pointer", textDecoration:"underline" }}>Torna al carrello</span> per correggerle.</span>
                  </div>
                )}
                {err && <div style={{ marginBottom:14, padding:"11px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10, fontSize:13, color:C.red }}>{err}</div>}

                <div style={{ display:"flex", gap:8, alignItems:"flex-start", fontSize:12.5, color:C.muted, background:C.bg, borderRadius:10, padding:"12px 14px", marginBottom:18, lineHeight:1.6 }}>
                  <ShieldCheck size={15} color={C.green} style={{ marginTop:1, flexShrink:0 }}/>
                  <span>Confermando, viene creato un ordine separato per ogni fornitore, in stato <b>in attesa di pagamento</b>. I prezzi sono ricalcolati al momento della conferma sui listini correnti. Il pagamento avviene in <b>escrow</b>: il fornitore incassa solo dopo la tua conferma di consegna conforme.</span>
                </div>

                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <button onClick={confirm} disabled={submitting || hasIssues}
                          style={{ background:C.blue, color:"#fff", border:"none", borderRadius:10, padding:"14px 28px", fontSize:15, fontWeight:700, cursor:(submitting||hasIssues)?"default":"pointer", opacity:(submitting||hasIssues)?0.6:1, display:"inline-flex", alignItems:"center", gap:8, fontFamily:"Inter,system-ui" }}>
                    {submitting ? "Creazione ordini…" : <>Conferma e crea {items.length === 1 ? "l'ordine" : `${items.length} ordini`} <ArrowRight size={17}/></>}
                  </button>
                  <button onClick={() => { window.location.href = "/carrello"; }} style={{ background:"transparent", color:C.muted, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"14px 22px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Torna al carrello</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
