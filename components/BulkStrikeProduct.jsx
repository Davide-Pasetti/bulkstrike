import { useState, useMemo, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Search, ArrowRight, Check, Clock, ChevronDown, ChevronRight, ChevronUp, Star, Shield, Truck, FileText, Download, Plus, Minus, Beaker, TrendingDown, Users, Gavel, Info, ShoppingCart } from "lucide-react";
import { getProduct, getOpenPoolForProduct, getPriceReference, getProductBreadcrumb, getSession, openPool, upsertCartItem, poolErrorMessage, searchProducts, getCart, isFollowingProduct } from "@/lib/api";
import ProductFollowButton from "@/components/BulkStrikeProductFollow";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import BulkStrikeChatWidget from "@/components/BulkStrikeChatWidget";
import { BSIcon } from "@/components/BSLogo";
import { IvaChip } from "@/components/BulkStrikeBadges";

// ─── PALETTE (matches homepage) ───────────────────────────────────────────────
const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706", purple:"#7C3AED" };

// ─── PRODUCT DATA ─────────────────────────────────────────────────────────────
const SEED_PRODUCT = {
  name: "Acido Tartarico L(+)",
  enum: "E334",
  cas: "87-69-4",
  formula: "C₄H₆O₆",
  mw: "150,09 g/mol",
  category: "Acidificanti · Enologia",
  form: "Polvere cristallina bianca",
  purityRange: "99,5% – 99,9%",
};

// price tiers €/kg by volume band [maxKg, price]; shipping = base + perKg*qty
const SEED_SUPPLIERS = [
  { id:"mazzari", name:"Distillerie Mazzari", origin:"Italia", flag:"🇮🇹", rating:4.9, reviews:218, delivery:"2–3 gg", type:"Naturale (da fecce di vino)",
    purity:"99,8%", certs:["Food Grade","OIV","ISO 9001","Kosher"],
    tiers:[[5000,2.80],[20000,2.55],[50000,2.30],[Infinity,2.10]], shipBase:80, shipKg:0.05 },
  { id:"changmao", name:"Changmao Biochemical", origin:"Cina", flag:"🇨🇳", rating:4.6, reviews:1043, delivery:"25–30 gg", type:"Sintetico",
    purity:"99,5%", certs:["Food Grade","ISO 9001","Kosher","Halal"],
    tiers:[[5000,2.10],[20000,1.90],[50000,1.70],[Infinity,1.55]], shipBase:180, shipKg:0.12 },
  { id:"dervinsa", name:"DERVINSA", origin:"Argentina", flag:"🇦🇷", rating:4.7, reviews:386, delivery:"18–22 gg", type:"Naturale (da uva)",
    purity:"99,7%", certs:["Food Grade","OIV","ISO 9001"],
    tiers:[[5000,2.45],[20000,2.20],[50000,2.00],[Infinity,1.85]], shipBase:140, shipKg:0.09 },
  { id:"fdcm", name:"FDCM Europe", origin:"Polonia (UE)", flag:"🇵🇱", rating:4.5, reviews:152, delivery:"4–6 gg", type:"Distributore",
    purity:"99,6%", certs:["Food Grade","ISO 9001","REACH"],
    tiers:[[5000,2.35],[20000,2.15],[50000,1.95],[Infinity,1.80]], shipBase:90, shipKg:0.06 },
];

const CHART = [
  {t:"Gen",v:2.95},{t:"Feb",v:2.88},{t:"Mar",v:2.79},{t:"Apr",v:2.72},
  {t:"Mag",v:2.61},{t:"Giu",v:2.55},{t:"Lug",v:2.49},{t:"Ago",v:2.42},
];

const SEED_POOL = { exists:true, id:null, bestPrice:1.68, current:13800, companies:8, suppliers:4, closesIn:"4g 9h", myQuantityKg:0 };  // pool/asta attiva su questo prodotto

const SEED_QA = [
  { q:"È adatto alla stabilizzazione tartarica a freddo?", a:"Sì, l'acido tartarico L(+) è impiegato per la correzione dell'acidità del mosto e del vino. Per la stabilizzazione a freddo si abbina spesso a bitartrato di potassio." },
  { q:"Qual è la differenza tra naturale e sintetico per l'uso enologico?", a:"L'acido tartarico naturale (da fecce o uva) è la forma L(+) destrogira identica a quella dell'uva. Il sintetico è chimicamente equivalente come E334 ma alcune denominazioni e produzioni biologiche richiedono il naturale." },
  { q:"Che packaging è disponibile per grandi volumi?", a:"Sacchi da 25 kg su pallet, big bag da 500 e 1000 kg. Oltre le 20 tonnellate la maggior parte dei fornitori quota in big bag." },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const VAT = 0.22;
const PALLET_KG = 1000;   // peso di 1 pallet di questo prodotto: soglia per aprire un pool
function priceForQty(supplier, qty) {
  for (const [maxKg, price] of supplier.tiers) if (qty <= maxKg) return price;
  return supplier.tiers[supplier.tiers.length-1][1];
}
function compute(supplier, qty) {
  const unit = priceForQty(supplier, qty);
  const product = unit * qty;
  const shipping = supplier.shipBase + supplier.shipKg * qty;
  const preVat = product + shipping; // materia prima + spedizione, IVA esclusa — il costo comparabile tra fornitori/paesi
  const vat = preVat * VAT;
  const total = preVat + vat;
  return { unit, product, shipping, preVat, preVatKg: preVat / qty, vat, total, allInKg: total / qty };
}
const eur = (n) => n.toLocaleString("it-IT", { style:"currency", currency:"EUR", maximumFractionDigits:0 });
const eurKg = (n) => "€" + n.toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });
const tierLabel = (qty) => qty<5000?"1–5 t":qty<20000?"5–20 t":qty<50000?"20–50 t":"50 t+";

/* ─── MAPPERS DB → shape del componente ─────────────────────────────────────
 * Il render usa la shape demo (SEED_*). Questi mapper convertono i dati reali
 * di getProduct()/getOpenPoolForProduct() nella stessa shape, così tutto il
 * render e gli helper priceForQty()/compute() restano identici. */
