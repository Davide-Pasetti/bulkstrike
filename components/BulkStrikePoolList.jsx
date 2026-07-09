"use client";
// BulkStrikePoolList — elenco pubblico di TUTTE le aste a ribasso attive.
// È la destinazione del link "Aste attive" in nav (/pool senza ?id); il
// dettaglio della singola asta resta su /pool?id=<uuid> (BulkStrikePool).
// Struttura ricalcata sul catalogo (/catalogo): header con breadcrumb,
// toolbar con ricerca + ordinamento, griglia di card, footer. Dati dalla RPC
// pubblica get_active_pools (la tabella pools è preclusa agli anonimi da RLS).
import { useState, useEffect, useMemo } from "react";
import { ChevronRight, Clock, Users, Gavel, Search, ArrowRight, Star } from "lucide-react";
import { getActivePools, getMyFollowedProducts, getSession } from "@/lib/api";
import { nextTierGap } from "@/lib/tiers";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import ProductFollowButton from "@/components/BulkStrikeProductFollow";
import CategorySelect from "@/components/BulkStrikeCategorySelect";
import { BSIcon } from "@/components/BSLogo";

const C = { blue: "#0EA5E9", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", amber: "#D97706", purple: "#7C3AED" };

const kg = (n) => Number(n || 0).toLocaleString("it-IT");
const eurKg = (n) => "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Tempo rimanente alla chiusura, in forma compatta ("4g 9h", "3h 12m", "in chiusura").
function timeLeft(iso) {
  const s = Math.floor((new Date(iso) - Date.now()) / 1000);
  if (s <= 0) return "in chiusura";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}g ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function PoolListPage() {
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("closing");
  const [category, setCategory] = useState(null);         // slug macro | null
  const [favOnly, setFavOnly] = useState(true);           // default: solo preferiti
  const [followedIds, setFollowedIds] = useState(null);   // Set | null (non caricato)
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    getActivePools()
      .then((p) => { setPools(p || []); setLoading(false); })
      .catch(() => setLoading(false));
    getSession().then(s => {
      if (!s) { setLoggedIn(false); return; }
      setLoggedIn(true);
      getMyFollowedProducts()
        .then(list => setFollowedIds(new Set((list || []).map(x => x.product_id))))
        .catch(() => setFollowedIds(new Set()));
    }).catch(() => setLoggedIn(false));
  }, []);

  const hasFavs = !!(followedIds && followedIds.size > 0);
  // Il filtro preferiti si applica SOLO se: loggato, con almeno un preferito e toggle ON.
  // Così se non hai preferiti (o non sei loggato) la pagina non risulta mai vuota.
  const favActive = loggedIn && hasFavs && favOnly;

  const filtered = useMemo(() => {
    let list = pools;
    const s = q.trim().toLowerCase();
    if (s) list = list.filter(p =>
      (p.product_name || "").toLowerCase().includes(s) ||
      (p.product_enum || "").toLowerCase().includes(s));
    if (category) list = list.filter(p => (p.macros || []).includes(category));
    if (favActive) list = list.filter(p => followedIds.has(p.product_id));
    list = [...list];
    if (sort === "volume") list.sort((a, b) => (b.total_volume_kg || 0) - (a.total_volume_kg || 0));
    else if (sort === "name") list.sort((a, b) => (a.product_name || "").localeCompare(b.product_name || ""));
    else list.sort((a, b) => new Date(a.closes_at) - new Date(b.closes_at));
    return list;
  }, [pools, q, sort, category, favActive, followedIds]);

  const toggleFollow = (productId, next) => setFollowedIds(prev => {
    const set = new Set(prev || []);
    if (next) set.add(productId); else set.delete(productId);
    return set;
  });

  return (
    <div style={{ background: "#fff", color: C.text, fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh", colorScheme: "light" }}>
      <style>{`
        .pool-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:14px; }
        .pool-card { transition:transform 0.12s, box-shadow 0.12s; }
        .pool-card:hover { transform:translateY(-2px); box-shadow:0 10px 24px rgba(124,58,237,0.10); border-color:#DDD6FE !important; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .pool-live-dot { width:7px; height:7px; border-radius:50%; background:#DC2626; animation:pulse 1.5s infinite; }
      `}</style>

      {/* NAV */}
      <BulkStrikeNav />

      {/* HEADER */}
      <div style={{ borderBottom: `1px solid ${C.border}`, background: "linear-gradient(135deg,#FBF9FF,#F0FDFF)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "26px 20px" }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span onClick={() => { window.location.href = "/"; }} style={{ cursor: "pointer" }}>Home</span><ChevronRight size={12} /><span style={{ color: C.text, fontWeight: 600 }}>Aste attive</span>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 6px" }}>Aste a ribasso attive</h1>
          <p style={{ fontSize: 15, color: C.muted, margin: 0 }}>Tutte le aste in corso: unisciti con la tua quantità, il prezzo può solo scendere fino alla chiusura.</p>
        </div>
      </div>

      {/* BODY */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "22px 20px 48px" }}>
        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          <div style={{ fontSize: 14, color: C.muted }}>
            {loading ? "Caricamento aste…" : <><b style={{ color: C.text }}>{filtered.length}</b> {filtered.length === 1 ? "asta attiva" : "aste attive"}</>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 12px", background: "#fff" }}>
              <Search size={14} color={C.muted} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca prodotto o E-number…" style={{ border: "none", outline: "none", fontSize: 13, fontFamily: "Inter,system-ui", width: 190, background: "transparent", color: C.text }} />
            </div>
            {loggedIn && hasFavs && (
              <button onClick={() => setFavOnly(v => !v)} title={favOnly ? "Mostra tutte le aste" : "Mostra solo i preferiti"}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: `1px solid ${favOnly ? "#FDE68A" : C.border}`, background: favOnly ? "#FEF3C7" : "#fff", color: favOnly ? "#B45309" : C.text, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>
                <Star size={14} fill={favOnly ? "#D97706" : "none"} color={favOnly ? "#D97706" : C.muted} /> Preferiti
              </button>
            )}
            <span style={{ fontSize: 13, color: C.muted }}>Categoria</span>
            <CategorySelect value={category} onChange={setCategory} colors={C} />
            <span style={{ fontSize: 13, color: C.muted }}>Ordina</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", fontSize: 13, fontFamily: "Inter,system-ui", color: C.text, cursor: "pointer" }}>
              <option value="closing">Chiusura più vicina</option>
              <option value="volume">Volume maggiore</option>
              <option value="name">Nome (A→Z)</option>
            </select>
          </div>
        </div>

        {loggedIn && followedIds && !hasFavs && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: 13.5, color: "#92400E" }}>
            <Star size={17} color="#D97706" style={{ flexShrink: 0 }} />
            <span>Segui i prodotti che ti interessano con la <b>stella</b> ⭐ sulle card: la prossima volta li ritrovi subito qui, filtrati come <b>Preferiti</b>.</span>
          </div>
        )}
        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: C.muted, fontSize: 14 }}>Caricamento aste…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: C.muted }}>
            <Gavel size={30} color={C.border} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>{q ? "Nessuna asta trovata" : "Nessuna asta attiva in questo momento"}</div>
            <div style={{ fontSize: 13, marginBottom: 16 }}>{q ? "Prova con un altro nome o E-number." : "Puoi aprirne una dalla pagina di qualsiasi prodotto del catalogo."}</div>
            <button onClick={() => { window.location.href = "/catalogo"; }} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 9, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui", display: "inline-flex", alignItems: "center", gap: 7 }}>
              Vai al catalogo <ArrowRight size={15} />
            </button>
          </div>
        ) : (
          <div className="pool-grid">
            {filtered.map(p => (
              <div key={p.id} className="pool-card" onClick={() => { window.location.href = `/pool?id=${p.id}`; }}
                style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, cursor: "pointer", background: "#fff", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: p.status === "final_phase" ? C.amber : C.red, background: p.status === "final_phase" ? "#FFF7ED" : "#FEF2F2", borderRadius: 100, padding: "3px 10px" }}>
                    <span className="pool-live-dot" style={p.status === "final_phase" ? { background: C.amber } : undefined} />
                    {p.status === "final_phase" ? "Fase finale" : "Live"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: C.muted }}>
                      <Clock size={12} /> {timeLeft(p.status === "final_phase" && p.final_phase_ends_at ? p.final_phase_ends_at : p.closes_at)}
                    </span>
                    <ProductFollowButton productId={p.product_id} following={!!(followedIds && followedIds.has(p.product_id))} onChange={(next) => toggleFollow(p.product_id, next)} compact muted={C.muted} border={C.border} />
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.25, marginBottom: 3 }}>{p.product_name}</div>
                  {p.product_enum && <div style={{ fontSize: 11.5, color: C.muted }}>{p.product_enum}</div>}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: "#FBF7FF", borderRadius: 9, padding: "9px 12px" }}>
                    <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 2 }}>Miglior prezzo</div>
                    <div style={{ fontSize: 17, fontWeight: 900, color: C.purple, letterSpacing: "-0.02em" }}>
                      {Number(p.num_bids) > 0 && p.best_price_per_kg != null ? <>{eurKg(p.best_price_per_kg)}<span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>/kg</span></> : <span style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>In attesa di offerte</span>}
                    </div>
                  </div>
                  <div style={{ background: C.bg, borderRadius: 9, padding: "9px 12px" }}>
                    <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 2 }}>Volume aggregato</div>
                    <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em" }}>{kg(p.total_volume_kg)}<span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}> kg</span></div>
                  </div>
                </div>

                {Number(p.num_bids) > 0 && p.best_price_per_kg != null && (() => {
                  const g = nextTierGap(p.total_volume_kg);
                  return g && g.gap > 0 ? (
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: -4 }}>
                      Mancano <b style={{ color: C.text }}>{kg(g.gap)} kg</b> per sbloccare <b style={{ color: C.purple }}>{eurKg(g.nextPrice)}/kg</b>
                    </div>
                  ) : null;
                })()}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.muted }}>
                    <Users size={13} /> {p.participants} {Number(p.participants) === 1 ? "azienda" : "aziende"}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: C.muted }}>
                    <Gavel size={13} /> {p.num_bids} {Number(p.num_bids) === 1 ? "fornitore in gara" : "fornitori in gara"}
                  </span>
                </div>

                <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, background: C.purple, color: "#fff", borderRadius: 9, padding: "10px", fontSize: 13.5, fontWeight: 700 }}>
                  Visualizza l'asta <ArrowRight size={15} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div style={{ background: "#050D18", padding: "28px 20px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
            <BSIcon size={26} uid="foot" /><span style={{ fontSize: 15, fontWeight: 900, color: "#F0F6FF" }}>BulkStrike</span>
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {[["Termini", "/legale#termini"], ["Privacy", "/legale#privacy"], ["Cookie", "/legale#cookie"], ["Contatti", "mailto:info@bulkstrike.com"]].map(([l, href]) => <a key={l} href={href} style={{ fontSize: 13, color: "#3B5A7A", cursor: "pointer", textDecoration: "none" }}>{l}</a>)}
          </div>
          <div style={{ fontSize: 13, color: "#3B5A7A" }}>© 2026 BulkStrike S.r.l.</div>
        </div>
      </div>
    </div>
  );
}
