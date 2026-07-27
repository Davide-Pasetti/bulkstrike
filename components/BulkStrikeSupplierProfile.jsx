"use client";
// BulkStrikeSupplierProfile — profilo pubblico del fornitore (/fornitore?id=...).
// Dati da get_supplier_profile(): solo campi business pubblici (whitelist lato DB).
// Da qui si può ordinare direttamente ogni prodotto del listino (Acquisto Rapido).
import { useState, useEffect, useMemo, useRef } from "react";
import { Search, Star, ShieldCheck, MapPin, Phone, Globe, Mail, User, FileText, Package, Layers, Award, Clock, ChevronRight, ArrowRight, Flame, Building2, Truck, ExternalLink, Check, X, MessageSquare, Send, ShoppingCart } from "lucide-react";
import { getSupplierProfile, getSession, upsertCartItem, poolErrorMessage, getSupplierReviews, getReviewableOrders, submitReview, getCart, followSupplier, unfollowSupplier, isFollowingSupplier } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import LoginGate from "@/components/BulkStrikeLoginGate";
import { BSIcon } from "@/components/BSLogo";
import { IvaChip, SupplierTypeBadges } from "@/components/BulkStrikeBadges";
import CountryFlag from "@/components/CountryFlag";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706", purple:"#7C3AED" };

const TYPE_LABEL = { producer:"Produttore", distributor:"Distributore", trader:"Trader" };
const eurKg = (n) => n == null ? "—" : "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });
const eur = (n) => n == null ? "—" : "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });
// Bottone Segui/Non seguire (tabella supplier_follows, RPC follow/unfollow):
// stato letto al mount; se l'utente non è loggato il click porta al login.
function FollowButton({ supplierId }) {
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supplierId) return;
    isFollowingSupplier(supplierId).then(setFollowing).catch(() => {});
  }, [supplierId]);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (following) { await unfollowSupplier(supplierId); setFollowing(false); }
      else { await followSupplier(supplierId); setFollowing(true); }
    } catch {
      // non loggato (o azienda mancante): il follow richiede un account
      window.location.href = "/auth/login";
    } finally { setBusy(false); }
  }
  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      title={following ? "Smetti di seguire questo fornitore" : "Aggiungi ai fornitori preferiti"}
      style={{ display:"inline-flex", alignItems:"center", gap:7, background:following ? "#FEF3C7" : "#fff", color:following ? "#B45309" : C.text, border:`1.5px solid ${following ? "#FDE68A" : C.border}`, borderRadius:9, padding:"10px 16px", fontSize:13.5, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui", opacity:busy ? 0.6 : 1 }}
    >
      <Star size={15} fill={following ? "#D97706" : "none"} color={following ? "#D97706" : C.muted} />
      {following ? "Lo segui" : "Segui"}
    </button>
  );
}

// stima spedizione per paese fornitore — stessa logica di BulkStrikeProduct.jsx
function shipFor(country) {
  if (country === "Italia") return { shipBase:80, shipKg:0.05 };
  const eu = ["Francia","Germania","Spagna","Polonia","Paesi Bassi","Portogallo","Belgio","Austria"];
  if (eu.includes(country)) return { shipBase:100, shipKg:0.06 };
  return { shipBase:180, shipKg:0.12 }; // extra-UE
}

function Stars({ value = 0 }) {
  const full = Math.round(Number(value) || 0);
  return (
    <span style={{ display:"inline-flex", gap:1 }}>
      {[1,2,3,4,5].map(i => <Star key={i} size={14} fill={i <= full ? C.amber : "none"} color={C.amber} />)}
    </span>
  );
}

// riga "etichetta — valore" per le card informative
function Row({ icon:Icon, label, children }) {
  return (
    <div style={{ display:"flex", gap:10, alignItems:"flex-start", padding:"9px 0", borderBottom:`1px solid ${C.border}` }}>
      <Icon size={15} color={C.muted} style={{ marginTop:2, flexShrink:0 }} />
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:11, color:C.muted, marginBottom:1 }}>{label}</div>
        <div style={{ fontSize:13.5, color:C.text, fontWeight:600, wordBreak:"break-word" }}>{children || "—"}</div>
      </div>
    </div>
  );
}