const FLAG = { "Italia":"🇮🇹","Cina":"🇨🇳","Argentina":"🇦🇷","Polonia":"🇵🇱","Francia":"🇫🇷","Germania":"🇩🇪","Spagna":"🇪🇸","Paesi Bassi":"🇳🇱","India":"🇮🇳","Stati Uniti":"🇺🇸","Turchia":"🇹🇷" };
const flagFor = (country) => FLAG[country] || "🏳️";
// stima trasporto: nessun dato per fornitore nel DB → stima per area geografica
function shipFor(country) {
  if (country === "Italia") return { shipBase:80, shipKg:0.05 };
  const eu = ["Francia","Germania","Spagna","Polonia","Paesi Bassi","Portogallo","Belgio","Austria"];
  if (eu.includes(country)) return { shipBase:100, shipKg:0.06 };
  return { shipBase:180, shipKg:0.12 }; // extra-UE
}
// da { tiers:[{min_kg,max_kg,price_per_kg}] } (getProduct) → shape componente
function mapDbSupplier(s) {
  const ship = shipFor(s.country);
  // tiers [[maxKg,price]] ordinati per min_kg; ultimo maxKg = Infinity
  const sorted = [...(s.tiers || [])].sort((a,b) => a.min_kg - b.min_kg);
  const tiers = sorted.map((t) => [t.max_kg == null ? Infinity : Number(t.max_kg), Number(t.price_per_kg)]);
  if (!tiers.length) tiers.push([Infinity, s.best_price || 0]);
  const purity = (s.grade && /\d/.test(s.grade)) ? (s.grade.match(/[\d.,]+%/)?.[0] || "") : "";
  return {
    id: s.supplier_product_id,
    company_id: s.company_id,
    name: s.name,
    origin: s.country,
    flag: flagFor(s.country),
    rating: s.rating ?? 0,
    reviews: s.reviews_count ?? 0,
    delivery: s.lead_time_days != null ? `${s.lead_time_days} gg` : "—",
    type: s.grade || (s.origin === "natural" ? "Naturale" : s.origin === "synthetic" ? "Sintetico" : "—"),
    purity,
    certs: s.certifications || [],
    tiers,
    shipBase: ship.shipBase,
    shipKg: ship.shipKg,
    formats: Array.isArray(s.formats) && s.formats.length ? s.formats : [{ label: "sacco", size_kg: 25 }],
    variantAttributes: (s.variantAttributes && typeof s.variantAttributes === "object") ? s.variantAttributes : {},
  };
}
// da getProduct() (senza suppliers) → shape SEED_PRODUCT
function mapDbProduct(p) {
  return {
    name: p.canonical_name,
    enum: p.e_number || "—",
    cas: p.cas_number || "—",
    formula: p.formula || "—",
    mw: p.iupac_name || "—",
    category: p.merch_classes || (p.description ? p.description : "Materia prima"),
    form: p.default_unit === "L" ? "Liquido" : "Polvere / granulare",
    purityRange: "—",
    description: p.description || "",
    pallet_kg: p.pallet_kg || 1000,
  };
}
// da getOpenPoolForProduct() → shape SEED_POOL
function mapDbPool(pool) {
  if (!pool) return { exists:false, id:null, bestPrice:0, current:0, companies:0, suppliers:0, closesIn:"", myQuantityKg:0 };
  return {
    exists: true,
    id: pool.id,
    bestPrice: pool.best_price_per_kg != null ? Number(pool.best_price_per_kg) : 0,
    current: Number(pool.total_volume_kg) || 0,
    companies: Number(pool.participants) || 0,
    suppliers: Number(pool.num_bids) || 0,
    closesIn: untilLabel(pool.status === "final_phase" ? pool.final_phase_ends_at : pool.closes_at),
    myQuantityKg: pool.my_quantity_kg != null ? Number(pool.my_quantity_kg) : 0,
  };
}
// etichetta "Xg Yh" da un timestamp futuro
function untilLabel(iso) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "in chiusura";
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}g ${h % 24}h` : `${h}h`;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function ProductPage() {
  const [qty, setQty] = useState(8000);
  const [selectedId, setSelectedId] = useState(null);   // null = auto best (prezzo netto piu basso)
  const [variantFilters, setVariantFilters] = useState({}); // { granulometria: "fine", ... } — un fornitore senza questa esatta variante non compare
  const [selectedFormatIdx, setSelectedFormatIdx] = useState(0); // indice del formato scelto tra quelli del fornitore in evidenza
  const [showSpecs, setShowSpecs] = useState(false);
  const [openQa, setOpenQa] = useState(null);

  // ── stato data-driven (default = demo SEED; /prodotto senza id resta la demo)
  // loading parte SEMPRE true: durante l'SSR window non esiste e non possiamo
  // leggere ?id=, quindi il server renderizzava il demo (Acido tartarico) e il
  // browser lo mostrava per un istante prima dell'hydration. Partendo dal
  // loader, il demo non viene mai dipinto; l'effect spegne subito il loader
  // se l'URL non ha alcun id.
  const [product, setProduct] = useState(SEED_PRODUCT);
  const [suppliers, setSuppliers] = useState(SEED_SUPPLIERS);
  const [pool, setPool] = useState(SEED_POOL);
  const [qa, setQa] = useState(SEED_QA);
  const [productId, setProductId] = useState(null);
  const [followingProduct, setFollowingProduct] = useState(false);
  const [priceRef, setPriceRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [crumb, setCrumb] = useState(null); // { macro, sector } reali del prodotto
  const [busy, setBusy] = useState(false);
  const [openAcceptTerms, setOpenAcceptTerms] = useState(false); // disclaimer da accettare prima di aprire davvero un'asta
  const [cartOk, setCartOk] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartSupplierIds, setCartSupplierIds] = useState(new Set()); // fornitori già presenti nel tuo carrello → spedizione si consolida
  useEffect(() => { if (productId) isFollowingProduct(productId).then(setFollowingProduct).catch(() => {}); }, [productId]);

  // se sei loggato, sappiamo da quali fornitori hai già roba nel carrello: la spedizione
  // di un nuovo prodotto dello stesso fornitore si unisce a quella già "pagata" da quei prodotti
  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) return;
      try {
        const items = await getCart();
        setCartSupplierIds(new Set((items || []).map(it => it.supplier_company_id)));
      } catch (e) {}
    })();
  }, []);
  const consolidatedWith = (companyId) => companyId && cartSupplierIds.has(companyId);

  // carica il prodotto reale da ?id=
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { setLoading(false); return; }   // nessun id → resta la demo
    setProductId(id);
    setLoading(true);
    (async () => {
      try {
        const [p, op, ref, bc] = await Promise.all([
          getProduct(id),
          getOpenPoolForProduct(id).catch(() => null),
          getPriceReference(id).catch(() => null),
          getProductBreadcrumb(id).catch(() => null),
        ]);
        if (p) {
          setProduct(mapDbProduct(p));
          setSuppliers((p.suppliers || []).map(mapDbSupplier));
          setPriceRef(ref != null ? Number(ref) : null);
          setPool(mapDbPool(op));
          setCrumb(bc || null);
          setSelectedId(null);
          setSelectedFormatIdx(0);
          setQa(id === "ba475798-09b8-4471-91d4-f7555e4b0c9b" ? SEED_QA : []);
        }
      } catch (e) {
        setActionMsg(poolErrorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ricerca prodotti (debounced) per la barra in nav
  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) { setSearchResults([]); setSearchOpen(false); return; }
    const t = setTimeout(() => {
      searchProducts(q).then(rows => { setSearchResults(rows); setSearchOpen(true); }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [searchQ]);

  function runSearch() {
    const q = searchQ.trim();
    if (q.length < 2) return;
    searchProducts(q).then(rows => { setSearchResults(rows); setSearchOpen(true); }).catch(() => {});
  }
  // Attributi di variante disponibili tra i fornitori (solo quelli verificati arrivano
  // già popolati da getProduct). Un fornitore senza la variante selezionata sparisce.
  const variantOptions = useMemo(() => {
    const opts = {};
    for (const s of suppliers) {
      for (const [k, v] of Object.entries(s.variantAttributes || {})) {
        if (!opts[k]) opts[k] = new Set();
        opts[k].add(v);
      }
    }
    return Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, [...v]]));
  }, [suppliers]);
  const filteredSuppliers = useMemo(() => {
    const keys = Object.keys(variantFilters).filter(k => variantFilters[k]);
    if (keys.length === 0) return suppliers;
    return suppliers.filter(s => keys.every(k => (s.variantAttributes || {})[k] === variantFilters[k]));
  }, [suppliers, variantFilters]);

  const ranked = useMemo(() => {
    return filteredSuppliers.map(s => ({ ...s, calc: compute(s, qty) })).sort((a,b) => a.calc.preVatKg - b.calc.preVatKg);
  }, [filteredSuppliers, qty]);

  const featured = (selectedId ? ranked.find(s => s.id === selectedId) : ranked[0]) || null;
  const others = featured ? ranked.filter(s => s.id !== featured.id) : [];
  const cheapestId = ranked.length ? ranked[0].id : null;

  // Acquisto Rapido è a unità di vendita (es. sacchi da 25 kg), non a kg liberi.
  // Il formato dipende dal fornitore in evidenza; qty (kg) resta lo stato reale,
  // unitCount è solo la sua vista in unità per quel formato.
  const massUnit = product.default_unit === "L" ? "L" : "kg"; // solido→kg, liquido→litri
  const formats = featured?.formats?.length ? featured.formats : [{ label: "sacco", size_kg: 25 }];
  const currentFormat = formats[selectedFormatIdx] || formats[0];
  const unitLabel = currentFormat.label;
  const unitSizeKg = currentFormat.size_kg;
  // Unità minima vendibile: dal profilo del fornitore (min_order_kg). Se non
  // impostata, il fornitore permette anche 1 sola unità.
  const minUnits = featured?.min_order_kg > 0 ? Math.max(1, Math.ceil(featured.min_order_kg / unitSizeKg)) : 1;
  const unitCount = Math.max(1, Math.round(qty / unitSizeKg));
  const setUnitCount = (n) => setQtySafe(Math.max(minUnits, n) * unitSizeKg);
  const selectFormat = (idx) => { setSelectedFormatIdx(idx); setQtySafe(Math.max(minUnits, unitCount) * formats[idx].size_kg); };

  // pool nudge: shown when the instant order is >= 1 pallet
  const palletKg = product.pallet_kg || PALLET_KG;
  const canOpenPool = qty >= palletKg;
  // pallet/container come multipli dell'unità di vendita corrente — 11/23 pallet
  // per un container 20'/40' sono gli standard logistici usuali per europallet.
  const unitsPerPallet = Math.max(1, Math.round(palletKg / unitSizeKg));
  const unitsPerContainer20 = unitsPerPallet * 11;
  const unitsPerContainer40 = unitsPerPallet * 23;
  // best instant unit price across suppliers at this qty (for comparison with the active pool)
  const bestInstantUnit = ranked.length ? Math.min(...ranked.map(s => s.calc.unit)) : 0;
  const joinSavings = Math.max(0, (bestInstantUnit - pool.bestPrice) * qty);
  // potential pool saving = cheapest supplier's deeper volume tier vs its current unit price
  const poolPotential = (() => {
    const s = ranked[0];
    if (!s) return { deeperPrice:0, pct:0 };
    const curUnit = priceForQty(s, qty);
    const deeper = s.tiers.find(([maxKg]) => maxKg > qty && maxKg !== Infinity) || s.tiers[s.tiers.length-1];
    const deeperPrice = deeper[1];
    const pct = Math.max(0, Math.round((1 - deeperPrice/curUnit) * 100));
    return { deeperPrice, pct };
  })();

  const setQtySafe = (v) => setQty(Math.max(minUnits * unitSizeKg, Math.min(200000, v)));

  // ── azioni reali (openPool / upsertCartItem richiedono login → altrimenti /registrati)
  async function requireAuth() {
    const session = await getSession();
    if (!session) { window.location.href = "/registrati"; return false; }
    return true;
  }
  async function handleOpenPool() {
    if (!productId) { window.location.href = "/registrati"; return; }
    if (pool.exists && pool.id) { window.location.href = `/pool?id=${pool.id}`; return; } // esiste già → unisciti
    if (!(await requireAuth())) return;
    setBusy(true); setActionMsg("");
    try {
      const newId = await openPool(productId, qty, true);
      window.location.href = `/pool?id=${newId}`;
    } catch (e) {
      if (pool.id) { window.location.href = `/pool?id=${pool.id}`; return; } // POOL_ALREADY_OPEN
      setActionMsg(poolErrorMessage(e));
    } finally { setBusy(false); }
  }
  async function handleBuyNow() {
    if (!productId) { window.location.href = "/registrati"; return; }
    if (!(await requireAuth())) return;
    if (!featured?.company_id) { setActionMsg("Nessun fornitore disponibile per questa quantità."); return; }
    setBusy(true); setActionMsg("");
    try {
      await upsertCartItem(productId, featured.company_id, qty);
      window.location.href = "/carrello";
    } catch (e) {
      setActionMsg(poolErrorMessage(e));
    } finally { setBusy(false); }
  }
  async function handleAddToCart() {
    if (!productId) { window.location.href = "/registrati"; return; }
    if (!(await requireAuth())) return;
    if (!featured?.company_id) { setActionMsg("Nessun fornitore disponibile per questa quantità."); return; }
    setBusy(true); setActionMsg(""); setCartOk(false);
    try {
      await upsertCartItem(productId, featured.company_id, qty);
      setCartOk(true);
    } catch (e) {
      setActionMsg(poolErrorMessage(e));
    } finally { setBusy(false); }
  }
  const goToPool = () => { if (pool.id) window.location.href = `/pool?id=${pool.id}`; };

  // Mentre carichiamo il prodotto reale non mostriamo il demo: loader brandizzato.
  if (loading) {
    return (
      <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, fontFamily:"'Inter',system-ui,sans-serif", colorScheme:"light" }}>
        <div onClick={() => { window.location.href = "/"; }} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
          <BSIcon size={40} uid="load" />
          <div style={{ display:"flex", alignItems:"baseline" }}>
            <span style={{ fontSize:24, fontWeight:900, letterSpacing:"-0.03em", color:C.text }}>Bulk</span>
            <span style={{ fontSize:24, fontWeight:900, letterSpacing:"-0.03em", background:"linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>Strike</span>
          </div>
        </div>
        <div style={{ fontSize:14, color:C.muted }}>Caricamento prodotto…</div>
      </div>
    );
  }

  return (
    <div style={{ background:"#fff", color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", overflowX:"hidden", colorScheme:"light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .bs-num { font-family:'JetBrains Mono',monospace; }
        .bs-ticker-wrap { overflow:hidden; width:100%; }
        .bs-ticker { display:flex; width:max-content; animation:tick 45s linear infinite; }
        .bs-ticker:hover { animation-play-state:paused; }
        @keyframes tick { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        .bs-btn { background:#0EA5E9; color:#fff; border:none; border-radius:10px; padding:13px 24px; font-size:15px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:8px; transition:all 0.2s; font-family:'Inter',system-ui; }
        .bs-btn:hover { background:#0284C7; transform:translateY(-1px); box-shadow:0 6px 20px rgba(14,165,233,0.3); }
        .bs-btn-ghost { background:transparent; color:#0EA5E9; border:1.5px solid #E2E8F0; border-radius:8px; padding:10px 16px; font-size:14px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:6px; transition:all 0.2s; font-family:'Inter',system-ui; }
        .bs-btn-ghost:hover { border-color:#0EA5E9; background:#EFF6FF; }
        .bs-chip { border-radius:6px; padding:3px 9px; font-size:11px; font-weight:600; display:inline-flex; align-items:center; gap:4px; }
        .bs-search-wrap { display:flex; border:2px solid #0EA5E9; border-radius:10px; overflow:hidden; height:44px; flex:1; max-width:520px; background:#fff; }
        .bs-search-input { flex:1; border:none; padding:0 14px; font-size:14px; outline:none; font-family:'Inter',system-ui; }
        .bs-supplier-row { display:grid; grid-template-columns:1.6fr 1fr 1fr 1.2fr 0.9fr auto; gap:14px; align-items:center; padding:16px; border:1px solid #E2E8F0; border-radius:12px; transition:all 0.15s; }
        .bs-suplink { cursor:pointer; transition:color 0.12s; }
        .bs-suplink:hover { color:#0EA5E9; text-decoration:underline; }
        .bs-supplier-row:hover { border-color:#0EA5E9; box-shadow:0 4px 16px rgba(14,165,233,0.08); }
        .bs-qty-btn { width:38px; height:38px; border:1px solid #E2E8F0; background:#fff; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#475569; }
        .bs-qty-btn:hover { border-color:#0EA5E9; color:#0EA5E9; }
        .bs-chatbot-btn { width:56px; height:56px; border-radius:50%; background:#0EA5E9; border:3px solid #fff; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 20px rgba(14,165,233,0.4); }
        .bs-spec-row { display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #F1F5F9; font-size:14px; }
        .bs-feature-grid { display:grid; grid-template-columns:1.4fr 1fr; gap:16px; align-items:center; }
        @media (max-width:880px){
          .bs-grid-main { grid-template-columns:1fr !important; }
          .bs-supplier-row { grid-template-columns:1fr 1fr !important; gap:10px !important; }
          .bs-supplier-row .bs-col-hide { display:none !important; }
          .bs-nav-links { display:none !important; }
          .bs-search-wrap { max-width:100% !important; }
          .bs-chart-grid { grid-template-columns:1fr !important; }
          .bs-feature-grid { grid-template-columns:1fr !important; gap:14px !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <BulkStrikeNav />

      {/* TICKER */}
      <div style={{ background:"#07111E", padding:"9px 0" }}>
        <div className="bs-ticker-wrap"><div className="bs-ticker">
          {[...Array(2)].flatMap((_,k) => [
            ["Acido Tartarico","€2,49",-2.8],["Acido Citrico","€0,81",-2.3],["Metabisolfito K","€1,95",1.1],["Bentonite","€0,42",-0.6],["Acido Malico","€3,10",0.9],["Gomma Arabica","€8,40",2.2],["Mannoproteine","€14,20",-0.3],["MCR","€0,95",1.7]
          ].map(([n,p,c],i) => (
            <div key={k+"-"+i} style={{ display:"flex", alignItems:"center", gap:8, padding:"0 22px", whiteSpace:"nowrap" }}>
              <span style={{ fontSize:13, color:"#6B94B8" }}>{n}</span>
              <span className="bs-num" style={{ fontSize:13, fontWeight:600, color:"#F0F6FF" }}>{p}/kg</span>
              <span className="bs-num" style={{ fontSize:12, color:c>=0?"#10B981":"#F43F5E" }}>{c>=0?"▲":"▼"} {Math.abs(c)}%</span>
              <span style={{ color:"#1A3454", margin:"0 4px" }}>·</span>
            </div>
          )))}
        </div></div>
      </div>

      <div style={{ maxWidth:1200, margin:"0 auto", padding:"20px 20px 60px" }}>

        {/* BREADCRUMB — macro-area e settore reali del prodotto (da product_sectors);
            i click portano al catalogo con i filtri già applicati */}
        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.muted, marginBottom:20, flexWrap:"wrap" }}>
          <span onClick={() => { window.location.href = "/"; }} style={{ cursor:"pointer" }}>Home</span><ChevronRight size={13}/>
          {crumb?.macro && (<><span onClick={() => { window.location.href = `/catalogo?macro=${encodeURIComponent(crumb.macro_slug || "")}`; }} style={{ cursor:"pointer" }}>{crumb.macro}</span><ChevronRight size={13}/></>)}
          {crumb?.sector && (<><span onClick={() => { window.location.href = `/catalogo?macro=${encodeURIComponent(crumb.macro_slug || "")}&sector=${encodeURIComponent(crumb.sector_slug || "")}`; }} style={{ cursor:"pointer" }}>{crumb.sector}</span><ChevronRight size={13}/></>)}
          {!crumb?.macro && !crumb?.sector && (<><span onClick={() => { window.location.href = "/catalogo"; }} style={{ cursor:"pointer" }}>Catalogo</span><ChevronRight size={13}/></>)}
          <span style={{ color:C.text, fontWeight:600 }}>{product.name}</span>
        </div>

        {/* PRODUCT HEADER */}
        <div style={{ display:"flex", gap:18, alignItems:"flex-start", marginBottom:28, flexWrap:"wrap" }}>
          <div style={{ width:84, height:84, borderRadius:16, background:"#EFF6FF", border:"1px solid #BFDBFE", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <Beaker size={38} color={C.blue} />
          </div>
          <div style={{ flex:1, minWidth:260 }}>
            <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" }}>
              <span className="bs-chip" style={{ background:"#EFF6FF", color:"#1D4ED8" }}>{product.enum}</span>
              <span className="bs-chip" style={{ background:"#F1F5F9", color:C.muted }}>{product.category}</span>
              <span className="bs-chip" style={{ background:"#ECFDF5", color:C.green }}><Check size={11}/> {ranked.length} fornitori disponibili</span>
            </div>
            <h1 style={{ fontSize:32, fontWeight:800, letterSpacing:"-0.02em", marginBottom:6 }}>{product.name}</h1>
            <p style={{ fontSize:14, color:C.muted }}>{product.form} · Purezza {product.purityRange} · CAS {product.cas}</p>
            {productId && (
              <div style={{ marginTop:10 }}>
                <ProductFollowButton productId={productId} following={followingProduct} onChange={setFollowingProduct} muted={C.muted} border={C.border} />
              </div>
            )}
          </div>
          <div style={{ textAlign:"right" }}>
            {ranked.length ? (
              <>
                <div style={{ fontSize:12, color:C.muted }}>Prezzo indicativo da</div>
                <div className="bs-num" style={{ fontSize:28, fontWeight:800, color:C.blue }}>{eurKg(ranked[0].calc.preVatKg)}<span style={{ fontSize:14, fontWeight:400, color:C.muted }}>/kg</span> <IvaChip style={{ verticalAlign: "2px" }} /></div>
                <div style={{ display:"flex", alignItems:"center", gap:4, justifyContent:"flex-end", fontSize:12, color:C.green }}><TrendingDown size={12}/> -15,6% da gennaio</div>
                <div style={{ fontSize:10.5, color:C.muted, marginTop:2 }}>Spedizione inclusa</div>
              </>
            ) : (
              // Prodotto senza fornitori quotati (es. nuove materie prime a catalogo):
              // niente prezzo istantaneo, si può solo aprire un'asta a ribasso.
              <>
                <div style={{ fontSize:12, color:C.muted }}>Prezzo indicativo</div>
                <div className="bs-num" style={{ fontSize:22, fontWeight:800, color:C.muted }}>n.d.</div>
                <div style={{ fontSize:10.5, color:C.muted, marginTop:2 }}>Nessun fornitore ancora quotato</div>
              </>
            )}
          </div>
        </div>

        {/* MAIN GRID: left = buy flow, right = sticky summary could be; keep single col on mobile */}
        <div className="bs-grid-main" style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:24, alignItems:"start" }}>

          {/* LEFT COLUMN */}
          <div>
            {/* QUANTITA NECESSARIA — due passaggi: 1) formato, 2) numero di unita di quel formato */}
            <div style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:20, background:C.bg }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
                <div style={{ fontSize:14, fontWeight:700 }}>Seleziona le quantità necessarie</div>
                <span className="bs-chip" style={{ background:"#EFF6FF", color:"#1D4ED8" }}>Scaglione attuale: {tierLabel(qty)}</span>
              </div>

              <div style={{ fontSize:12.5, fontWeight:600, color:C.muted, marginBottom:8 }}>Seleziona formato disponibile</div>
              <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
                {formats.map((f,i) => (
                  <button key={i} onClick={() => selectFormat(i)} style={{ padding:"8px 14px", borderRadius:7, border:`1px solid ${selectedFormatIdx===i?C.blue:C.border}`, background:selectedFormatIdx===i?"#EFF6FF":"#fff", color:selectedFormatIdx===i?C.blue:C.text, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>
                    {f.size_kg} {massUnit}/{f.label}
                  </button>
                ))}
              </div>

              <div style={{ fontSize:12.5, fontWeight:600, color:C.muted, marginBottom:8 }}>Seleziona il numero di unità per il formato selezionato · il prezzo si aggiorna in base allo scaglione di volume</div>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <button className="bs-qty-btn" onClick={() => setUnitCount(unitCount - 1)}><Minus size={16}/></button>
                <div style={{ display:"flex", alignItems:"baseline", gap:6, background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 14px" }}>
                  <input className="bs-num" style={{ width:60, border:"none", outline:"none", fontSize:20, fontWeight:700, color:C.text }} value={unitCount} onChange={e => setUnitCount(parseInt(e.target.value.replace(/\D/g,"")||"0"))} />
                  <span style={{ fontSize:14, color:C.muted }}>unità</span>
                </div>
                <button className="bs-qty-btn" onClick={() => setUnitCount(unitCount + 1)}><Plus size={16}/></button>
                <div style={{ fontSize:13, color:C.muted, marginLeft:2 }}>= <b className="bs-num" style={{ color:C.text }}>{qty.toLocaleString("it-IT")} {massUnit}</b> totali <span style={{ color:"#94A3B8" }}>(automatico)</span></div>
              </div>
              {minUnits > 1 && <div style={{ fontSize:11.5, color:C.muted, marginTop:6 }}>Unità minima vendibile per questo fornitore: {minUnits} ({(minUnits*unitSizeKg).toLocaleString("it-IT")} {massUnit}).</div>}
              <div style={{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" }}>
                {[
                  ["Minimo d'ordine", minUnits],
                  ["1 pallet", unitsPerPallet],
                  ["1 container 20'", unitsPerContainer20],
                  ["1 container 40'", unitsPerContainer40],
                ].map(([label,n]) => (
                  <button key={label} onClick={() => { setUnitCount(n); setSelectedId(null); setSelectedFormatIdx(0); }} style={{ padding:"7px 12px", borderRadius:7, border:`1px solid ${unitCount===n?C.blue:C.border}`, background:unitCount===n?"#EFF6FF":"#fff", color:unitCount===n?C.blue:C.muted, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>
                    {label} <span style={{ color:"#94A3B8" }}>({n} unità · {(n*unitSizeKg).toLocaleString("it-IT")} {massUnit})</span>
                  </button>
                ))}
              </div>
            </div>


            {/* Indicatore soglia pallet — sempre visibile quando non c'è già un'asta, cambia stato in base alla quantità */}
            {!pool.exists && (
              <div style={{ border:`1px solid ${C.amber}44`, background:"#FFFBEB", borderRadius:12, padding:"12px 16px", marginBottom:20, display:"flex", alignItems:"center", gap:10, opacity: canOpenPool ? 1 : 0.5, transition:"opacity 0.25s ease" }}>
                <Info size={18} color={C.amber} style={{ flexShrink:0 }}/>
                <span style={{ fontSize:13, color:"#92400E", fontWeight:600 }}>
                  {canOpenPool
                    ? "Hai raggiunto la quantità minima per aprire un'asta a ribasso."
                    : `Quantità minima di 1 pallet (${palletKg.toLocaleString("it-IT")} kg), necessaria per aprire un'asta a ribasso, non ancora raggiunta.`}
                </span>
              </div>
            )}

            {/* POOL BANNER — an active pool already exists for this product */}
            {pool.exists && (
              <div style={{ border:`1.5px solid ${C.purple}`, background:"linear-gradient(135deg,#F5F0FF,#EDE4F7)", borderRadius:14, padding:"18px 20px", marginBottom:24 }}>
                <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                  <div style={{ width:42, height:42, borderRadius:11, background:C.purple, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, position:"relative" }}>
                    <Gavel size={20} color="#fff"/>
                    <span style={{ position:"absolute", top:-3, right:-3, width:11, height:11, borderRadius:"50%", background:C.red, border:"2px solid #fff" }}/>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                      <span style={{ fontSize:16, fontWeight:800 }}>{pool.myQuantityKg > 0 ? "Hai già aderito all'asta a ribasso di questo prodotto" : "C'è già un'asta a ribasso attiva per questo prodotto"}</span>
                      <span className="bs-chip" style={{ background:"#fff", color:C.purple, border:`1px solid ${C.purple}44` }}><Clock size={11}/> chiude tra {pool.closesIn}</span>
                    </div>
                    {pool.myQuantityKg > 0 && (
                      <div style={{ fontSize:13, color:C.text, marginBottom:10 }}>Hai già <b>{Number(pool.myQuantityKg).toLocaleString("it-IT")} kg</b> in questa asta.</div>
                    )}
                    <div style={{ fontSize:14, color:C.muted, lineHeight:1.6, marginBottom:14 }}>
                      È un'<b style={{ color:C.text }}>asta a ribasso</b>: <b style={{ color:C.text }}>{pool.companies} aziende</b> si sono già aggregate e <b style={{ color:C.text }}>{pool.suppliers} fornitori certificati</b> competono. Unendoti, paghi il prezzo più basso raggiunto — e il prezzo <b style={{ color:C.text }}>può solo scendere</b> fino alla chiusura.
                    </div>
                    <div style={{ display:"flex", gap:18, flexWrap:"wrap", marginBottom:14 }}>
                      <Fact icon={<Gavel size={15} color={C.purple}/>} label="Prezzo asta ora" value={`${eurKg(pool.bestPrice)}/kg`} />
                      <Fact icon={<TrendingDown size={15} color={C.green}/>} label="Risparmio stimato" value={joinSavings>0?eur(joinSavings):"in calo"} />
                      <Fact icon={<Users size={15} color={C.purple}/>} label="Già aggregate" value={`${pool.companies} aziende`} />
                    </div>
                    {/* disclaimer */}
                    <div style={{ display:"flex", gap:8, background:"#FFF7ED", border:`1px solid ${C.amber}44`, borderRadius:9, padding:"10px 12px", marginBottom:14 }}>
                      <Info size={18} color={C.amber} style={{ flexShrink:0 }}/>
                      <span style={{ fontSize:12, color:"#7C2D12", lineHeight:1.5 }}>
                        Unendoti accetti il <b>fornitore più economico</b> tra quelli certificati e attendi fino alla <b>chiusura dell'asta</b> — che dipende da quando è stato aperto (qui: tra {pool.closesIn}) e può anche essere imminente. Vuoi scegliere un fornitore o ricevere subito? Continua con l'Acquisto Rapido qui sotto.
                      </span>
                    </div>
                    <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
                      <button onClick={goToPool} style={{ background:C.purple, color:"#fff", border:"none", borderRadius:9, padding:"12px 22px", fontSize:14, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:7, fontFamily:"Inter,system-ui" }}>
                        <Users size={16}/> {pool.myQuantityKg > 0 ? "Aggiungi un quantitativo all'asta in corso" : "Unisciti all'asta"} <ArrowRight size={15}/>
                      </button>
                      <span style={{ fontSize:12, color:C.muted }}>oppure acquista subito qui sotto</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* POOL NUDGE — no active pool yet, but order is large enough to open one */}
            {!pool.exists && canOpenPool && (
              <div style={{ border:`1.5px solid ${C.purple}44`, background:"linear-gradient(135deg,#FBF7FF,#F3EEFF)", borderRadius:14, padding:"18px 20px", marginBottom:24 }}>
                <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                  <div style={{ width:42, height:42, borderRadius:11, background:C.purple, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <Gavel size={20} color="#fff"/>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>
                      Stai acquistando {(qty/1000).toLocaleString("it-IT")}t — apri un'asta a ribasso e potresti pagare meno
                    </div>
                    <div style={{ fontSize:14, color:C.muted, lineHeight:1.6, marginBottom:14 }}>
                      Trasforma il tuo acquisto in un'<b style={{ color:C.text }}>asta a ribasso</b>: altre aziende possono aggregarsi alla tua richiesta e il prezzo <b style={{ color:C.text }}>può solo scendere</b>. {ranked.length} fornitori certificati competono. In cambio, l'ordine si concretizza in <b style={{ color:C.text }}>7 giorni</b> anziché subito.
                    </div>
                    <div style={{ display:"flex", gap:18, flexWrap:"wrap", marginBottom:14 }}>
                      <Fact icon={<TrendingDown size={15} color={C.green}/>} label="Risparmio potenziale" value={poolPotential.pct>0?`fino a -${poolPotential.pct}%`:"prezzo in calo"} />
                      <Fact icon={<Users size={15} color={C.purple}/>} label="Fornitori in gara" value={`${ranked.length} certificati`} />
                      <Fact icon={<Clock size={15} color={C.amber}/>} label="Tempi" value="entro 7 giorni" />
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16, flexWrap:"wrap" }}>
                      <span style={{ fontSize:12, color:C.muted }}>Competono:</span>
                      {ranked.map(s => (
                        <span key={s.id} className={s.company_id ? "bs-suplink" : ""} onClick={() => { if (s.company_id) window.location.href = `/fornitore?id=${s.company_id}`; }} style={{ fontSize:12, color:C.text, display:"flex", alignItems:"center", gap:5, background:"#fff", border:`1px solid ${C.border}`, borderRadius:100, padding:"3px 10px" }}>
                          <span>{s.flag}</span> {s.name}
                        </span>
                      ))}
                    </div>
                    <label style={{ display:"flex", gap:9, alignItems:"flex-start", background:"#fff", border:`1px solid ${C.purple}33`, borderRadius:9, padding:"10px 12px", marginBottom:14, cursor:"pointer" }}>
                      <input type="checkbox" checked={openAcceptTerms} onChange={e => setOpenAcceptTerms(e.target.checked)} style={{ marginTop:2, width:16, height:16, accentColor:C.purple, flexShrink:0 }}/>
                      <span style={{ fontSize:12, color:C.muted, lineHeight:1.5 }}>
                        Aprendo l'asta accetto che la mia quantità entri nel volume aggregato e che il fornitore verrà scelto tra quelli certificati in base al prezzo più basso raggiunto alla chiusura.
                      </span>
                    </label>
                    <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
                      <button onClick={handleOpenPool} disabled={busy || !openAcceptTerms} style={{ background:C.purple, color:"#fff", border:"none", borderRadius:9, padding:"12px 22px", fontSize:14, fontWeight:700, cursor:(busy||!openAcceptTerms)?"default":"pointer", opacity:(busy||!openAcceptTerms)?0.5:1, display:"inline-flex", alignItems:"center", gap:7, fontFamily:"Inter,system-ui" }}>
                        <Gavel size={16}/> Apri un'asta a ribasso con {(qty/1000).toLocaleString("it-IT")}t <ArrowRight size={15}/>
                      </button>
                      <span style={{ fontSize:12, color:C.muted }}>oppure acquista subito qui sotto</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FEATURED SUPPLIER */}
            {Object.keys(variantOptions).length > 0 && (
              <div style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:16, marginBottom:20, background:"#fff" }}>
                <div style={{ fontSize:12.5, fontWeight:700, color:C.text, marginBottom:2 }}>Filtra per variante</div>
                <div style={{ fontSize:11.5, color:C.muted, marginBottom:10 }}>Selezionando una variante, i fornitori che non la offrono spariscono dal confronto.</div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  {Object.entries(variantOptions).map(([key, values]) => (
                    <div key={key}>
                      <label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:4, textTransform:"capitalize" }}>{key}</label>
                      <select value={variantFilters[key] || ""} onChange={e => { setVariantFilters(prev => ({ ...prev, [key]: e.target.value || undefined })); setSelectedId(null); }} style={{ border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 10px", fontSize:13, fontFamily:"Inter,system-ui", background:"#fff", color:C.text }}>
                        <option value="">Qualsiasi</option>
                        {values.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {featured ? (<>
            <div style={{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:C.blue, marginBottom:10 }}>In evidenza</div>
            <div style={{ border:`2px solid ${C.blue}`, borderRadius:16, padding:24, marginBottom:24, position:"relative", boxShadow:"0 8px 30px rgba(14,165,233,0.10)" }}>
              <div style={{ position:"absolute", top:-12, left:20, display:"flex", gap:8 }}>
                {featured.id===cheapestId && <span style={{ background:C.green, color:"#fff", borderRadius:100, padding:"4px 12px", fontSize:12, fontWeight:700 }}>★ Più conveniente</span>}
                {featured.id!==cheapestId && <span style={{ background:C.blue, color:"#fff", borderRadius:100, padding:"4px 12px", fontSize:12, fontWeight:700 }}>Selezionato da te</span>}
              </div>

              <div style={{ display:"flex", justifyContent:"space-between", gap:16, flexWrap:"wrap", marginBottom:18 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <span className={featured.company_id ? "bs-suplink" : ""} onClick={() => { if (featured.company_id) window.location.href = `/fornitore?id=${featured.company_id}`; }} style={{ fontSize:20, fontWeight:800 }}>{featured.name}</span>
                    <span style={{ fontSize:18 }}>{featured.flag}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:12, fontSize:13, color:C.muted, flexWrap:"wrap" }}>
                    <span style={{ display:"flex", alignItems:"center", gap:4 }}><Star size={13} fill={C.amber} color={C.amber}/> <b style={{ color:C.text }}>{featured.rating.toFixed(1)}</b> ({featured.reviews})</span>
                    <span>{featured.origin}</span>
                    <span>{featured.type}</span>
                    <span style={{ display:"flex", alignItems:"center", gap:4 }}><Truck size={13}/> {featured.delivery}</span>
                  </div>
                </div>
              </div>

              {/* MATERIA PRIMA + SPEDIZIONE, sempre visibili — IVA esclusa (quella si calcola al checkout) */}
              <div className="bs-feature-grid">
                <div style={{ background:C.bg, borderRadius:12, padding:"16px 18px" }}>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:10, fontWeight:600 }}>Materia prima + spedizione · {(qty/1000)}t</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                    <Row label={`Prodotto (${eurKg(featured.calc.unit)}/kg)`} val={eur(featured.calc.product)} />
                    <Row label="Spedizione alla tua sede" val={eur(featured.calc.shipping)} />
                    {consolidatedWith(featured.company_id) && (
                      <div style={{ fontSize:11, color:C.green, fontWeight:700, display:"flex", alignItems:"center", gap:4 }}><Check size={11}/> Si unisce alla spedizione di ciò che hai già nel carrello da questo fornitore</div>
                    )}
                    <div style={{ borderTop:`1px solid ${C.border}`, marginTop:4, paddingTop:9, display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                      <span style={{ fontSize:14, fontWeight:700 }}>Totale <IvaChip style={{ verticalAlign: "baseline" }} /></span>
                      <span className="bs-num" style={{ fontSize:24, fontWeight:800, color:C.text }}>{eur(featured.calc.preVat)}</span>
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>L'IVA la vedi nel riepilogo al checkout, dopo aver scelto l'indirizzo.</div>
                </div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:12, color:C.muted }}>Costo</div>
                  <div className="bs-num" style={{ fontSize:40, fontWeight:800, color:C.blue, lineHeight:1.1 }}>{eurKg(featured.calc.preVatKg)}</div>
                  <div style={{ fontSize:13, color:C.muted, marginBottom:14 }}>/kg · spedizione inclusa <IvaChip /></div>
                  <button className="bs-btn" onClick={handleBuyNow} disabled={busy || !featured} style={{ width:"100%", fontSize:16, padding:"14px", opacity:(busy||!featured)?0.6:1, cursor:(busy||!featured)?"default":"pointer" }}>Acquista ora <ArrowRight size={18}/></button>
                  <button onClick={handleAddToCart} disabled={busy || !featured} style={{ width:"100%", marginTop:8, background:"transparent", color:C.blue, border:`1.5px solid ${C.blue}`, borderRadius:10, padding:"12px", fontSize:14.5, fontWeight:700, cursor:(busy||!featured)?"default":"pointer", opacity:(busy||!featured)?0.6:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontFamily:"Inter,system-ui" }}><ShoppingCart size={16}/> Aggiungi al carrello</button>
                  {cartOk && <div style={{ marginTop:8, fontSize:12.5, color:C.green, fontWeight:700, display:"flex", alignItems:"center", gap:5 }}><Check size={13}/> Aggiunto! <span onClick={() => { window.location.href = "/carrello"; }} style={{ cursor:"pointer", textDecoration:"underline" }}>Vai al carrello</span></div>}
                  {actionMsg && <div style={{ marginTop:8, fontSize:12, color:C.red, fontWeight:600 }}>{actionMsg}</div>}
                  {pool.exists && (
                  <div style={{ marginTop:10, fontSize:13 }}>
                    <span style={{ color:C.muted }}>oppure </span>
                    <span onClick={goToPool} style={{ color:C.purple, fontWeight:600, cursor:"pointer" }}>c'è un'asta a ribasso attiva: ora {eurKg(pool.bestPrice)}/kg →</span>
                  </div>
                  )}
                </div>
              </div>

              {/* certs */}
              <div style={{ display:"flex", gap:8, marginTop:16, flexWrap:"wrap", alignItems:"center" }}>
                <span style={{ fontSize:12, color:C.muted, display:"flex", alignItems:"center", gap:4 }}><Shield size={13}/> Certificazioni:</span>
                {featured.certs.map(c => <span key={c} className="bs-chip" style={{ background:"#ECFDF5", color:C.green }}><Check size={10}/> {c}</span>)}
                <span style={{ marginLeft:"auto", fontSize:12, color:C.muted }}>Purezza <b style={{ color:C.text }}>{featured.purity}</b></span>
              </div>

              {/* variante: granulometria, purezza, colore, ecc. — libere per fornitore */}
              {Object.keys(featured.variantAttributes || {}).length > 0 && (
                <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap", alignItems:"center" }}>
                  {Object.entries(featured.variantAttributes).map(([k,v]) => (
                    <span key={k} className="bs-chip" style={{ background:"#F1F5F9", color:C.text }}>{k}: <b>{String(v)}</b></span>
                  ))}
                </div>
              )}
            </div>

            {/* OTHER SUPPLIERS */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, flexWrap:"wrap", gap:8 }}>
              <div style={{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:C.muted }}>Altri {others.length} fornitori per {(qty/1000)}t</div>
              <span style={{ fontSize:12, color:C.muted }}>Ordinati per costo (merce + spedizione) · IVA esclusa</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:28 }}>
              {others.map(s => (
                <div key={s.id} className="bs-supplier-row">
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                      <span className={s.company_id ? "bs-suplink" : ""} onClick={() => { if (s.company_id) window.location.href = `/fornitore?id=${s.company_id}`; }} style={{ fontSize:15, fontWeight:700 }}>{s.name}</span><span>{s.flag}</span>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:C.muted, flexWrap:"wrap" }}>
                      <span style={{ display:"flex", alignItems:"center", gap:3 }}><Star size={11} fill={C.amber} color={C.amber}/> {s.rating.toFixed(1)}</span>
                      <span>{s.type}</span>
                    </div>
                  </div>
                  <div className="bs-col-hide" style={{ textAlign:"center" }}>
                    <div style={{ fontSize:11, color:C.muted }}>Purezza</div>
                    <div style={{ fontSize:14, fontWeight:600 }}>{s.purity}</div>
                  </div>
                  <div className="bs-col-hide" style={{ textAlign:"center" }}>
                    <div style={{ fontSize:11, color:C.muted, display:"flex", alignItems:"center", justifyContent:"center", gap:3 }}><Truck size={11}/></div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{s.delivery}</div>
                  </div>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:11, color:C.muted }}>Costo/kg *</div>
                    <div className="bs-num" style={{ fontSize:18, fontWeight:800, color:C.blue }}>{eurKg(s.calc.preVatKg)}</div>
                  </div>
                  <div className="bs-col-hide" style={{ textAlign:"center" }}>
                    <div style={{ fontSize:11, color:C.muted }}>Merce + spedizione</div>
                    <div className="bs-num" style={{ fontSize:13, fontWeight:600 }}>{eur(s.calc.product)} + {eur(s.calc.shipping)}</div>
                    {consolidatedWith(s.company_id) && <div style={{ fontSize:10, color:C.green, fontWeight:700, marginTop:2 }}>spedizione consolidabile</div>}
                  </div>
                  <button className="bs-btn-ghost" onClick={() => { setSelectedId(s.id); setSelectedFormatIdx(0); window.scrollTo({top:0,behavior:"smooth"}); }}>Seleziona</button>
                </div>
              ))}
            </div>
            </>) : (
              <div style={{ border:`1px dashed ${C.border}`, borderRadius:14, padding:"28px 24px", marginBottom:28, textAlign:"center", color:C.muted }}>
                <Beaker size={26} color={C.muted} style={{ marginBottom:8 }} />
                <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:4 }}>Nessun fornitore quotato per questo prodotto</div>
                <div style={{ fontSize:13, marginBottom:14 }}>Puoi comunque aprire un'asta a ribasso: aggreghi la domanda e i fornitori certificati competono al ribasso.</div>
                {canOpenPool && (
                  <label style={{ display:"flex", gap:9, alignItems:"flex-start", background:"#fff", border:`1px solid ${C.border}`, borderRadius:9, padding:"10px 12px", marginBottom:14, cursor:"pointer", textAlign:"left" }}>
                    <input type="checkbox" checked={openAcceptTerms} onChange={e => setOpenAcceptTerms(e.target.checked)} style={{ marginTop:2, width:16, height:16, accentColor:C.purple, flexShrink:0 }}/>
                    <span style={{ fontSize:12, color:C.muted, lineHeight:1.5 }}>
                      Aprendo l'asta accetto che la mia quantità entri nel volume aggregato e che il fornitore verrà scelto tra quelli certificati in base al prezzo più basso raggiunto alla chiusura.
                    </span>
                  </label>
                )}
                {canOpenPool
                  ? <button onClick={handleOpenPool} disabled={busy || !openAcceptTerms} style={{ background:C.purple, color:"#fff", border:"none", borderRadius:9, padding:"12px 22px", fontSize:14, fontWeight:700, cursor:(busy||!openAcceptTerms)?"default":"pointer", opacity:(busy||!openAcceptTerms)?0.5:1, display:"inline-flex", alignItems:"center", gap:7, fontFamily:"Inter,system-ui" }}><Gavel size={16}/> Apri un'asta a ribasso con {(qty/1000).toLocaleString("it-IT")}t</button>
                  : <div style={{ fontSize:12 }}>Imposta almeno {(palletKg/1000).toLocaleString("it-IT")}t (1 pallet) per aprire un'asta a ribasso.</div>}
                {actionMsg && <div style={{ marginTop:8, fontSize:12, color:C.red, fontWeight:600 }}>{actionMsg}</div>}
              </div>
            )}

            {/* TECHNICAL DATASHEET — collapsible */}
            <div style={{ border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden", marginBottom:24 }}>
              <div style={{ padding:"18px 20px", background:C.bg }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                  <FileText size={18} color={C.blue} />
                  <span style={{ fontSize:16, fontWeight:700 }}>Scheda tecnica</span>
                </div>
                {/* summary always visible */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:14 }}>
                  {[["Denominazione",product.name],["Numero E",product.enum],["CAS",product.cas],["Forma",product.form],["Purezza",product.purityRange]].map(([k,v]) => (
                    <div key={k}>
                      <div style={{ fontSize:11, color:C.muted, marginBottom:2 }}>{k}</div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              {showSpecs && (
                <div style={{ padding:"4px 20px 8px" }}>
                  {[
                    ["Formula molecolare", product.formula],
                    ["Peso molecolare", product.mw],
                    ["Rotazione ottica", "+12,0° a +13,0° (soluzione 20%)"],
                    ["Perdita all'essiccamento", "≤ 0,5%"],
                    ["Residuo all'incenerimento (solfati)", "≤ 0,1%"],
                    ["Metalli pesanti (come Pb)", "≤ 10 mg/kg"],
                    ["Arsenico", "≤ 3 mg/kg"],
                    ["Conformità", "Reg. (UE) 231/2012 · Codex OIV · FCC"],
                    ["Packaging disponibile", "Sacchi 25 kg · Big bag 500/1000 kg"],
                    ["Shelf life", "36 mesi se conservato in luogo asciutto"],
                  ].map(([k,v]) => (
                    <div key={k} className="bs-spec-row"><span style={{ color:C.muted }}>{k}</span><span style={{ fontWeight:600, textAlign:"right" }}>{v}</span></div>
                  ))}
                  <div style={{ display:"flex", gap:10, marginTop:16, flexWrap:"wrap" }}>
                    <button className="bs-btn-ghost"><Download size={14}/> Scheda di Sicurezza (SDS)</button>
                    <button className="bs-btn-ghost"><Download size={14}/> Certificato di Analisi (CoA)</button>
                    <button className="bs-btn-ghost"><Download size={14}/> Scheda tecnica PDF</button>
                  </div>
                </div>
              )}
              <button onClick={() => setShowSpecs(!showSpecs)} style={{ width:"100%", padding:"12px", background:"#fff", border:"none", borderTop:`1px solid ${C.border}`, color:C.blue, fontSize:14, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontFamily:"Inter,system-ui" }}>
                {showSpecs ? <>Mostra meno <ChevronUp size={16}/></> : <>Mostra scheda tecnica completa <ChevronDown size={16}/></>}
              </button>
            </div>

            {/* Q&A */}
            {qa.length > 0 && (
            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Domande tecniche</div>
              {qa.map((item,i) => (
                <div key={i} style={{ border:`1px solid ${C.border}`, borderRadius:10, marginBottom:8, overflow:"hidden" }}>
                  <button onClick={() => setOpenQa(openQa===i?null:i)} style={{ width:"100%", padding:"14px 16px", background:"#fff", border:"none", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, textAlign:"left", fontFamily:"Inter,system-ui" }}>
                    <span style={{ fontSize:14, fontWeight:600, color:C.text }}>{item.q}</span>
                    <ChevronDown size={16} color={C.muted} style={{ transform:openQa===i?"rotate(180deg)":"none", transition:"transform 0.2s", flexShrink:0 }}/>
                  </button>
                  {openQa===i && <div style={{ padding:"0 16px 14px", fontSize:14, color:C.muted, lineHeight:1.6 }}>{item.a}</div>}
                </div>
              ))}
            </div>
            )}
          </div>

          {/* RIGHT COLUMN — sticky cards */}
          <div style={{ position:"sticky", top:80, display:"flex", flexDirection:"column", gap:16 }}>
            {/* POOL CARD */}
            {pool.exists && (
            <div style={{ border:`1px solid ${C.purple}33`, borderRadius:14, padding:18, background:"#FBF7FF" }}>
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:8 }}>
                <Gavel size={15} color={C.purple}/>
                <span style={{ fontSize:13, fontWeight:700, color:C.purple }}>Asta a ribasso attiva</span>
                <span style={{ marginLeft:"auto", fontSize:12, color:C.muted, display:"flex", alignItems:"center", gap:3 }}><Clock size={11}/> {pool.closesIn}</span>
              </div>
              <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8 }}>
                <span className="bs-num" style={{ fontSize:24, fontWeight:800, color:C.purple }}>{eurKg(pool.bestPrice)}</span>
                <span style={{ fontSize:12, color:C.muted }}>/kg · miglior prezzo ora</span>
              </div>
              <p style={{ fontSize:13, color:C.muted, marginBottom:12, lineHeight:1.5 }}>
                <b style={{ color:C.text }}>{pool.companies} aziende</b> già aggregate · <b style={{ color:C.text }}>{pool.suppliers} fornitori</b> in gara. Il prezzo può solo scendere fino alla chiusura.
              </p>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:6 }}>
                <span style={{ color:C.muted }}>Volume aggregato</span>
                <span className="bs-num" style={{ fontWeight:600 }}>{(pool.current/1000).toFixed(1)}t</span>
              </div>
              <div style={{ height:7, background:"#EDE4F7", borderRadius:100, overflow:"hidden", marginBottom:14 }}>
                <div style={{ width:`${Math.max(6, Math.min(100, Math.round((pool.current/(palletKg*20))*100)))}%`, height:"100%", background:`linear-gradient(90deg,${C.purple},#A855F7)`, borderRadius:100 }}/>
              </div>
              <button onClick={goToPool} style={{ width:"100%", background:C.purple, color:"#fff", border:"none", borderRadius:9, padding:"12px", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontFamily:"Inter,system-ui" }}>
                {pool.myQuantityKg > 0 ? "Aggiungi un quantitativo" : "Unisciti all'asta"} <ArrowRight size={15}/>
              </button>
            </div>
            )}

            {/* PRICE HISTORY */}
            <div style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:18 }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>Andamento prezzo</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:10 }}>
                <span className="bs-num" style={{ fontSize:22, fontWeight:800, color:C.blue }}>€2,42</span>
                <span style={{ fontSize:12, color:C.green, display:"flex", alignItems:"center", gap:2 }}><TrendingDown size={11}/> -15,6%</span>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={CHART} margin={{ top:4, right:4, bottom:0, left:-22 }}>
                  <XAxis dataKey="t" tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fill:C.muted, fontSize:10, fontFamily:"JetBrains Mono" }} axisLine={false} tickLine={false} domain={["auto","auto"]} tickFormatter={v=>`€${v.toFixed(1)}`}/>
                  <Tooltip contentStyle={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, fontSize:12 }} formatter={v=>[`€${v.toFixed(2)}/kg`,"Prezzo"]}/>
                  <Line type="monotone" dataKey="v" stroke={C.blue} strokeWidth={2.5} dot={false} activeDot={{ r:4 }}/>
                </LineChart>
              </ResponsiveContainer>
              <div style={{ display:"flex", gap:5, marginTop:8 }}>
                {["1M","3M","6M","1A"].map(t => <button key={t} style={{ flex:1, padding:"5px", fontSize:11, border:`1px solid ${t==="6M"?C.blue:C.border}`, background:t==="6M"?"#EFF6FF":"#fff", color:t==="6M"?C.blue:C.muted, borderRadius:6, cursor:"pointer", fontFamily:"Inter,system-ui" }}>{t}</button>)}
              </div>
            </div>

            {/* SAMPLE / SAFETY NOTE */}
            <div style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:18 }}>
              <button className="bs-btn-ghost" style={{ width:"100%", marginBottom:10 }}><Beaker size={14}/> Richiedi un campione</button>
              <div style={{ display:"flex", gap:8, fontSize:12, color:C.muted, lineHeight:1.5 }}>
                <Shield size={26} color={C.green} style={{ flexShrink:0 }}/>
                <span>Pagamento protetto in <b style={{ color:C.text }}>escrow</b>: il fornitore viene pagato solo dopo la tua conferma di consegna conforme.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ background:"#050D18", padding:"28px 20px" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:14 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display:"flex", alignItems:"center", gap:9, cursor:"pointer" }}>
            <BSIcon size={26} uid="foot"/>
            <span style={{ fontSize:15, fontWeight:900, color:"#F0F6FF" }}>BulkStrike</span>
          </div>
          <div style={{ display:"flex", gap:18, flexWrap:"wrap" }}>
            {[["Termini","/legale#termini"],["Privacy","/legale#privacy"],["Cookie","/legale#cookie"],["Contatti","mailto:info@bulkstrike.com"]].map(([l,href]) => <a key={l} href={href} style={{ fontSize:13, color:"#3B5A7A", cursor:"pointer", textDecoration:"none" }}>{l}</a>)}
          </div>
          <div style={{ fontSize:13, color:"#3B5A7A" }}>© 2026 BulkStrike S.r.l.</div>
        </div>
      </div>

      {/* CHATBOT */}
      <BulkStrikeChatWidget accent={C.blue} />
    </div>
  );
}

function Row({ label, val }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
      <span style={{ fontSize:13, color:"#64748B" }}>{label}</span>
      <span className="bs-num" style={{ fontSize:14, fontWeight:600 }}>{val}</span>
    </div>
  );
}

function Fact({ icon, label, value }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ fontSize:11, color:"#64748B" }}>{label}</div>
        <div style={{ fontSize:14, fontWeight:700, color:"#0F172A" }}>{value}</div>
      </div>
    </div>
  );
}
