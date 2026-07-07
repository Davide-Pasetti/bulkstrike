"use client";
// BulkStrikeOrders — storico ordini (/ordini). Mostra sia gli acquisti che le
// vendite dell'azienda loggata (get_my_orders → campo role), con filtri per
// ruolo e stato. Click su una riga → pagina dettaglio /ordine?id=…
import { useState, useEffect, useMemo } from "react";
import { ShoppingCart, ChevronRight, ArrowRight, Package, Star, Store } from "lucide-react";
import { getMyOrdersHistory, getSession, poolErrorMessage, reorderOrder } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706", purple:"#7C3AED" };
const eur = (n) => n == null ? "—" : "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });

// stato → etichetta, colore, sfondo
const STATUS = {
  pending_payment: { label:"In attesa di pagamento", fg:"#B45309", bg:"#FEF3C7" },
  paid:            { label:"Pagato — in preparazione", fg:"#1D4ED8", bg:"#DBEAFE" },
  shipped:         { label:"Spedito", fg:"#0369A1", bg:"#E0F2FE" },
  delivered:       { label:"Consegnato", fg:"#0F766E", bg:"#CCFBF1" },
  accepted:        { label:"Consegna confermata", fg:"#047857", bg:"#D1FAE5" },
  completed:       { label:"Completato", fg:"#047857", bg:"#D1FAE5" },
  disputed:        { label:"In contestazione", fg:"#B91C1C", bg:"#FEE2E2" },
  cancelled:       { label:"Annullato", fg:"#6B7280", bg:"#F3F4F6" },
};
const statusOf = (s) => STATUS[s] || { label:s, fg:C.muted, bg:C.bg };

