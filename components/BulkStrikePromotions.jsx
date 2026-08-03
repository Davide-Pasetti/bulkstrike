"use client";
// BulkStrikePromotions — pannello fornitore "Le mie promozioni" (/le-mie-promozioni).
// Il fornitore pubblica sconti FISSI a tempo (Bacheca Promozioni, DAV-76). NON è
// un'asta: prezzo bloccato per un periodo (max 14 giorni), max 2 all'anno per
// prodotto, sempre inferiore al prezzo medio di mercato. Ogni promozione passa
// dalla revisione admin prima di diventare attiva.
import { useState, useEffect } from "react";
import { Plus, X, Check, Clock, AlertTriangle, Tag, Calendar } from "lucide-react";
import {
  getSession, getMyCompany,
  getMyPromotions, getMySupplierListings, getPromotionBasePrice,
  createPromotion, promotionErrorMessage,
} from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706" };
const eur = (n) => n == null ? "—" : "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });
const kg = (n) => n == null ? "—" : Number(n).toLocaleString("it-IT") + " kg";
const dt = (iso) => iso ? new Date(iso).toLocaleDateString("it-IT", { day:"2-digit", month:"2-digit", year:"numeric" }) : "—";

const STATUS = {
  pending_review: { label:"In revisione", bg:"#FFFBEB", fg:C.amber, Icon:Clock },
  scheduled:      { label:"Programmata",  bg:"#EFF6FF", fg:"#1D4ED8", Icon:Calendar },
  active:         { label:"Attiva",        bg:"#ECFDF5", fg:C.green, Icon:Check },
  expired:        { label:"Scaduta",       bg:"#F1F5F9", fg:C.muted, Icon:Clock },
  cancelled:      { label:"Annullata",     bg:"#F1F5F9", fg:C.muted, Icon:X },
  rejected:       { label:"Rifiutata",     bg:"#FEF2F2", fg:C.red, Icon:AlertTriangle },
};

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending_review;
  const Icon = s.Icon;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:s.bg, color:s.fg, borderRadius:6, padding:"3px 9px", fontSize:12, fontWeight:700 }}>
      <Icon size={12} /> {s.label}
    </span>
  );
}