export default function SupplierPage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [needLogin, setNeedLogin] = useState(false); // get_supplier_profile è solo per autenticati
  const [tableQ, setTableQ] = useState("");
  const [qtyById, setQtyById] = useState({});          // product_id → kg
  const [orderState, setOrderState] = useState({});    // product_id → { busy, ok, err }
  const [globalMsg, setGlobalMsg] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewableOrders, setReviewableOrders] = useState([]);
  const [reviewOrderId, setReviewOrderId] = useState(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHoverRating, setReviewHoverRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewState, setReviewState] = useState({}); // { busy, ok, err }
  const [alreadyInCart, setAlreadyInCart] = useState(false); // hai già prodotti di QUESTO fornitore nel carrello → spedizione si consolida
  const reviewsRef = useRef(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { setLoading(false); setNotFound(true); return; }
    (async () => {
      try {
        const session = await getSession().catch(() => null);
        if (!session) { setNeedLogin(true); return; }
        const p = await getSupplierProfile(id);
        if (p) {
          setProfile(p);
          getSupplierReviews(id).then(setReviews).catch(() => {});
          getReviewableOrders(id).then(rows => { setReviewableOrders(rows); if (rows[0]) setReviewOrderId(rows[0].order_id); }).catch(() => {});
          getCart().then(items => setAlreadyInCart((items || []).some(it => it.supplier_company_id === id))).catch(() => {});
        } else setNotFound(true);
      } catch (e) { setNotFound(true); }
      finally { setLoading(false); }
    })();
  }, []);

  async function handleSubmitReview() {
    if (!reviewOrderId) return;
    if (reviewRating < 1) { setReviewState({ err:"Seleziona un punteggio da 1 a 5 stelle." }); return; }
    setReviewState({ busy:true });
    try {
      await submitReview(reviewOrderId, reviewRating, reviewComment);
      const id = profile.id;
      const [freshReviews, freshOrders] = await Promise.all([getSupplierReviews(id), getReviewableOrders(id)]);
      setReviews(freshReviews);
      setReviewableOrders(freshOrders);
      setReviewOrderId(freshOrders[0]?.order_id || null);
      setReviewRating(0);
      setReviewComment("");
      setReviewState({ ok:true });
    } catch (e) {
      setReviewState({ err: poolErrorMessage(e) });
    }
  }

  const products = profile?.products || [];
  const filteredProducts = useMemo(() => {
    const s = tableQ.trim().toLowerCase();
    if (!s) return products;
    return products.filter(p =>
      (p.name || "").toLowerCase().includes(s) ||
      (p.cas_number || "").toLowerCase().includes(s) ||
      (p.e_number || "").toLowerCase().includes(s) ||
      (p.sector || "").toLowerCase().includes(s));
  }, [products, tableQ]);

  const qtyFor = (p) => qtyById[p.product_id] ?? Math.max(p.min_order_kg || 25, 100);
  const setQtyFor = (p, v) => setQtyById(prev => ({ ...prev, [p.product_id]: Math.max(1, Math.round(Number(v) || 0)) }));

  async function handleAddToCart(p) {
    setGlobalMsg("");
    setOrderState(prev => ({ ...prev, [p.product_id]: { busy:true } }));
    try {
      const session = await getSession();
      if (!session) { setOrderState(prev => ({ ...prev, [p.product_id]: {} })); setGlobalMsg("login"); return; }
      await upsertCartItem(p.product_id, profile.id, qtyFor(p));
      setOrderState(prev => ({ ...prev, [p.product_id]: { cart:true } }));
    } catch (e) {
      setOrderState(prev => ({ ...prev, [p.product_id]: { err: poolErrorMessage(e) } }));
    }
  }

  async function handleOrder(p) {
    setGlobalMsg("");
    setOrderState(prev => ({ ...prev, [p.product_id]: { busy:true } }));
    try {
      const session = await getSession();
      if (!session) {
        setOrderState(prev => ({ ...prev, [p.product_id]: {} }));
        setGlobalMsg("login");
        return;
      }
      const kg = qtyFor(p);
      if (p.min_order_kg && kg < p.min_order_kg) {
        setOrderState(prev => ({ ...prev, [p.product_id]: { err:`Minimo ${p.min_order_kg} kg per questo prodotto` } }));
        return;
      }
      await upsertCartItem(p.product_id, profile.id, kg);
      window.location.href = "/carrello";
    } catch (e) {
      setOrderState(prev => ({ ...prev, [p.product_id]: { err: poolErrorMessage(e) } }));
    }
  }

  const mapsQuery = profile ? [profile.address, profile.city, profile.country].filter(Boolean).join(", ") : "";
  const mapsUrl = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : null;
  // (il vecchio mailto di contatto è stato sostituito dalla messaggistica
  // interna: bottone "Contatta il fornitore" → /messaggi?to=<id>)
  const avgLead = products.length ? Math.round(products.reduce((a, p) => a + (p.lead_time_days || 0), 0) / products.length) : null;
  const initials = (profile?.name || "?").split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();

  // ── loader / not found ──
  if (loading) {
    return (
      <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, fontFamily:"'Inter',system-ui,sans-serif" }}>
        <BSIcon size={40} uid="load" />
        <div style={{ fontSize:14, color:C.muted }}>Caricamento profilo fornitore…</div>
      </div>
    );
  }
  if (needLogin) {
    return (
      <div style={{ background:"#fff", color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", colorScheme:"light" }}>
        <BulkStrikeNav />
        <div style={{ maxWidth:1280, margin:"0 auto", padding:"22px 20px 60px" }}>
          <LoginGate
            title="Accedi per vedere il profilo del fornitore"
            subtitle="I profili dei fornitori verificati — con listino, certificazioni e recensioni — sono riservati agli utenti registrati."
          />
        </div>
      </div>
    );
  }
  if (notFound || !profile) {
    return (
      <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, fontFamily:"'Inter',system-ui,sans-serif", padding:20, textAlign:"center" }}>
        <BSIcon size={40} uid="nf" />
        <div style={{ fontSize:17, fontWeight:700, color:C.text }}>Fornitore non trovato</div>
        <div style={{ fontSize:14, color:C.muted, maxWidth:380 }}>Il profilo richiesto non esiste o non è ancora verificato.</div>
        <button onClick={() => { window.location.href = "/fornitori"; }} style={{ marginTop:6, background:C.blue, color:"#fff", border:"none", borderRadius:9, padding:"11px 22px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Vai all'anagrafica fornitori</button>
      </div>
    );
  }

  return (
    <div style={{ background:"#fff", color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", colorScheme:"light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .sup-num { font-family:'JetBrains Mono',monospace; }
        .sup-grid { display:grid; grid-template-columns:1fr 330px; gap:24px; align-items:start; }
        .sup-card { border:1px solid ${C.border}; border-radius:14px; padding:18px; background:#fff; }
        .sup-chip { display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; border-radius:100px; padding:4px 11px; border:1px solid ${C.border}; background:${C.bg}; color:${C.text}; cursor:pointer; transition:all 0.12s; }
        .sup-chip:hover { border-color:${C.blue}; color:${C.blue}; }
        .sup-prow { display:grid; grid-template-columns:2fr 1.1fr 0.8fr 0.8fr 1.4fr; gap:12px; align-items:center; padding:12px 14px; border-bottom:1px solid ${C.border}; }
        .sup-prow:hover { background:${C.bg}; }
        .sup-plink { cursor:pointer; font-weight:700; }
        .sup-plink:hover { color:${C.blue}; text-decoration:underline; }
        .sup-stat { text-align:center; padding:14px 8px; }
        @media (max-width:900px) {
          .sup-grid { grid-template-columns:1fr !important; }
          .sup-prow { grid-template-columns:1fr 1fr !important; gap:8px !important; }
          .sup-nav-links { display:none !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <BulkStrikeNav />

      <div style={{ maxWidth:1200, margin:"0 auto", padding:"20px 20px 60px" }}>

        {/* BREADCRUMB */}
        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.muted, marginBottom:18, flexWrap:"wrap" }}>
          <span onClick={() => { window.location.href = "/"; }} style={{ cursor:"pointer" }}>Home</span><ChevronRight size={13}/>
          <span onClick={() => { window.location.href = "/fornitori"; }} style={{ cursor:"pointer" }}>Fornitori</span><ChevronRight size={13}/>
          <span style={{ color:C.text, fontWeight:600 }}>{profile.name}</span>
        </div>

        {/* HEADER */}
        <div style={{ display:"flex", gap:18, alignItems:"flex-start", marginBottom:24, flexWrap:"wrap" }}>
          {/* logo o iniziali */}
          <div style={{ width:92, height:92, borderRadius:18, background:"#EFF6FF", border:"1px solid #BFDBFE", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden" }}>
            {profile.logo_url
              ? <img src={profile.logo_url} alt={profile.name} style={{ width:"100%", height:"100%", objectFit:"contain" }} />
              : <span style={{ fontSize:30, fontWeight:900, color:C.blue, letterSpacing:"-0.02em" }}>{initials}</span>}
          </div>
          <div style={{ flex:1, minWidth:260 }}>
            <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" }}>
              {profile.status === "verified"
                ? <span style={{ display:"inline-flex", alignItems:"center", gap:4, background:"#ECFDF5", color:C.green, borderRadius:100, padding:"3px 10px", fontSize:12, fontWeight:700 }}><ShieldCheck size={12}/> Verificato</span>
                : <span title="Profilo censito su BulkStrike, non ancora controllato dal nostro team" style={{ display:"inline-flex", alignItems:"center", gap:4, background:"#FFFBEB", color:"#B45309", borderRadius:100, padding:"3px 10px", fontSize:12, fontWeight:700, cursor:"help" }}><Clock size={12}/> In attesa di verifica</span>}
              <span style={{ background:"#EFF6FF", color:"#1D4ED8", borderRadius:100, padding:"3px 10px", fontSize:12, fontWeight:700 }}>{TYPE_LABEL[profile.supplier_type] || profile.supplier_type || "Fornitore"}</span>
              {profile.site_rank && <span style={{ background:"#FEF3C7", color:"#B45309", borderRadius:100, padding:"3px 10px", fontSize:12, fontWeight:800 }}>#{profile.site_rank} su {profile.suppliers_total} su BulkStrike</span>}
            </div>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:14, flexWrap:"wrap" }}>
              <div>
                <h1 style={{ display:"flex", alignItems:"center", gap:10, fontSize:30, fontWeight:800, letterSpacing:"-0.02em", marginBottom:6 }}>
                  <CountryFlag code={profile.country_iso2} country={profile.country} size={20} />
                  <span>{profile.name}</span>
                  <SupplierTypeBadges roles={profile.roles} type={profile.supplier_type} size={20} />
                </h1>
                <div style={{ display:"flex", alignItems:"center", gap:14, fontSize:13.5, color:C.muted, flexWrap:"wrap" }}>
                  <span className="bs-suplink" onClick={() => reviewsRef.current?.scrollIntoView({ behavior:"smooth", block:"start" })} style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                    <Stars value={profile.rating} /> <b style={{ color:C.text }}>{profile.rating != null ? Number(profile.rating).toFixed(1) : "—"}</b> <span style={{ textDecoration:"underline" }}>({profile.reviews_count ?? 0} recensioni)</span>
                  </span>
                  <span style={{ display:"flex", alignItems:"center", gap:4 }}><CountryFlag country={profile.country} /> {profile.country}{profile.city ? ` · ${profile.city}` : ""}</span>
                  <span>Su BulkStrike dal {profile.member_since}</span>
                </div>
              </div>
              {/* Messaggistica interna (thread buyer↔fornitore) — sostituisce il
                  vecchio mailto: funziona per ogni fornitore visibile, anche non
                  ancora verificato (DAV-33: se l'azienda non è rivendicata parte
                  una email di cortesia al suo support_email, senza contatti del
                  mittente). Storico su /messaggi. Accanto: Segui/Non seguire. */}
              <div style={{ flexShrink:0, display:"flex", gap:8, flexWrap:"wrap" }}>
                <a href={`/messaggi?to=${profile.id}`} style={{ display:"inline-flex", alignItems:"center", gap:7, background:C.blue, color:"#fff", border:"none", borderRadius:9, padding:"10px 18px", fontSize:13.5, fontWeight:700, textDecoration:"none" }}>
                  <MessageSquare size={15}/> Contatta il fornitore
                </a>
                <FollowButton supplierId={profile.id} />
              </div>
            </div>
            {profile.description && <p style={{ fontSize:14, color:C.muted, lineHeight:1.6, marginTop:10, maxWidth:640 }}>{profile.description}</p>}
          </div>
        </div>

        {/* STATS BAR */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:0, border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden", marginBottom:24, background:C.bg }}>
          {[
            { icon:Package, label:"Prodotti a listino", val:products.length },
            { icon:Layers, label:"Settori coperti", val:(profile.sectors || []).length },
            { icon:Award, label:"Certificazioni", val:(profile.certifications || []).length },
            { icon:Clock, label:"Preparazione media", val:avgLead != null ? `${avgLead} gg` : "—" },
            { icon:Globe, label:"Paesi serviti", val:(profile.countries_served || []).length || "—" },
          ].map(({ icon:Icon, label, val }) => (
            <div key={label} className="sup-stat" style={{ borderRight:`1px solid ${C.border}` }}>
              <Icon size={16} color={C.blue} style={{ marginBottom:4 }} />
              <div className="sup-num" style={{ fontSize:22, fontWeight:800, color:C.text }}>{val}</div>
              <div style={{ fontSize:11.5, color:C.muted }}>{label}</div>
            </div>
          ))}
        </div>

        <div className="sup-grid">
          {/* ── COLONNA SINISTRA ── */}
          <div>
            {/* SETTORI */}
            <div className="sup-card" style={{ marginBottom:18 }}>
              <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:12 }}>Settori in cui vende</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                {(profile.sectors || []).map(s => (
                  <span key={s.slug} className="sup-chip" onClick={() => { window.location.href = `/catalogo?macro=${encodeURIComponent(s.macro_slug || "")}&sector=${encodeURIComponent(s.slug)}`; }}>
                    <span>{s.icon || "📦"}</span>{s.name}
                  </span>
                ))}
                {(profile.sectors || []).length === 0 && <span style={{ fontSize:13, color:C.muted }}>Nessun settore attivo.</span>}
              </div>
            </div>

            {/* CERTIFICAZIONI */}
            <div className="sup-card" style={{ marginBottom:18 }}>
              <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:12 }}>Certificazioni dichiarate</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
                {(profile.certifications || []).map(c => (
                  <span key={c} style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12, fontWeight:700, borderRadius:100, padding:"4px 11px", background:"#ECFDF5", color:C.green, border:"1px solid #A7F3D0" }}>
                    <Check size={11}/>{c}
                  </span>
                ))}
                {(profile.certifications || []).length === 0 && <span style={{ fontSize:13, color:C.muted }}>Nessuna certificazione dichiarata.</span>}
              </div>
              <div style={{ fontSize:11.5, color:C.muted, marginTop:10 }}>Le certificazioni sono dichiarate dal fornitore per le singole offerte a listino.</div>
            </div>

            {/* LISTINO PRODOTTI + ORDINE */}
            <div className="sup-card" style={{ padding:0, overflow:"hidden" }}>
              <div style={{ padding:"16px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted }}>Listino prodotti ({filteredProducts.length})</div>
                <div style={{ display:"flex", alignItems:"center", gap:6, border:`1.5px solid ${C.border}`, borderRadius:9, padding:"7px 10px", minWidth:220 }}>
                  <Search size={14} color={C.muted}/>
                  <input value={tableQ} onChange={e => setTableQ(e.target.value)} placeholder="Cerca nel listino…" style={{ border:"none", outline:"none", fontSize:13, flex:1, fontFamily:"Inter,system-ui" }} />
                </div>
              </div>

              {globalMsg === "login" && (
                <div style={{ margin:"12px 18px 0", padding:"10px 14px", background:"#FFF7ED", border:"1px solid #FED7AA", borderRadius:9, fontSize:13, color:"#9A3412" }}>
                  Per ordinare devi <span onClick={() => { window.location.href = "/login"; }} style={{ fontWeight:800, cursor:"pointer", textDecoration:"underline" }}>accedere</span> o <span onClick={() => { window.location.href = "/registrati"; }} style={{ fontWeight:800, cursor:"pointer", textDecoration:"underline" }}>registrarti</span> come acquirente.
                </div>
              )}

              {/* intestazione tabella (solo desktop) */}
              <div className="sup-prow" style={{ background:C.bg, fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.04em", color:C.muted }}>
                <span>Prodotto</span><span>Grado / cert.</span><span>MOQ</span><span>Preparazione</span><span style={{ textAlign:"right" }}>Prezzo & ordine</span>
              </div>
              <div style={{ fontSize:10.5, color:C.muted, textAlign:"right", padding:"6px 20px 0" }}>L'IVA la vedi al checkout, dopo l'indirizzo. Spedizione stimata, inclusa nel totale.</div>

              <div style={{ maxHeight:560, overflowY:"auto" }}>
                {filteredProducts.map(p => {
                  const st = orderState[p.product_id] || {};
                  return (
                    <div key={p.product_id} className="sup-prow">
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                          <span className="sup-plink" onClick={() => { window.location.href = `/prodotto?id=${p.product_id}`; }} style={{ fontSize:14 }}>{p.name}</span>
                          {p.has_pool && <span style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:10, fontWeight:800, color:"#B45309", background:"#FEF3C7", borderRadius:100, padding:"2px 7px" }}><Flame size={10}/>ASTA</span>}
                        </div>
                        <div style={{ fontSize:11.5, color:C.muted, marginTop:2 }}>{p.sector || "—"}{p.e_number ? ` · ${p.e_number}` : ""}{p.cas_number ? ` · CAS ${p.cas_number}` : ""}</div>
                      </div>
                      <div style={{ fontSize:12, color:C.muted }}>
                        <div>{p.grade || "—"}</div>
                        <div style={{ marginTop:2 }}>{(p.certifications || []).join(" · ") || "—"}</div>
                      </div>
                      <div className="sup-num" style={{ fontSize:12.5 }}>{p.min_order_kg != null ? `${p.min_order_kg} kg` : "—"}</div>
                      <div className="sup-num" style={{ fontSize:12.5 }}>{p.lead_time_days != null ? `${p.lead_time_days} gg` : "—"}</div>
                      <div style={{ textAlign:"right" }}>
                        <div className="sup-num" style={{ fontSize:16, fontWeight:800, color:C.blue, marginBottom:2 }}>{eurKg(p.best_price)}<span style={{ fontSize:11, fontWeight:400, color:C.muted }}>/kg</span> <IvaChip style={{ verticalAlign:"1px" }} /></div>
                        {p.best_price != null && (() => {
                          const kg = qtyFor(p);
                          const ship = shipFor(profile.country);
                          const shipping = ship.shipBase + ship.shipKg * kg;
                          const goods = p.best_price * kg;
                          return (
                            <div style={{ fontSize:10.5, color:C.muted, marginBottom:6 }}>
                              + spedizione {eur(shipping)} · tot. {eur(goods + shipping)} <span style={{ fontWeight:400 }}>IVA escl.</span>
                              {alreadyInCart && <div style={{ color:C.green, fontWeight:700 }}>✓ si consolida col carrello</div>}
                            </div>
                          );
                        })()}
                        {st.cart ? (
                          <div style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12, fontWeight:700, color:C.green }}>
                            <Check size={13}/> Nel carrello · <span onClick={() => { window.location.href = "/carrello"; }} style={{ cursor:"pointer", textDecoration:"underline" }}>vai al carrello</span>
                          </div>
                        ) : st.ok ? (
                          <div style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12, fontWeight:700, color:C.green }}>
                            <Check size={13}/> Ordine creato · <span onClick={() => { window.location.href = "/dashboard"; }} style={{ cursor:"pointer", textDecoration:"underline" }}>vai agli ordini</span>
                          </div>
                        ) : (
                          <div style={{ display:"inline-flex", alignItems:"center", gap:6, flexWrap:"wrap", justifyContent:"flex-end" }}>
                            <input type="number" min={p.min_order_kg || 1} value={qtyFor(p)} onChange={e => setQtyFor(p, e.target.value)}
                                   className="sup-num" style={{ width:84, padding:"7px 8px", border:`1.5px solid ${C.border}`, borderRadius:8, fontSize:12.5, outline:"none", textAlign:"right" }} />
                            <span style={{ fontSize:11, color:C.muted }}>kg</span>
                            <button onClick={() => handleOrder(p)} disabled={st.busy}
                                    style={{ background:C.blue, color:"#fff", border:"none", borderRadius:8, padding:"8px 13px", fontSize:12.5, fontWeight:700, cursor:st.busy?"default":"pointer", opacity:st.busy?0.6:1, display:"inline-flex", alignItems:"center", gap:5, fontFamily:"Inter,system-ui" }}>
                              {st.busy ? "…" : <>Ordina <ArrowRight size={13}/></>}
                            </button>
                            <button onClick={() => handleAddToCart(p)} disabled={st.busy} title="Aggiungi al carrello"
                                    style={{ background:"transparent", color:C.blue, border:`1.5px solid ${C.blue}`, borderRadius:8, padding:"7px 9px", cursor:st.busy?"default":"pointer", opacity:st.busy?0.6:1, display:"inline-flex", alignItems:"center", fontFamily:"Inter,system-ui" }}>
                              <ShoppingCart size={14}/>
                            </button>
                          </div>
                        )}
                        {st.err && <div style={{ fontSize:11.5, color:C.red, marginTop:5 }}>{st.err}</div>}
                      </div>
                    </div>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <div style={{ padding:"36px 20px", textAlign:"center", color:C.muted, fontSize:13 }}>Nessun prodotto trovato nel listino.</div>
                )}
              </div>
            </div>

            {/* RECENSIONI */}
            <div ref={reviewsRef} className="sup-card" style={{ marginTop:18, scrollMarginTop:80 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:8 }}>
                <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted }}>Recensioni ({reviews.length})</div>
                {reviews.length > 0 && <span style={{ display:"flex", alignItems:"center", gap:6, fontSize:13 }}><Stars value={profile.rating}/> <b>{profile.rating != null ? Number(profile.rating).toFixed(1) : "—"}</b></span>}
              </div>

              {/* form lascia recensione */}
              {reviewableOrders.length > 0 ? (
                <div style={{ border:`1.5px solid ${C.blue}`, background:"#F0F9FF", borderRadius:12, padding:16, marginBottom:20 }}>
                  <div style={{ fontSize:13.5, fontWeight:700, marginBottom:10 }}>Lascia una recensione</div>
                  {reviewableOrders.length > 1 && (
                    <select value={reviewOrderId || ""} onChange={e => setReviewOrderId(e.target.value)}
                            style={{ width:"100%", padding:"8px 10px", border:`1.5px solid ${C.border}`, borderRadius:8, fontSize:13, marginBottom:10, fontFamily:"Inter,system-ui", background:"#fff" }}>
                      {reviewableOrders.map(o => <option key={o.order_id} value={o.order_id}>{o.product_name} — {o.quantity_kg} kg</option>)}
                    </select>
                  )}
                  {reviewableOrders.length === 1 && (
                    <div style={{ fontSize:12.5, color:C.muted, marginBottom:10 }}>Ordine: <b style={{ color:C.text }}>{reviewableOrders[0].product_name}</b> — {reviewableOrders[0].quantity_kg} kg</div>
                  )}
                  <div style={{ display:"flex", gap:3, marginBottom:10 }}>
                    {[1,2,3,4,5].map(i => (
                      <Star key={i} size={26}
                            fill={i <= (reviewHoverRating || reviewRating) ? C.amber : "none"}
                            color={C.amber}
                            style={{ cursor:"pointer" }}
                            onMouseEnter={() => setReviewHoverRating(i)}
                            onMouseLeave={() => setReviewHoverRating(0)}
                            onClick={() => setReviewRating(i)} />
                    ))}
                  </div>
                  <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)} placeholder="Com'è andata con questo fornitore? (facoltativo)"
                            rows={3} style={{ width:"100%", padding:"10px 12px", border:`1.5px solid ${C.border}`, borderRadius:8, fontSize:13, outline:"none", resize:"vertical", fontFamily:"Inter,system-ui", marginBottom:10 }} />
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <button onClick={handleSubmitReview} disabled={reviewState.busy || reviewRating < 1}
                            style={{ background:C.blue, color:"#fff", border:"none", borderRadius:8, padding:"9px 18px", fontSize:13, fontWeight:700, cursor:(reviewState.busy||reviewRating<1)?"default":"pointer", opacity:(reviewState.busy||reviewRating<1)?0.6:1, display:"inline-flex", alignItems:"center", gap:6, fontFamily:"Inter,system-ui" }}>
                      <Send size={13}/> {reviewState.busy ? "Invio…" : "Pubblica recensione"}
                    </button>
                    {reviewState.ok && <span style={{ fontSize:12.5, color:C.green, fontWeight:700, display:"flex", alignItems:"center", gap:4 }}><Check size={13}/> Recensione pubblicata</span>}
                    {reviewState.err && <span style={{ fontSize:12.5, color:C.red }}>{reviewState.err}</span>}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize:12.5, color:C.muted, background:C.bg, borderRadius:10, padding:"11px 14px", marginBottom:20 }}>
                  Potrai lasciare una recensione dopo aver completato un ordine con questo fornitore.
                </div>
              )}

              {/* lista recensioni */}
              {reviews.length === 0 ? (
                <div style={{ padding:"20px 4px", textAlign:"center", color:C.muted, fontSize:13 }}>Nessuna recensione ancora — sii il primo a lasciarne una dopo un ordine.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  {reviews.map(r => (
                    <div key={r.id} style={{ paddingBottom:16, borderBottom:`1px solid #F1F5F9` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5, flexWrap:"wrap", gap:6 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:13.5, fontWeight:700 }}>{r.buyer_name}</span>
                          {r.buyer_country && <CountryFlag country={r.buyer_country} size={12} />}
                          <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11, fontWeight:700, background:"#ECFDF5", color:C.green, borderRadius:100, padding:"2px 8px" }}><ShieldCheck size={10}/> Acquisto verificato</span>
                        </div>
                        <span style={{ fontSize:11.5, color:C.muted }}>{new Date(r.created_at).toLocaleDateString("it-IT", { year:"numeric", month:"short", day:"numeric" })}</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                        <Stars value={r.rating} />
                        {r.product_name && <span style={{ fontSize:12, color:C.muted }}>· {r.product_name}</span>}
                      </div>
                      {r.comment && <p style={{ fontSize:13.5, color:C.muted, lineHeight:1.6 }}>{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── COLONNA DESTRA ── */}
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* CONTATTI — telefono/email/referente solo con ordine confermato; il
                sito web resta sempre pubblico (marketing legittimo). */}
            <div className="sup-card">
              <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:6 }}>Contatti</div>
              <Row icon={Globe} label="Sito web">{profile.website ? <a href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`} target="_blank" rel="noopener noreferrer" style={{ color:C.blue, textDecoration:"none", display:"inline-flex", alignItems:"center", gap:4 }}>{profile.website} <ExternalLink size={11}/></a> : null}</Row>
              {profile.contacts_visible ? (
                <>
                  <Row icon={Mail} label="Assistenza clienti">{profile.support_email ? <a href={`mailto:${profile.support_email}`} style={{ color:C.blue, textDecoration:"none" }}>{profile.support_email}</a> : null}</Row>
                  <Row icon={Phone} label="Telefono">{profile.phone ? <a href={`tel:${profile.phone}`} style={{ color:C.text, textDecoration:"none" }}>{profile.phone}</a> : null}</Row>
                  <Row icon={User} label="Referente / amministratore">{profile.contact_name}</Row>
                </>
              ) : (
                <div style={{ marginTop:10, display:"flex", gap:8, background:"#FFF7ED", border:`1px solid #FDE68A`, borderRadius:10, padding:"10px 12px", fontSize:12.5, color:"#92400E", lineHeight:1.5 }}>
                  <span style={{ flexShrink:0 }}>📩</span>
                  <span>I contatti diretti (telefono, email, referente) sono visibili dopo un <b>ordine confermato</b>. Nel frattempo scrivi al fornitore con il pulsante <b>“Contatta il fornitore”</b>: il dialogo resta sulla piattaforma.</span>
                </div>
              )}
            </div>

            {/* SEDE LEGALE */}
            <div className="sup-card">
              <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:6 }}>Sede legale</div>
              <Row icon={Building2} label="Indirizzo">{[profile.address, profile.city].filter(Boolean).join(", ") || null}</Row>
              <Row icon={MapPin} label="Paese">{profile.country ? <><CountryFlag country={profile.country} /> {profile.country}</> : null}</Row>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:6, marginTop:12, fontSize:13, fontWeight:700, color:C.blue, textDecoration:"none" }}>
                  <MapPin size={14}/> Apri in Google Maps <ExternalLink size={11}/>
                </a>
              )}
            </div>

            {/* PAESI SERVITI */}
            <div className="sup-card">
              <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:10 }}>Paesi in cui opera</div>
              {(profile.countries_served || []).length > 0 ? (
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {profile.countries_served.map(c => (
                    <span key={c} style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12.5, fontWeight:600, borderRadius:100, padding:"4px 11px", background:C.bg, border:`1px solid ${C.border}` }}><CountryFlag country={c} /> {c}</span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize:13, color:C.muted }}><CountryFlag country={profile.country} /> {profile.country || "—"} <span style={{ fontSize:11.5 }}>(paese di origine — copertura non dichiarata)</span></div>
              )}
            </div>

            {/* TRUST */}
            <div className="sup-card" style={{ background:C.bg }}>
              <div style={{ fontSize:13, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.05em", color:C.muted, marginBottom:10 }}>Acquisto protetto</div>
              {[
                [ShieldCheck, "Pagamento in escrow: il fornitore incassa solo a consegna confermata"],
                [Truck, "Track & trace integrato su ogni ordine"],
                [Award, "Fornitore verificato da BulkStrike"],
              ].map(([Icon, t], i) => (
                <div key={i} style={{ display:"flex", gap:9, alignItems:"flex-start", marginBottom:9 }}>
                  <Icon size={15} color={C.green} style={{ marginTop:1, flexShrink:0 }}/>
                  <span style={{ fontSize:12.5, color:C.muted, lineHeight:1.5 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ background:"#050D18", borderTop:"1px solid #1A3454", padding:"26px 24px" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:14 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
            <BSIcon size={26} uid="foot" />
            <span style={{ fontSize:15, fontWeight:900, color:"#F0F6FF", letterSpacing:"-0.03em" }}>Bulk<span style={{ background:"linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>Strike</span></span>
          </div>
          <div style={{ display:"flex", gap:18, flexWrap:"wrap" }}>
            {[["Termini","/legale#termini"],["Privacy","/legale#privacy"],["Contatti","mailto:info@bulkstrike.com"]].map(([l,href]) => (
              <a key={l} href={href} style={{ fontSize:13, color:"#3B5A7A", textDecoration:"none" }}>{l}</a>
            ))}
          </div>
          <div style={{ fontSize:13, color:"#3B5A7A" }}>© 2026 BulkStrike S.r.l.</div>
        </div>
      </div>
    </div>
  );
}
