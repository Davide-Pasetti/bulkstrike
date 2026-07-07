"use client";
// BulkStrikeCart — carrello acquisti (/carrello). DB-backed (tabella cart_items):
// il carrello segue l'account su qualsiasi dispositivo. Prezzi sempre ricalcolati
// server-side dai tier correnti (get_cart) — il client non decide mai un prezzo.
// I prezzi qui sono IVA e spedizione ESCLUSE: la spedizione viene stimata subito
// (indirizzo aziendale, provvisoria) e ricalcolata definitivamente al checkout
// dopo che il cliente ha scelto/confermato l'indirizzo di spedizione.
import { useState, useEffect, useMemo } from "react";
import { ShoppingCart, Trash2, ArrowRight, AlertTriangle, Package, ChevronRight } from "lucide-react";
import { getCart, upsertCartItem, removeCartItem, clearCart, getSession, poolErrorMessage, previewCheckout, getMyCompanyAddress, getShippingQuotes } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import { TrustBadge, IvaChip } from "@/components/BulkStrikeBadges";

const C = { blue: "#0EA5E9", dark: "#0284C7", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", amber: "#D97706" };
const eur = (n) => n == null ? "—" : "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CartPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [busyKey, setBusyKey] = useState(null); // `${product}|${supplier}` in aggiornamento
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(null);       // { goods_subtotal, shipping_amount, by_supplier, ... } da preview_checkout
  const [previewLoading, setPreviewLoading] = useState(false);

  const keyOf = (it) => `${it.product_id}|${it.supplier_company_id}`;

  async function reload() {
    try {
      const cart = await getCart();
      setItems(cart);
      if (cart.length === 0) { setPreview(null); return; }
      setPreviewLoading(true);
      try {
        // Indirizzo provvisorio: quello registrato dell'azienda, finché il
        // cliente non ne sceglie uno diverso al checkout.
        const addr = await getMyCompanyAddress().catch(() => null);
        const shippingAddress = addr ? [addr.address, addr.city, addr.country].filter(Boolean).join(", ") : null;

        // Selezione di default: il corriere più economico per ciascun fornitore
        // presente nel carrello — stessa logica del passo Pagamento del checkout.
        // Il cliente potrà cambiare corriere lì; qui è solo l'anteprima.
        const qtyBySupplier = new Map();
        for (const it of cart) {
          qtyBySupplier.set(it.supplier_company_id, (qtyBySupplier.get(it.supplier_company_id) || 0) + Number(it.quantity_kg));
        }
        const carrierSelections = {};
        await Promise.all([...qtyBySupplier.entries()].map(async ([supplierId, qty]) => {
          try {
            const res = await getShippingQuotes(supplierId, qty);
            if (res?.cheapest_id) carrierSelections[supplierId] = res.cheapest_id;
          } catch (e) {}
        }));

        setPreview(await previewCheckout(shippingAddress, carrierSelections));
      } catch (e) {}
      finally { setPreviewLoading(false); }
    } catch (e) { setErr(poolErrorMessage(e)); }
  }

  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      await reload();
      setLoading(false);
    })();
  }, []);

  async function changeQty(it, qty) {
    const q = Math.max(1, Math.round(Number(qty) || 0));
    setBusyKey(keyOf(it)); setErr("");
    try { await upsertCartItem(it.product_id, it.supplier_company_id, q); await reload(); }
    catch (e) { setErr(poolErrorMessage(e)); }
    finally { setBusyKey(null); }
  }

  async function removeLine(it) {
    setBusyKey(keyOf(it)); setErr("");
    try { await removeCartItem(it.product_id, it.supplier_company_id); await reload(); }
    catch (e) { setErr(poolErrorMessage(e)); }
    finally { setBusyKey(null); }
  }

  async function emptyAll() {
    setErr("");
    try { await clearCart(); await reload(); }
    catch (e) { setErr(poolErrorMessage(e)); }
  }

  // problemi che bloccano il checkout: prezzo mancante, offerta disattivata, sotto MOQ
  const lineIssue = (it) => {
    if (!it.offer_active) return "Offerta non più disponibile — rimuovi la riga";
    if (it.unit_price == null) return "Quantità fuori dagli scaglioni di prezzo del fornitore";
    if (it.min_order_kg != null && Number(it.quantity_kg) < Number(it.min_order_kg)) return `Sotto l'ordine minimo (${it.min_order_kg} kg)`;
    return null;
  };
  const issues = useMemo(() => items.filter(it => lineIssue(it)), [items]);
  const subtotal = useMemo(() => items.reduce((a, it) => a + (it.unit_price != null ? Number(it.unit_price) * Number(it.quantity_kg) : 0), 0), [items]);
  const totalKg = useMemo(() => items.reduce((a, it) => a + Number(it.quantity_kg), 0), [items]);

  return (
    <div style={{ background: "#fff", color: C.text, fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh", colorScheme: "light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .ct-num { font-family:'JetBrains Mono',monospace; }
        .ct-layout { display:grid; grid-template-columns:1fr 320px; gap:24px; align-items:start; }
        .ct-row { display:grid; grid-template-columns:2.2fr 1fr 1.2fr 1fr auto; gap:14px; align-items:center; padding:16px; border:1px solid ${C.border}; border-radius:12px; margin-bottom:10px; }
        .ct-link { cursor:pointer; font-weight:700; }
        .ct-link:hover { color:${C.blue}; text-decoration:underline; }
        @media (max-width:860px) {
          .ct-layout { grid-template-columns:1fr !important; }
          .ct-row { grid-template-columns:1fr 1fr !important; gap:10px !important; }
          .ct-nav-links { display:none !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <BulkStrikeNav />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "22px 20px 60px" }}>
        {/* BREADCRUMB */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginBottom: 18 }}>
          <span onClick={() => { window.location.href = "/"; }} style={{ cursor: "pointer" }}>Home</span><ChevronRight size={13} />
          <span style={{ color: C.text, fontWeight: 600 }}>Carrello</span>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <ShoppingCart size={26} color={C.blue} /> Carrello {items.length > 0 && <span style={{ fontSize: 15, fontWeight: 600, color: C.muted }}>({items.length} {items.length === 1 ? "riga" : "righe"})</span>}
        </h1>

        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: C.muted }}>Caricamento carrello…</div>
        ) : needLogin ? (
          <div style={{ padding: "50px 20px", textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Accedi per vedere il tuo carrello</div>
            <div style={{ fontSize: 14, color: C.muted, marginBottom: 16 }}>Il carrello è legato al tuo account e ti segue su ogni dispositivo.</div>
            <button onClick={() => { window.location.href = "/login"; }} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 9, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>Accedi</button>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: "50px 20px", textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <Package size={32} color={C.border} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Il carrello è vuoto</div>
            <div style={{ fontSize: 14, color: C.muted, marginBottom: 16 }}>Sfoglia il catalogo o i listini dei fornitori per aggiungere materie prime.</div>
            <button onClick={() => { window.location.href = "/catalogo"; }} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 9, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "Inter,system-ui" }}>Vai al catalogo <ArrowRight size={15} /></button>
          </div>
        ) : (
          <div className="ct-layout">
            {/* RIGHE */}
            <div>
              {err && <div style={{ marginBottom: 12, padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9, fontSize: 13, color: C.red }}>{err}</div>}
              {items.map(it => {
                const issue = lineIssue(it);
                const busy = busyKey === keyOf(it);
                return (
                  <div key={keyOf(it)} className="ct-row" style={{ opacity: busy ? 0.6 : 1, borderColor: issue ? "#FCA5A5" : C.border }}>
                    <div>
                      <div className="ct-link" onClick={() => { window.location.href = `/prodotto?id=${it.product_id}`; }} style={{ fontSize: 15 }}>{it.product_name}</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                        Fornitore: <span className="ct-link" onClick={() => { window.location.href = `/fornitore?id=${it.supplier_company_id}`; }} style={{ fontWeight: 600, fontSize: 12 }}>{it.supplier_name}</span>
                        {it.lead_time_days != null && <> · preparazione ordine {it.lead_time_days} gg</>}
                      </div>
                      {issue && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.red, marginTop: 5 }}><AlertTriangle size={12} /> {issue}</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>Quantità</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <input type="number" className="ct-num" min={1} defaultValue={it.quantity_kg} key={`${keyOf(it)}-${it.quantity_kg}`}
                          onBlur={e => { const v = Number(e.target.value); if (v > 0 && v !== Number(it.quantity_kg)) changeQty(it, v); }}
                          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                          style={{ width: 96, padding: "8px 9px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, outline: "none", textAlign: "right" }} />
                        <span style={{ fontSize: 12, color: C.muted }}>kg</span>
                      </div>
                      {it.min_order_kg != null && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>MOQ {it.min_order_kg} kg</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>Prezzo unitario <IvaChip /></div>
                      <div className="ct-num" style={{ fontSize: 15, fontWeight: 700, color: it.unit_price != null ? C.text : C.red }}>{it.unit_price != null ? `${eur(it.unit_price)}/kg` : "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>Totale riga <IvaChip /></div>
                      <div className="ct-num" style={{ fontSize: 16, fontWeight: 800, color: C.blue }}>{it.unit_price != null ? eur(Number(it.unit_price) * Number(it.quantity_kg)) : "—"}</div>
                    </div>
                    <button onClick={() => removeLine(it)} disabled={busy} title="Rimuovi"
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
              <button onClick={emptyAll} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 12.5, cursor: "pointer", textDecoration: "underline", fontFamily: "Inter,system-ui", padding: "4px 0" }}>Svuota carrello</button>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10 }}>Spedizione stimata sull'indirizzo aziendale nel riepilogo qui a fianco.</div>
            </div>

            {/* RIEPILOGO */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, position: "sticky", top: 84 }}>
              <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: C.muted, marginBottom: 14 }}>Riepilogo</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 8 }}>
                <span style={{ color: C.muted }}>Righe</span><span className="ct-num" style={{ fontWeight: 600 }}>{items.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 8 }}>
                <span style={{ color: C.muted }}>Volume totale</span><span className="ct-num" style={{ fontWeight: 600 }}>{totalKg.toLocaleString("it-IT")} kg</span>
              </div>

              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 8 }}>
                  <span style={{ color: C.muted }}>Materia prima</span>
                  <span className="ct-num" style={{ fontWeight: 600 }}>{eur(preview?.goods_subtotal ?? subtotal)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13.5, marginBottom: 8 }}>
                  <span style={{ color: C.green }}>Commissioni BulkStrike<br />sulle materie prime</span><span className="ct-num" style={{ fontWeight: 700, color: C.green }}>€0,00</span>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 8 }}>
                  <span style={{ color: C.muted }}>Spedizione (stima) {previewLoading && "…"}</span>
                  <span className="ct-num" style={{ fontWeight: 600 }}>{previewLoading ? "…" : eur(preview?.shipping_amount)}</span>
                </div>
                {(preview?.by_supplier || []).filter(s => s.product_count > 1).map(s => (
                  <div key={s.supplier_company_id} style={{ fontSize: 11, color: C.green, fontWeight: 600, marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                    <span>⊳ {s.supplier_name}: {s.product_count} prodotti, spedizione unica</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, margin: "8px 0 6px", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Totale <span style={{ fontWeight: 500, color: C.muted }}>(IVA esclusa)</span></span>
                <span className="ct-num" style={{ fontSize: 22, fontWeight: 800, color: C.blue }}>{previewLoading ? "…" : eur((preview?.goods_subtotal ?? subtotal) + (preview?.shipping_amount ?? 0))}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 12 }}>* Spedizione stimata sull'indirizzo della tua azienda — potrà cambiare se al checkout scegli un altro indirizzo. IVA esclusa.</div>
              {issues.length > 0 && (
                <div style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 12, color: "#9A3412", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 9, padding: "9px 11px", marginBottom: 12 }}>
                  <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                  <span>Risolvi {issues.length === 1 ? "il problema segnalato" : `i ${issues.length} problemi segnalati`} prima di procedere.</span>
                </div>
              )}
              <button onClick={() => { window.location.href = "/checkout"; }} disabled={issues.length > 0 || items.length === 0}
                style={{ width: "100%", justifyContent: "center", background: C.blue, color: "#fff", border: "none", borderRadius: 10, padding: "13px", fontSize: 14.5, fontWeight: 700, cursor: issues.length > 0 ? "default" : "pointer", opacity: issues.length > 0 ? 0.5 : 1, display: "flex", alignItems: "center", gap: 8, fontFamily: "Inter,system-ui" }}>
                Confronta i costi di spedizione <ArrowRight size={16} />
              </button>
              {/* Badge fiducia compatto (icona + 2 parole) — NON il paragrafo escrow
                  rimosso in precedenza: qui solo il segnale visivo, mai testo lungo. */}
              <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                <TrustBadge />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