export default function OrdersPage({ inShell = false }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [err, setErr] = useState("");
  const [roleF, setRoleF] = useState("all");     // all | buyer | supplier
  const [statusF, setStatusF] = useState("all"); // all | open | closed
  const [reorderState, setReorderState] = useState({}); // { [orderId]: { busy | done | err } }

  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      try { setOrders(await getMyOrdersHistory()); } catch (e) { setErr(poolErrorMessage(e)); }
      setLoading(false);
    })();
  }, []);

  const OPEN_STATES = ["pending_payment","paid","shipped","delivered","disputed"];
  const filtered = useMemo(() => orders.filter(o =>
    (roleF === "all" || o.role === roleF) &&
    (statusF === "all" || (statusF === "open" ? OPEN_STATES.includes(o.status) : !OPEN_STATES.includes(o.status)))
  ), [orders, roleF, statusF]);

  const nBuy = orders.filter(o => o.role === "buyer").length;
  const nSell = orders.filter(o => o.role === "supplier").length;

  // Riordina: rimette l'articolo dell'ordine nel carrello. e.stopPropagation per
  // non attivare la navigazione al dettaglio della riga.
  const handleReorder = async (e, id) => {
    e.stopPropagation();
    setReorderState(s => ({ ...s, [id]: { busy: true } }));
    try {
      await reorderOrder(id);
      setReorderState(s => ({ ...s, [id]: { done: true } }));
    } catch (err) {
      setReorderState(s => ({ ...s, [id]: { err: poolErrorMessage(err) } }));
    }
  };

  const Tab = ({ val, cur, set, children }) => (
    <button onClick={() => set(val)} style={{ padding:"7px 16px", borderRadius:100, fontSize:13, fontWeight:600, cursor:"pointer", border:`1.5px solid ${cur === val ? C.blue : C.border}`, background:cur === val ? "#EFF6FF" : "#fff", color:cur === val ? "#0369A1" : C.muted, fontFamily:"Inter,system-ui" }}>{children}</button>
  );

  return (
    <div style={{ background:"#fff", color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", colorScheme:"light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .or-num { font-family:'JetBrains Mono',monospace; }
        .or-row { display:grid; grid-template-columns:2fr 1.4fr 1fr 1.1fr 1.4fr auto; gap:12px; align-items:center; padding:14px 16px; border:1px solid ${C.border}; border-radius:12px; margin-bottom:10px; cursor:pointer; transition:box-shadow 0.15s; }
        .or-row:hover { box-shadow:0 6px 24px rgba(14,165,233,0.10); }
        @media (max-width:860px) { .or-row { grid-template-columns:1fr 1fr !important; gap:8px !important; } .or-nav-links { display:none !important; } }
      `}</style>

      {/* NAVBAR */}
      {!inShell && <BulkStrikeNav />}

      <div style={{ maxWidth:1200, margin:"0 auto", padding:"22px 20px 60px" }}>
        {/* BREADCRUMB */}
        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.muted, marginBottom:18 }}>
          <span onClick={() => { window.location.href = "/"; }} style={{ cursor:"pointer" }}>Home</span><ChevronRight size={13}/>
          <span style={{ color:C.text, fontWeight:600 }}>I miei ordini</span>
        </div>

        <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:"-0.02em", marginBottom:6 }}>I miei ordini</h1>
        <p style={{ fontSize:14, color:C.muted, marginBottom:20 }}>{nBuy} acquisti · {nSell} vendite</p>

        {/* FILTRI */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
          <Tab val="all" cur={roleF} set={setRoleF}>Tutti</Tab>
          <Tab val="buyer" cur={roleF} set={setRoleF}>🛒 Acquisti</Tab>
          <Tab val="supplier" cur={roleF} set={setRoleF}>🏭 Vendite</Tab>
          <span style={{ width:1, background:C.border, margin:"0 6px" }}/>
          <Tab val="all" cur={statusF} set={setStatusF}>Ogni stato</Tab>
          <Tab val="open" cur={statusF} set={setStatusF}>In corso</Tab>
          <Tab val="closed" cur={statusF} set={setStatusF}>Chiusi</Tab>
        </div>

        {err && <div style={{ marginBottom:14, padding:"11px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10, fontSize:13, color:C.red }}>{err}</div>}

        {loading ? (
          <div style={{ padding:"60px 0", textAlign:"center", color:C.muted }}>Caricamento ordini…</div>
        ) : needLogin ? (
          <div style={{ padding:"50px 20px", textAlign:"center", border:`1px solid ${C.border}`, borderRadius:14 }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Accedi per vedere i tuoi ordini</div>
            <button onClick={() => { window.location.href = "/login"; }} style={{ background:C.blue, color:"#fff", border:"none", borderRadius:9, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Accedi</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:"50px 20px", textAlign:"center", border:`1px solid ${C.border}`, borderRadius:14 }}>
            <Package size={32} color={C.border} style={{ marginBottom:10 }}/>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>{orders.length === 0 ? "Nessun ordine ancora" : "Nessun ordine con questi filtri"}</div>
            {orders.length === 0 && (
              <>
                <div style={{ fontSize:14, color:C.muted, marginBottom:16 }}>Sfoglia il catalogo per il tuo primo acquisto.</div>
                <button onClick={() => { window.location.href = "/catalogo"; }} style={{ background:C.blue, color:"#fff", border:"none", borderRadius:9, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:7, fontFamily:"Inter,system-ui" }}>Vai al catalogo <ArrowRight size={15}/></button>
              </>
            )}
          </div>
        ) : (
          <div>
            {filtered.map(o => {
              const st = statusOf(o.status);
              return (
                <div key={o.id} className="or-row" onClick={() => { window.location.href = `/ordine?id=${o.id}`; }}>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
                      {o.role === "buyer" ? <ShoppingCart size={14} color={C.blue}/> : <Store size={14} color={C.purple}/>}
                      <span style={{ fontSize:14.5, fontWeight:700 }}>{o.product_name}</span>
                      {o.reviewed && <span title="Recensione lasciata"><Star size={12} fill={C.amber} color={C.amber}/></span>}
                    </div>
                    <div style={{ fontSize:12, color:C.muted, marginTop:3 }}>
                      {o.role === "buyer" ? "da" : "per"} <b>{o.counterpart_name}</b> · <span className="or-num">{o.id.slice(0, 8)}</span>
                    </div>
                  </div>
                  <div>
                    <span style={{ display:"inline-block", fontSize:11.5, fontWeight:700, color:st.fg, background:st.bg, borderRadius:100, padding:"4px 11px" }}>{st.label}</span>
                  </div>
                  <div className="or-num" style={{ fontSize:13 }}>{Number(o.quantity_kg).toLocaleString("it-IT")} kg</div>
                  <div>
                    <div className="or-num" style={{ fontSize:14.5, fontWeight:800, color:C.blue }}>{eur(o.goods_subtotal)}</div>
                    <div className="or-num" style={{ fontSize:11, color:C.muted }}>{eur(o.unit_price_per_kg)}/kg</div>
                  </div>
                  <div style={{ fontSize:12.5, color:C.muted }}>
                    {new Date(o.created_at).toLocaleDateString("it-IT", { year:"numeric", month:"short", day:"numeric" })}
                    <div style={{ fontSize:11 }}>{new Date(o.created_at).toLocaleTimeString("it-IT", { hour:"2-digit", minute:"2-digit" })}</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"flex-end" }}>
                    {o.role === "buyer" && !OPEN_STATES.includes(o.status) && (() => {
                      const rs = reorderState[o.id] || {};
                      if (rs.done) return (
                        <span onClick={(e) => { e.stopPropagation(); window.location.href = "/carrello"; }} style={{ fontSize:12, fontWeight:700, color:C.green, cursor:"pointer", whiteSpace:"nowrap" }}>Aggiunto al carrello ✓ · Vai</span>
                      );
                      return (
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3 }}>
                          <button onClick={(e) => handleReorder(e, o.id)} disabled={rs.busy} style={{ padding:"6px 12px", borderRadius:100, fontSize:12, fontWeight:700, cursor:rs.busy?"default":"pointer", border:`1.5px solid ${C.blue}`, background:"#EFF6FF", color:"#0369A1", fontFamily:"Inter,system-ui", opacity:rs.busy?0.6:1, whiteSpace:"nowrap" }}>{rs.busy ? "Aggiungo…" : "Riordina"}</button>
                          {rs.err && <span style={{ fontSize:10.5, color:C.red, maxWidth:140, textAlign:"right" }}>{rs.err}</span>}
                        </div>
                      );
                    })()}
                    <ChevronRight size={16} color={C.muted}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