// default datetime-local: adesso e adesso+7 giorni, in ora locale.
function localInput(d) {
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function PromotionsPage({ inShell = false }) {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [notSupplier, setNotSupplier] = useState(false);
  const [promos, setPromos] = useState([]);
  const [quota, setQuota] = useState([]);
  const [listings, setListings] = useState([]);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [selListing, setSelListing] = useState(""); // supplier_product_id
  const [price, setPrice] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [availableKg, setAvailableKg] = useState("");
  const [base, setBase] = useState(undefined); // { avg_price, days_used } | null | undefined(caricamento)
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const session = await getSession().catch(() => null);
    if (!session) { setNeedLogin(true); setLoading(false); return; }
    const co = await getMyCompany().catch(() => null);
    if (!co?.is_supplier) { setNotSupplier(true); setLoading(false); return; }
    try {
      const [mine, ls] = await Promise.all([getMyPromotions(), getMySupplierListings()]);
      setPromos(mine.promotions || []);
      setQuota(mine.quota || []);
      setListings(ls || []);
    } catch (e) { setErr(promotionErrorMessage(e)); }
    setLoading(false);
  }

  // prodotto selezionato → { productId, supplierProductId, name }
  const sel = listings.find((l) => l.id === selListing);
  const selProductId = sel?.product?.id || null;
  const quotaFor = quota.find((q) => q.product_id === selProductId);
  const quotaBlocked = quotaFor && quotaFor.used >= 2;

  // quando cambia il prodotto, carica il prezzo di riferimento di mercato
  useEffect(() => {
    if (!selProductId) { setBase(undefined); return; }
    let alive = true;
    setBase(undefined);
    getPromotionBasePrice(selProductId)
      .then((b) => { if (alive) setBase(b); })
      .catch(() => { if (alive) setBase(null); }); // storico insufficiente
    return () => { alive = false; };
  }, [selProductId]);

  const baseLabelText = (b) => {
    const n = Number(b.days_used) || 0;
    return n >= 180
      ? `Prezzo medio di mercato: ${eur(b.avg_price)}/kg (ultimi 6 mesi)`
      : `Prezzo medio di mercato: ${eur(b.avg_price)}/kg (ultimi ${n} ${n === 1 ? "giorno" : "giorni"} — storico in accumulo)`;
  };

  const previewDiscount = (() => {
    const p = Number(price), a = base ? Number(base.avg_price) : 0;
    if (!p || !a || p >= a) return null;
    return Math.round((1 - p / a) * 1000) / 10;
  })();

  function openForm() {
    setErr(""); setOkMsg("");
    setSelListing(""); setPrice(""); setAvailableKg(""); setBase(undefined);
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);
    setStartsAt(localInput(now));
    setEndsAt(localInput(in7));
    setShowForm(true);
  }

  async function submit() {
    setErr("");
    if (!sel) { setErr("Seleziona un prodotto del tuo listino."); return; }
    if (!price || Number(price) <= 0) { setErr("Inserisci un prezzo promozionale valido."); return; }
    if (!startsAt || !endsAt) { setErr("Imposta inizio e fine della promozione."); return; }
    setSaving(true);
    try {
      await createPromotion({
        productId: sel.product.id,
        supplierProductId: sel.id,
        pricePerKg: Number(price),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        availableKg: availableKg ? Number(availableKg) : null,
      });
      setOkMsg("Promozione inviata: sarà pubblicata dopo la revisione.");
      setShowForm(false);
      await load();
    } catch (e) {
      setErr(promotionErrorMessage(e));
    }
    setSaving(false);
  }

  const Body = (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: inShell ? 0 : "0 20px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:12, marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:800, color:C.text, margin:0 }}>Le mie promozioni</h1>
          <p style={{ fontSize:14, color:C.muted, marginTop:6, maxWidth:620 }}>
            Sconti fissi a tempo sul tuo listino. Prezzo bloccato per massimo 14 giorni, sempre inferiore al prezzo medio di mercato. Massimo 2 promozioni all'anno per prodotto. Ogni promozione è pubblicata dopo la revisione.
          </p>
        </div>
        {!showForm && (
          <button onClick={openForm} style={{ background:C.amber, color:"#fff", border:"none", borderRadius:10, padding:"11px 18px", fontSize:14, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:8 }}>
            <Plus size={16} /> Nuova promozione
          </button>
        )}
      </div>

      {okMsg && <div style={{ background:"#ECFDF5", color:C.green, border:"1px solid #A7F3D0", borderRadius:10, padding:"10px 14px", fontSize:14, marginBottom:16 }}>{okMsg}</div>}
      {err && !showForm && <div style={{ background:"#FEF2F2", color:C.red, border:"1px solid #FECACA", borderRadius:10, padding:"10px 14px", fontSize:14, marginBottom:16 }}>{err}</div>}

      {/* FORM */}
      {showForm && (
        <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, padding:20, marginBottom:24 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <strong style={{ fontSize:16 }}>Nuova promozione</strong>
            <button onClick={() => setShowForm(false)} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted }}><X size={18} /></button>
          </div>

          {listings.length === 0 ? (
            <div style={{ fontSize:14, color:C.muted }}>Non hai ancora prodotti a listino. Aggiungi un prodotto in <a href="/i-miei-prodotti" style={{ color:C.blue }}>Listino prodotti</a> per poter creare una promozione.</div>
          ) : (
            <div style={{ display:"grid", gap:14 }}>
              <label style={{ fontSize:13, fontWeight:600, color:C.muted }}>
                Prodotto
                <select value={selListing} onChange={(e) => setSelListing(e.target.value)}
                  style={{ marginTop:6, width:"100%", padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, background:"#fff" }}>
                  <option value="">— Seleziona —</option>
                  {listings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.product?.canonical_name}{l.grade ? ` — ${l.grade}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {/* riferimento di mercato + quota */}
              {selProductId && (
                <div style={{ background:C.bg, borderRadius:10, padding:"10px 14px", fontSize:13, color:C.text, display:"grid", gap:6 }}>
                  {base === undefined && <span style={{ color:C.muted }}>Carico il prezzo di riferimento…</span>}
                  {base === null && <span style={{ color:C.red }}>Storico prezzi insufficiente per questo prodotto: non è ancora possibile creare una promozione.</span>}
                  {base && <span>{baseLabelText(base)}</span>}
                  {quotaFor && (
                    <span style={{ color: quotaBlocked ? C.red : C.muted }}>
                      Promozioni usate quest'anno: <strong>{quotaFor.used}/2</strong>
                      {quotaBlocked && quotaFor.next_available_at ? ` — la prossima dal ${dt(quotaFor.next_available_at)}` : ""}
                    </span>
                  )}
                  {!quotaFor && <span style={{ color:C.muted }}>Promozioni usate quest'anno: <strong>0/2</strong></span>}
                </div>
              )}

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                <label style={{ fontSize:13, fontWeight:600, color:C.muted }}>
                  Prezzo promozionale (€/kg)
                  <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}
                    style={{ marginTop:6, width:"100%", padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, fontFamily:"'JetBrains Mono',monospace" }} />
                </label>
                <label style={{ fontSize:13, fontWeight:600, color:C.muted }}>
                  Quantità disponibile (kg, opzionale)
                  <input type="number" min={1} step={1} value={availableKg} onChange={(e) => setAvailableKg(e.target.value)} placeholder="illimitata"
                    style={{ marginTop:6, width:"100%", padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, fontFamily:"'JetBrains Mono',monospace" }} />
                </label>
                <label style={{ fontSize:13, fontWeight:600, color:C.muted }}>
                  Inizio
                  <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
                    style={{ marginTop:6, width:"100%", padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14 }} />
                </label>
                <label style={{ fontSize:13, fontWeight:600, color:C.muted }}>
                  Fine (max 14 giorni dopo l'inizio)
                  <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                    style={{ marginTop:6, width:"100%", padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:14 }} />
                </label>
              </div>

              {previewDiscount != null && (
                <div style={{ fontSize:14, color:C.green, fontWeight:600 }}>Sconto risultante: -{previewDiscount}% rispetto al prezzo medio di mercato.</div>
              )}

              {err && <div style={{ background:"#FEF2F2", color:C.red, border:"1px solid #FECACA", borderRadius:8, padding:"9px 12px", fontSize:14 }}>{err}</div>}

              <div>
                <button onClick={submit} disabled={saving || quotaBlocked || base === null || !base}
                  style={{ background: (saving||quotaBlocked||base===null||!base) ? "#F59E0B99" : C.amber, color:"#fff", border:"none", borderRadius:10, padding:"12px 20px", fontSize:15, fontWeight:700, cursor:(saving||quotaBlocked||base===null||!base)?"default":"pointer" }}>
                  {saving ? "Invio…" : "Invia in revisione"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* LISTA */}
      {loading ? (
        <div style={{ color:C.muted, fontSize:14 }}>Carico…</div>
      ) : promos.length === 0 ? (
        <div style={{ border:`1px dashed ${C.border}`, borderRadius:16, padding:"36px 24px", textAlign:"center", color:C.muted }}>
          <Tag size={26} style={{ color:C.amber }} />
          <div style={{ fontSize:16, fontWeight:700, color:C.text, margin:"10px 0 4px" }}>Nessuna promozione</div>
          <div style={{ fontSize:14 }}>Pubblica il tuo primo sconto a tempo per comparire nella Bacheca Promozioni.</div>
        </div>
      ) : (
        <div style={{ display:"grid", gap:12 }}>
          {promos.map((p) => (
            <div key={p.id} style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:16, display:"flex", justifyContent:"space-between", gap:16, flexWrap:"wrap", alignItems:"center" }}>
              <div style={{ minWidth:220 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4, flexWrap:"wrap" }}>
                  <strong style={{ fontSize:15, color:C.text }}>{p.product_name}</strong>
                  <StatusBadge status={p.status} />
                </div>
                <div style={{ fontSize:13, color:C.muted }}>{dt(p.starts_at)} → {dt(p.ends_at)}</div>
                {p.status === "rejected" && p.rejection_reason && (
                  <div style={{ fontSize:12.5, color:C.red, marginTop:4 }}>Motivo: {p.rejection_reason}</div>
                )}
              </div>
              <div style={{ display:"flex", gap:22, flexWrap:"wrap", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:11, color:C.muted }}>Prezzo promo</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:700, color:C.amber }}>{eur(p.discounted_price_per_kg)}/kg</div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:C.muted }}>Sconto</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:700, color:C.green }}>-{p.discount_percent}%</div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:C.muted }}>Venduto</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:16, fontWeight:700, color:C.text }}>
                    {kg(p.sold_kg)}{p.available_kg != null ? ` / ${kg(p.available_kg)}` : ""}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (needLogin) {
    return <div style={{ padding:40, textAlign:"center" }}>Devi <a href="/auth/login" style={{ color:C.blue }}>accedere</a> per gestire le promozioni.</div>;
  }
  if (notSupplier) {
    return <div style={{ padding:40, textAlign:"center", color:C.muted }}>Questa sezione è riservata ai fornitori.</div>;
  }

  if (inShell) return Body;
  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif", color:C.text }}>
      <BulkStrikeNav />
      <div style={{ padding:"28px 0 60px" }}>{Body}</div>
    </div>
  );
}
