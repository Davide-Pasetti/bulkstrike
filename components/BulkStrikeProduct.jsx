import { useState, useMemo, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Search, ArrowRight, Check, Clock, ChevronDown, ChevronRight, ChevronUp, Star, Shield, Truck, FileText, Download, Plus, Minus, Beaker, TrendingDown, Users, Gavel, Info, ShoppingCart, Factory, ExternalLink, MessageSquare, X, Wine } from "lucide-react";
import { getProduct, getOpenPoolForProduct, getPriceReference, getProductBreadcrumb, getSession, upsertCartItem, poolErrorMessage, searchProducts, getCart, isFollowingProduct, getMarketPriceSeries, getMarketIndexSeries, getProductSpecs, getProductCandidateSuppliers, getMyCompany, getMarketPriceSeriesByPiazza, requestSamplesBulk, bulkSampleGlobalError, getProductSampling, getMyCompanyAddress } from "@/lib/api";
import PriceSourceNote from "@/components/PriceSourceNote";
import CountryFlag from "@/components/CountryFlag";
import { ytdChange } from "@/lib/priceTrend";
import ProductFollowButton from "@/components/BulkStrikeProductFollow";
import BulkStrikeTierProgress from "@/components/BulkStrikeTierProgress";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import SupplierName, { SupplierLoginHint } from "@/components/BulkStrikeSupplierName";
import BulkStrikeChatWidget from "@/components/BulkStrikeChatWidget";
import { BSIcon } from "@/components/BSLogo";
import { IvaChip, SupplierTypeBadges } from "@/components/BulkStrikeBadges";

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
  default_unit: "kg",
  sacco_kg: 25,
  pallet_kg: 1000,
  container_kg: null,
  auctionRestricted: false,
  sdsUrl: null,
  tdsUrl: null,
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

const SEED_POOL = { exists:true, id:null, bestPrice:1.68, current:13800, companies:8, suppliers:4, closesIn:"4g 9h", closesAt:null, finalPhaseEndsAt:null, status:"open", myQuantityKg:0 };  // pool/asta attiva su questo prodotto

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
// Suffisso unità del grafico prezzi: il payload delle serie porta ora `unit`
// (non si assume più €/kg). 'kg'→/kg, 'hl_grado'→/hl-grado, 'hl'→/hl.
const unitSuffix = (u) => u === "hl_grado" ? "/hl-grado" : u === "hl" ? "/hl" : "/kg";
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
  // NIENTE fallback a 0: un fornitore senza price_tiers reali non ha un prezzo,
  // punto. Inventare [Infinity, 0] produceva un "prezzo" fittizio pari al solo
  // costo di spedizione (bug: mostrava box "Acquista ora" con materia prima
  // a €0,00/kg per fornitori che non hanno ancora pubblicato un prezzo).
  const hasPrice = tiers.length > 0;
  const purity = (s.grade && /\d/.test(s.grade)) ? (s.grade.match(/[\d.,]+%/)?.[0] || "") : "";
  return {
    id: s.supplier_product_id,
    company_id: s.company_id,
    name: s.name,
    origin: s.country,
    region: s.region || null,
    flag: flagFor(s.country),
    rating: s.rating ?? 0,
    reviews: s.reviews_count ?? 0,
    delivery: s.lead_time_days != null ? `${s.lead_time_days} gg` : "—",
    type: s.grade || (s.origin === "natural" ? "Naturale" : s.origin === "synthetic" ? "Sintetico" : "—"),
    purity,
    certs: s.certifications || [],
    hasPrice,
    // Specifiche enologiche (solo prodotti a campionatura). null altrimenti.
    wine: s.wine || null,
    // 'verified' | 'pending' (DAV-33): decide in quale sezione compare un
    // fornitore senza prezzo pubblicato.
    status: s.status || null,
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
    default_unit: p.default_unit || "kg",
    // 'purchase' | 'sample_only' (DAV-77): sample_only = vini/mosti sfusi, solo
    // richiesta di campionatura (niente carrello/asta/promo).
    listing_mode: p.listing_mode || "purchase",
    pallet_kg: p.pallet_kg || 1000,
    // Formati di vendita del prodotto impostati da admin (null = non applicabile).
    sacco_kg: p.sacco_kg ?? null,
    container_kg: p.container_kg ?? null,
    // Divieto d'asta a ribasso per legge (agricoli/alimentari grezzi, D.Lgs. 198/2021).
    auctionRestricted: !!p.auction_restricted_by_law,
    // Schede documentali (URL pubblici, popolati per CAS). null se non disponibili.
    sdsUrl: p.scheda_sicurezza_url || null,
    tdsUrl: p.scheda_tecnica_url || null,
  };
}
// Segnalazione di un possibile fornitore per un prodotto senza offerte attive.
// Nessun invio automatico: si apre il client email dell'utente, che decide se spedire.
const SUGGEST_SUPPLIER_EMAIL = "davide@bulkstrike.com";
function suggestSupplierMailto(productName) {
  const nome = productName || "—";
  const subject = `Segnalazione fornitore — ${nome}`;
  const body = [
    "Vi segnalo questo possibile venditore/fornitore per questo prodotto:",
    "",
    `Prodotto: ${nome}`,
    "Nome fornitore proposto:",
    "Sito web / contatto:",
    "Note:",
    "",
  ].join("\n");
  return `mailto:${SUGGEST_SUPPLIER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
// La stessa azienda può essere stata censita più volte (una per settore), quindi
// tornare duplicata: si tiene una riga per (ragione sociale, sito).
// Fra due copie della stessa azienda tiene quella con l'email di contatto: è
// l'unica differenza che cambia cosa può fare l'utente (chiedere un preventivo
// via mail invece di dover passare dal sito).
function dedupeCandidates(list) {
  const byKey = new Map();
  for (const c of list || []) {
    const key = `${(c.legal_name || "").trim().toLowerCase()}|${(c.website || "").trim().toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev || (!prev.support_email && c.support_email)) byKey.set(key, c);
  }
  return [...byKey.values()];
}

// I siti in anagrafica sono spesso senza protocollo ("www.basf.com"): senza
// https:// il browser lo tratterebbe come percorso relativo di bulkstrike.com.
function normalizeUrl(website) {
  const s = (website || "").trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

// Richiesta di preventivo a un fornitore non ancora su BulkStrike. In inglese:
// sono aziende internazionali e non sappiamo se leggono l'italiano.
// La quantità è quella già scelta in pagina; se non è ancora impostata resta il
// segnaposto [quantity], che il buyer completa prima di inviare.
function quoteRequestMailto({ email, productName, qty, unit, buyerCompanyName }) {
  const amount = qty > 0 ? `${qty.toLocaleString("en-US")} ${unit}` : "[quantity]";
  const subject = `Quote Request – ${productName}`;
  const body = [
    "Dear Sir or Madam,",
    "",
    `We would like to request a quotation for ${amount} of ${productName}.`,
    "",
    "Could you kindly share your best price, minimum order quantity, and estimated lead time for delivery within the EU?",
    "",
    "Thank you for your time — we look forward to hearing from you.",
    "",
    // Da sloggato non conosciamo l'azienda: si firma da sé, meglio di una riga vuota.
    buyerCompanyName ? `Kind regards,\n${buyerCompanyName}` : "Kind regards,",
    "",
    "---",
    "This inquiry was generated via BulkStrike (bulkstrike.com), a B2B marketplace for raw materials and industrial supplies. We invite you to list your product pricing on BulkStrike in order to receive orders directly from verified buyers.",
    "",
  ].join("\n");
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// da getOpenPoolForProduct() → shape SEED_POOL
function mapDbPool(pool) {
  if (!pool) return { exists:false, id:null, bestPrice:0, current:0, companies:0, suppliers:0, closesIn:"", closesAt:null, finalPhaseEndsAt:null, status:null, myQuantityKg:0 };
  return {
    exists: true,
    id: pool.id,
    // Un'asta aperta ha SEMPRE un prezzo (di partenza da listino, poi il miglior
    // rilancio): best_price_per_kg dalla RPC è sempre valorizzato. num_bids
    // (suppliers) distingue "prezzo di partenza" da "prezzo attuale".
    bestPrice: pool.best_price_per_kg != null ? Number(pool.best_price_per_kg) : 0,
    current: Number(pool.total_volume_kg) || 0,
    companies: Number(pool.participants) || 0,
    suppliers: Number(pool.num_bids) || 0,
    closesIn: untilLabel(pool.status === "final_phase" ? pool.final_phase_ends_at : pool.closes_at),
    // Timestamp grezzi per il countdown live: closes_at, o final_phase_ends_at
    // quando l'asta è nella fase finale delle contro-offerte.
    closesAt: pool.closes_at || null,
    finalPhaseEndsAt: pool.final_phase_ends_at || null,
    status: pool.status || "open",
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
// Countdown esteso "Chiude tra 6 giorni e 9 ore" per il box asta. nowMs è lo
// stato che ticchetta (ogni minuto): passato esplicitamente così il testo si
// aggiorna da solo. Torna null se manca il timestamp o non è ancora montato
// il tick lato client (evita mismatch di hydration con Date.now() nell'SSR).
function auctionCountdown(iso, nowMs) {
  if (!iso || nowMs == null) return null;
  const ms = new Date(iso).getTime() - nowMs;
  if (ms <= 0) return "In chiusura";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `Chiude tra ${d} ${d === 1 ? "giorno" : "giorni"} e ${h} ${h === 1 ? "ora" : "ore"}`;
  if (h > 0) return `Chiude tra ${h} ${h === 1 ? "ora" : "ore"} e ${m} min`;
  return `Chiude tra ${m} min`;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function ProductPage() {
  const [qty, setQty] = useState(0); // inizializzata all'ordine minimo appena caricato il prodotto (vedi effect sotto)
  const qtyInitRef = useRef(null);   // traccia per quale prodotto la quantità è già stata inizializzata
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
  const [specs, setSpecs] = useState([]); // specifiche tecniche reali (product_specs)
  const [suppliers, setSuppliers] = useState(SEED_SUPPLIERS);
  const [pool, setPool] = useState(SEED_POOL);
  const [nowMs, setNowMs] = useState(null); // orologio per il countdown del box asta (null finché non montato lato client)
  const [qa, setQa] = useState(SEED_QA);
  const [productId, setProductId] = useState(null);
  const [followingProduct, setFollowingProduct] = useState(false);
  const [priceRef, setPriceRef] = useState(null);
  const [priceSeries, setPriceSeries] = useState(null); // storico prezzi di mercato (ISMEA/CUN) o null
  const [indexSeries, setIndexSeries] = useState(null); // indice di tendenza settoriale Eurostat o null
  const [loading, setLoading] = useState(true);
  const [crumb, setCrumb] = useState(null); // { macro, sector } reali del prodotto
  const [busy, setBusy] = useState(false);
  const [cartOk, setCartOk] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  // Aziende censite dalla nostra ricerca che vendono il prodotto ma non sono su
  // BulkStrike: nessun prezzo, nessun acquisto in piattaforma, solo segnalazione.
  const [candidates, setCandidates] = useState([]);
  const [buyerCompanyName, setBuyerCompanyName] = useState("");
  const [cartSupplierIds, setCartSupplierIds] = useState(new Set()); // fornitori già presenti nel tuo carrello → spedizione si consolida
  // Campionatura vino (DAV-77): elenco fornitori (RPC dedicata), filtro
  // Nazione/Regione, selezione multipla (Set indipendente dal filtro) e
  // specifiche della richiesta cumulativa.
  const [sampleSuppliers, setSampleSuppliers] = useState([]);
  const [sampling, setSampling] = useState(null);   // get_product_sampling per le materie prime (purchase)
  const [shipAddress, setShipAddress] = useState(""); // indirizzo di spedizione (solo form semplificato)
  const [wfCountry, setWfCountry] = useState("");   // nazione selezionata
  const [wfRegion, setWfRegion] = useState("");     // regione selezionata
  const [selectedSP, setSelectedSP] = useState(() => new Set());
  const [quantitaPartita, setQuantitaPartita] = useState("");
  const [specColore, setSpecColore] = useState("");
  const [specLavorazione, setSpecLavorazione] = useState("");
  const [specRefrigerato, setSpecRefrigerato] = useState(false);
  const [specSo2, setSpecSo2] = useState("");
  const [specGradoMin, setSpecGradoMin] = useState("");
  const [specGradoMax, setSpecGradoMax] = useState("");
  const [specVarieta, setSpecVarieta] = useState("");
  const [specDenomTipo, setSpecDenomTipo] = useState("");
  const [specDenomTesto, setSpecDenomTesto] = useState("");
  const [specAnnata, setSpecAnnata] = useState("");
  const [specNote, setSpecNote] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null); // array risposta RPC | null
  const [bulkErr, setBulkErr] = useState("");
  const [piazzaData, setPiazzaData] = useState(null);
  const [selectedPiazze, setSelectedPiazze] = useState([]); // piazze mostrate sul grafico vino
  useEffect(() => { if (productId) isFollowingProduct(productId).then(setFollowingProduct).catch(() => {}); }, [productId]);
  // Ripristina la selezione salvata prima di un eventuale redirect al login.
  useEffect(() => {
    if (!productId) return;
    try {
      const raw = sessionStorage.getItem(`bs_sample_sel_${productId}`);
      if (raw) { setSelectedSP(new Set(JSON.parse(raw))); sessionStorage.removeItem(`bs_sample_sel_${productId}`); }
    } catch { /* sessionStorage non disponibile */ }
  }, [productId]);
  // Alla ricezione dei dati per piazza, preseleziona quella con la rilevazione più recente.
  useEffect(() => {
    const piazze = piazzaData?.piazze || [];
    if (piazze.length) {
      const recent = [...piazze].sort((a, b) => String(b.ultima_data || "").localeCompare(String(a.ultima_data || "")))[0];
      setSelectedPiazze([recent.piazza]);
    } else setSelectedPiazze([]);
  }, [piazzaData]);

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
      // Serve solo a firmare la richiesta di preventivo ai fornitori non iscritti.
      try {
        const c = await getMyCompany();
        if (c?.legal_name) setBuyerCompanyName(c.legal_name);
      } catch (e) {}
    })();
  }, []);
  const consolidatedWith = (companyId) => companyId && cartSupplierIds.has(companyId);

  // Orologio del countdown nel box asta: parte al mount (client-only) e ticchetta
  // ogni minuto — al secondo non serve. Init a Date.now() dentro l'effect, non
  // nello stato iniziale, per non divergere dall'SSR.
  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // carica il prodotto reale da ?id=
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) { setLoading(false); return; }   // nessun id → resta la demo
    setProductId(id);
    setLoading(true);
    setPriceSeries(null);
    setIndexSeries(null);
    getMarketPriceSeries(id).then(setPriceSeries).catch(() => setPriceSeries(null));
    getMarketIndexSeries(id).then(setIndexSeries).catch(() => setIndexSeries(null));
    (async () => {
      try {
        const [p, op, ref, bc, sp, cand] = await Promise.all([
          getProduct(id),
          getOpenPoolForProduct(id).catch(() => null),
          getPriceReference(id).catch(() => null),
          getProductBreadcrumb(id).catch(() => null),
          getProductSpecs(id).catch(() => []),
          getProductCandidateSuppliers(id).catch(() => []),
        ]);
        if (p) {
          setProduct(mapDbProduct(p));
          setSpecs(sp || []);
          setCandidates(dedupeCandidates(cand));
          setSuppliers((p.suppliers || []).map(mapDbSupplier));
          setPriceRef(ref != null ? Number(ref) : null);
          setPool(mapDbPool(op));
          // Campionatura UNIFICATA: un'unica RPC per TUTTI i prodotti. Decide cosa
          // mostrare (form dettagliato o semplificato, o riquadro grigio) ed elenca
          // i fornitori campionabili. Il layout a due colonne è lo stesso per tutti;
          // cambia solo se compare il blocco "Specifiche" (richiede_specifiche).
          getProductSampling(id).then((s) => {
            setSampling(s);
            if (s?.fornitori) setSampleSuppliers(s.fornitori);
          }).catch(() => setSampling(null));
          // Indirizzo di spedizione precompilato con la sede registrata (modificabile).
          getMyCompanyAddress().then((a) => {
            if (!a) return;
            const parts = [a.address, a.city, a.country].map((x) => (x || "").trim()).filter(Boolean);
            if (parts.length) setShipAddress(parts.join(", "));
          }).catch(() => {});
          // Vini/mosti sfusi: in più il grafico dei prezzi per piazza.
          if (p.listing_mode === "sample_only") {
            getMarketPriceSeriesByPiazza(id).then(setPiazzaData).catch(() => setPiazzaData(null));
          }
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
  // Attributi di variante disponibili tra i fornitori (arrivano già popolati e
  // approvati da getProduct). Un fornitore senza la variante selezionata sparisce.
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
    // Solo fornitori con un prezzo reale (price_tiers) entrano nel confronto
    // "Acquista ora": compute()/priceForQty() richiedono tiers non vuoti.
    const priced = suppliers.filter(s => s.hasPrice !== false);
    if (keys.length === 0) return priced;
    return priced.filter(s => keys.every(k => (s.variantAttributes || {})[k] === variantFilters[k]));
  }, [suppliers, variantFilters]);
  // Fornitori VERIFICATI senza prezzo pubblicato (caso raro/transitorio dopo
  // DAV-33: verificato di norma implica listino visibile): restano nella
  // sezione "Altri fornitori su BulkStrike".
  const verifiedUnpriced = useMemo(
    () => suppliers.filter(s => s.hasPrice === false && s.status === "verified"),
    [suppliers]
  );
  // Fornitori censiti ma NON ancora verificati da un admin (DAV-33): sezione
  // "Fornitori non verificati", contattabili via messaggistica interna
  // (mascheramento contatti DAV-23), mai col mailto esterno dei candidati.
  const unverifiedSuppliers = useMemo(
    () => suppliers.filter(s => s.hasPrice === false && s.status !== "verified"),
    [suppliers]
  );

  const ranked = useMemo(() => {
    return filteredSuppliers.map(s => ({ ...s, calc: compute(s, qty) })).sort((a,b) => a.calc.preVatKg - b.calc.preVatKg);
  }, [filteredSuppliers, qty]);

  const featured = (selectedId ? ranked.find(s => s.id === selectedId) : ranked[0]) || null;
  const others = featured ? ranked.filter(s => s.id !== featured.id) : [];
  // Campionatura (DAV-77): questi prodotti (vini/mosti sfusi) non si acquistano
  // online — niente prezzo aggregato, carrello, asta, promo. Solo richiesta campione.
  const sampleOnly = product.listing_mode === "sample_only";
  // La distinzione fra form dettagliato (vini/mosti) e semplificato (industriali)
  // arriva dal backend (richiede_specifiche), MAI dal nome del prodotto.
  // showSampling = va mostrata la sezione campioni a due colonne.
  const richiedeSpec = sampling ? !!sampling.richiede_specifiche : sampleOnly;
  const showSampling = sampleOnly || !!sampling?.consentito;
  const limite24h = sampling?.limite_24h ?? 5;
  // Fornitori vino dalla RPC dedicata (verificati e non). Nazione con conteggio
  // (desc); Regione dipende dalla nazione. La selezione vive in un Set
  // indipendente dal filtro: cambiando filtro le scelte non si perdono.
  const sampleNazioni = useMemo(() => {
    const m = new Map();
    for (const s of sampleSuppliers) { const c = s.country; if (!c) continue; m.set(c, (m.get(c) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [sampleSuppliers]);
  const sampleRegioni = useMemo(() => (
    wfCountry ? [...new Set(sampleSuppliers.filter(s => s.country === wfCountry && s.region).map(s => s.region))].sort() : []
  ), [sampleSuppliers, wfCountry]);
  const filteredSampleSuppliers = useMemo(() => sampleSuppliers.filter(s => {
    if (wfCountry && s.country !== wfCountry) return false;
    if (wfRegion && s.region !== wfRegion) return false;
    return true;
  }), [sampleSuppliers, wfCountry, wfRegion]);
  const sampleFilterActive = !!(wfCountry || wfRegion);
  const toggleSP = (id) => setSelectedSP(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allFilteredSelected = filteredSampleSuppliers.length > 0 && filteredSampleSuppliers.every(s => selectedSP.has(s.supplier_product_id));
  const toggleSelectAllFiltered = () => setSelectedSP(prev => {
    const n = new Set(prev);
    if (allFilteredSelected) filteredSampleSuppliers.forEach(s => n.delete(s.supplier_product_id));
    else filteredSampleSuppliers.forEach(s => n.add(s.supplier_product_id));
    return n;
  });
  const supplierNameById = (id) => (sampleSuppliers.find(s => s.supplier_product_id === id)?.legal_name) || "Fornitore";
  // Il campo "Lavorazione" compare SOLO sulla pagina Mosto.
  const isMostoPage = productId === "5328289f-776f-4681-938f-6ede71712bf3";
  // Errori per-fornitore: i messaggi dei trigger sono già in italiano; l'indice
  // unico torna un messaggio grezzo che mappiamo.
  function bulkSampleErrorText(msg) {
    if (!msg) return "Errore imprevisto.";
    if (/duplicate key|unique/i.test(msg)) return "Hai già una richiesta di campionatura aperta per questo fornitore.";
    return msg;
  }
  async function submitBulkSample() {
    if (selectedSP.size === 0) return;
    if (specGradoMin !== "" && specGradoMax !== "" && Number(specGradoMin) > Number(specGradoMax)) {
      setBulkErr("Il grado minimo non può superare il massimo."); return;
    }
    const session = await getSession().catch(() => null);
    if (!session) {
      // Conserva la selezione e porta al login.
      try { if (productId) sessionStorage.setItem(`bs_sample_sel_${productId}`, JSON.stringify([...selectedSP])); } catch { /* no-op */ }
      window.location.href = "/auth/login";
      return;
    }
    setBulkBusy(true); setBulkErr(""); setBulkResult(null);
    try {
      const res = await requestSamplesBulk({
        supplierProductIds: [...selectedSP],
        specQuantitaPartita: quantitaPartita === "" ? null : Number(quantitaPartita),
        specColore: specColore || null,
        specLavorazione: (isMostoPage ? specLavorazione : "") || null,
        specRefrigerato,
        specSo2: specSo2 === "" ? null : Number(specSo2),
        specGradoMin: specGradoMin === "" ? null : Number(specGradoMin),
        specGradoMax: specGradoMax === "" ? null : Number(specGradoMax),
        specVarieta: specVarieta.trim() || null,
        specDenominazioneTipo: specDenomTipo || null,
        specDenominazione: specDenomTesto.trim() || null,
        specAnnata: specAnnata === "" ? null : Number(specAnnata),
        message: specNote.trim() || null,
        // L'indirizzo è ora sempre presente nel form; se vuoto il backend usa la sede.
        shippingAddress: shipAddress.trim() || null,
      });
      setBulkResult(Array.isArray(res) ? res : []);
      // Dopo un invio riuscito: svuota le checkbox (le specifiche restano compilate).
      setSelectedSP(new Set());
    } catch (e) {
      setBulkErr(bulkSampleGlobalError(e));
    }
    setBulkBusy(false);
  }
  const specLabel = { display:"block", fontSize:12, fontWeight:600, color:C.muted };
  const specInput = { marginTop:4, width:"100%", minWidth:0, padding:"8px 10px", border:`1px solid ${C.border}`, borderRadius:7, fontSize:13, background:"#fff", color:C.text };
  const cheapestId = ranked.length ? ranked[0].id : null;

  // Acquisto Rapido è a unità di vendita (es. sacchi da 25 kg), non a kg liberi.
  // Il formato dipende dal fornitore in evidenza; qty (kg) resta lo stato reale,
  // unitCount è solo la sua vista in unità per quel formato.
  const massUnit = product.default_unit === "L" ? "L" : "kg"; // solido→kg, liquido→litri
  // Formati di vendita: quelli del fornitore in evidenza se li espone; altrimenti
  // i formati REALI del prodotto impostati da admin (sacco/pallet/container), non
  // un sacco da 25 kg inventato. Coerente con la pagina asta. Se il prodotto non
  // ha nessun formato impostato, si vende a unità libera (kg/L).
  const productFormats = [
    ...(product.sacco_kg ? [{ label: "sacco", size_kg: product.sacco_kg }] : []),
    ...(product.pallet_kg ? [{ label: "pallet", size_kg: product.pallet_kg }] : []),
    ...(product.container_kg ? [{ label: "container", size_kg: product.container_kg }] : []),
  ];
  const formats = featured?.formats?.length
    ? featured.formats
    : (productFormats.length ? productFormats : [{ label: massUnit, size_kg: 1 }]);
  const currentFormat = formats[selectedFormatIdx] || formats[0];
  const unitLabel = currentFormat.label;
  const unitSizeKg = currentFormat.size_kg;
  // Unità minima vendibile: dal profilo del fornitore (min_order_kg). Se non
  // impostata, il fornitore permette anche 1 sola unità.
  const minUnits = featured?.min_order_kg > 0 ? Math.max(1, Math.ceil(featured.min_order_kg / unitSizeKg)) : 1;
  const unitCount = Math.max(1, Math.round(qty / unitSizeKg));
  const setUnitCount = (n) => setQtySafe(Math.max(minUnits, n) * unitSizeKg);
  const selectFormat = (idx) => { setSelectedFormatIdx(idx); setQtySafe(Math.max(minUnits, unitCount) * formats[idx].size_kg); };

  // Divieto d'asta a ribasso per legge (prodotti agricoli/alimentari grezzi):
  // niente apertura né adesione, solo Acquisto Rapido. Rif. D.Lgs. 198/2021.
  const auctionRestricted = !!product.auctionRestricted;
  // "Acquisto di gruppo" vs "Asta a ribasso": con esattamente 1 fornitore non c'è
  // competizione, quindi il box rimanda a un acquisto di gruppo (aggregazione
  // domanda) invece che a un'asta. Con 2+ resta l'asta a ribasso.
  const supplierCount = new Set(suppliers.map(s => s.company_id).filter(Boolean)).size;
  const groupBuy = supplierCount === 1;
  // Il divieto (D.Lgs 198/2021) vieta l'ASTA A RIBASSO, non la domanda aggregata:
  // blocca il box pool SOLO quando sarebbe un'asta competitiva (2+ fornitori). Con
  // 1 fornitore resta l'Acquisto di gruppo (aggregazione a prezzo fisso), consentito.
  const auctionBlocked = auctionRestricted && !groupBuy;
  // Variazione "da gennaio" (da inizio anno) sul dato REALE: €/kg per gli agri
  // (ISMEA/CUN), indice settoriale per metalli/plastica/chimica (Eurostat). Se
  // non c'è nessun dato reale → null → l'header nasconde la percentuale.
  const headerTrend = (priceSeries?.series?.length ? ytdChange(priceSeries.series, "v") : null)
    ?? (indexSeries?.series?.length ? ytdChange(indexSeries.series, "index") : null);
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

  // Quantità di DEFAULT = ordine minimo del formato di default (non un valore alto
  // arbitrario). Si (re)imposta una sola volta per prodotto, appena i dati sono
  // caricati; dopo, le scelte dell'utente (stepper/formato) non vengono sovrascritte.
  useEffect(() => {
    if (loading) return;
    const key = productId || "demo";
    if (qtyInitRef.current === key) return;
    qtyInitRef.current = key;
    setQty(minUnits * unitSizeKg);
  }, [loading, productId, minUnits, unitSizeKg]);

  // ── azioni reali (openPool / upsertCartItem richiedono login → altrimenti /registrati)
  async function requireAuth() {
    const session = await getSession();
    if (!session) { window.location.href = "/registrati"; return false; }
    return true;
  }
  // Il bottone del box "Apri un'asta" NON crea più il pool sul posto: porta
  // alla pagina di preparazione (/pool?product=...), dove il riepilogo è
  // visibile e l'apertura vera avviene solo con un'azione esplicita separata.
  function goToOpenAuction() {
    if (!productId) { window.location.href = "/registrati"; return; }
    if (pool.exists && pool.id) { window.location.href = `/pool?id=${pool.id}`; return; } // esiste già → unisciti
    window.location.href = `/pool?product=${productId}`;
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
        .bs-btn { background:#0369A1; color:#fff; border:none; border-radius:10px; padding:13px 24px; font-size:15px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:8px; transition:all 0.2s; font-family:'Inter',system-ui; }
        .bs-btn:hover { background:#075985; transform:translateY(-1px); box-shadow:0 6px 20px rgba(3,105,161,0.3); }
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
        .bs-chatbot-btn { width:56px; height:56px; border-radius:50%; background:#0369A1; border:3px solid #fff; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 20px rgba(3,105,161,0.4); }
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
              {/* "con prezzo", non "disponibili": i fornitori senza listino sono
                  comunque presenti sulla scheda, ma non sono acquistabili — la
                  distinzione fra quotato e solo censito deve restare netta. */}
              {sampleOnly
                ? <span className="bs-chip" style={{ background:"#FDF2F8", color:"#9D174D" }}><Wine size={11}/> {sampleSuppliers.length} {sampleSuppliers.length === 1 ? "fornitore" : "fornitori"} · su campionatura</span>
                : <span className="bs-chip" style={{ background:"#ECFDF5", color:C.green }}><Check size={11}/> {ranked.length} {ranked.length === 1 ? "fornitore" : "fornitori"} con prezzo</span>}
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
            {sampleOnly ? (
              <>
                <div style={{ fontSize:12, color:C.muted }}>Vini e mosti sfusi</div>
                <div style={{ fontSize:16, fontWeight:800, color:"#9D174D" }}>Solo su campionatura</div>
                <div style={{ fontSize:10.5, color:C.muted, marginTop:2 }}>Prezzo in €/hl-grado, per listino</div>
              </>
            ) : ranked.length ? (
              <>
                <div style={{ fontSize:12, color:C.muted }}>Prezzo indicativo da</div>
                <div className="bs-num" style={{ fontSize:28, fontWeight:800, color:C.blue }}>{eurKg(ranked[0].calc.preVatKg)}<span style={{ fontSize:14, fontWeight:400, color:C.muted }}>/kg</span> <IvaChip style={{ verticalAlign: "2px" }} /></div>
                {headerTrend != null && (
                  <div style={{ display:"flex", alignItems:"center", gap:4, justifyContent:"flex-end", fontSize:12, color:headerTrend<=0?C.green:C.red }}>{headerTrend<=0 && <TrendingDown size={12}/>} {headerTrend>0?"+":""}{headerTrend.toFixed(1)}% da gennaio</div>
                )}
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
            {/* QUANTITA NECESSARIA — nascosta per i prodotti a sola campionatura */}
            {!sampleOnly && (
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

            {!sampleOnly && featured ? (<>
            <div style={{ fontSize:12, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:C.blue, marginBottom:10 }}>In evidenza</div>
            <div style={{ border:`2px solid ${C.blue}`, borderRadius:16, padding:24, marginBottom:24, position:"relative", boxShadow:"0 8px 30px rgba(14,165,233,0.10)" }}>
              <div style={{ position:"absolute", top:-12, left:20, display:"flex", gap:8 }}>
                {featured.id===cheapestId && <span style={{ background:C.green, color:"#fff", borderRadius:100, padding:"4px 12px", fontSize:12, fontWeight:700 }}>★ Più conveniente</span>}
                {featured.id!==cheapestId && <span style={{ background:"#0369A1", color:"#fff", borderRadius:100, padding:"4px 12px", fontSize:12, fontWeight:700 }}>Selezionato da te</span>}
              </div>

              <div style={{ display:"flex", justifyContent:"space-between", gap:16, flexWrap:"wrap", marginBottom:18 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <SupplierName name={featured.name} companyId={featured.company_id} className="bs-suplink" style={{ fontSize:20, fontWeight:800 }}/>
                    <CountryFlag country={featured.origin} size={16} />
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:12, fontSize:13, color:C.muted, flexWrap:"wrap" }}>
                    <span style={{ display:"flex", alignItems:"center", gap:4 }}><Star size={13} fill={C.amber} color={C.amber}/> <b style={{ color:C.text }}>{featured.rating.toFixed(1)}</b> ({featured.reviews})</span>
                    <span>{featured.origin}</span>
                    <span>{featured.type}</span>
                    <span style={{ display:"flex", alignItems:"center", gap:4 }}><Truck size={13}/> {featured.delivery}</span>
                  </div>
                  <SupplierLoginHint/>
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
                  {pool.exists && !auctionBlocked && (
                  <div style={{ marginTop:10, fontSize:13 }}>
                    <span style={{ color:C.muted }}>oppure </span>
                    <span onClick={goToPool} style={{ color:groupBuy?C.blue:C.purple, fontWeight:600, cursor:"pointer" }}>{groupBuy ? "c'è un acquisto di gruppo attivo" : "c'è un'asta a ribasso attiva"}: ora {eurKg(pool.bestPrice)}/kg →</span>
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
                      <SupplierName name={s.name} companyId={s.company_id} className="bs-suplink" style={{ fontSize:15, fontWeight:700 }}/><CountryFlag country={s.origin} size={13} />
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
            </>) : null}

            {/* CAMPIONATURA — vini/mosti sfusi (DAV-77): filtro Nazione/Regione +
                lista fornitori selezionabili. La richiesta cumulativa è nella
                card sticky della colonna destra. */}
            {showSampling && (<>
              {/* FILTRO — due soli campi: Nazione (con conteggio) e Regione (dipendente). */}
              <div style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:14, marginBottom:14, background:C.bg }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:"0.04em" }}>Filtra i fornitori</span>
                  {sampleFilterActive && <button onClick={() => { setWfCountry(""); setWfRegion(""); }} style={{ background:"none", border:"none", color:C.blue, fontSize:12.5, fontWeight:700, cursor:"pointer" }}>Azzera</button>}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10 }}>
                  <div>
                    <label style={{ display:"block", fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>Nazione</label>
                    <select value={wfCountry} onChange={e => { setWfCountry(e.target.value); setWfRegion(""); }}
                      style={{ width:"100%", padding:"8px 10px", border:`1px solid ${C.border}`, borderRadius:7, fontSize:13, background:"#fff", color:C.text, cursor:"pointer" }}>
                      <option value="">Tutte le nazioni</option>
                      {sampleNazioni.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display:"block", fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>Regione</label>
                    <select value={wfRegion} disabled={!wfCountry} onChange={e => setWfRegion(e.target.value)}
                      style={{ width:"100%", padding:"8px 10px", border:`1px solid ${C.border}`, borderRadius:7, fontSize:13, background:!wfCountry?"#F1F5F9":"#fff", color:!wfCountry?C.muted:C.text, cursor:!wfCountry?"not-allowed":"pointer" }}>
                      <option value="">Tutte le regioni</option>
                      {sampleRegioni.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* CONTEGGIO + seleziona/deseleziona tutti i filtrati */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap", marginBottom:12 }}>
                <span style={{ fontSize:14, fontWeight:700, color:C.text }}>
                  {sampleFilterActive ? `${filteredSampleSuppliers.length} fornitori (su ${sampleSuppliers.length})` : `${sampleSuppliers.length} fornitori`}
                </span>
                {filteredSampleSuppliers.length > 0 && (
                  <button onClick={toggleSelectAllFiltered} style={{ background:"none", border:"none", color:C.blue, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                    {allFilteredSelected ? "Deseleziona tutti" : "Seleziona tutti i fornitori filtrati"}
                  </button>
                )}
              </div>

              {sampleSuppliers.length === 0 ? (
                <div style={{ border:`1px dashed ${C.border}`, borderRadius:14, padding:"28px 20px", textAlign:"center", color:C.muted, marginBottom:16 }}>
                  Nessun fornitore per questo prodotto.
                </div>
              ) : filteredSampleSuppliers.length === 0 ? (
                <div style={{ border:`1px dashed ${C.border}`, borderRadius:14, padding:"28px 20px", textAlign:"center", color:C.muted, marginBottom:16 }}>
                  Nessun fornitore corrisponde ai filtri. <span onClick={() => { setWfCountry(""); setWfRegion(""); }} style={{ color:C.blue, fontWeight:700, cursor:"pointer" }}>Azzera i filtri</span>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
                  {filteredSampleSuppliers.map(s => {
                    const sel = selectedSP.has(s.supplier_product_id);
                    const place = [s.city, s.region, s.country].filter(Boolean).join(", ");
                    return (
                      <label key={s.supplier_product_id} style={{ display:"flex", gap:12, alignItems:"flex-start", border:`1px solid ${sel ? "#9D174D" : C.border}`, borderRadius:12, padding:"14px 16px", background:sel?"#FDF2F8":"#fff", cursor:"pointer" }}>
                        <input type="checkbox" checked={sel} onChange={() => toggleSP(s.supplier_product_id)} aria-label={`Seleziona ${s.legal_name}`} style={{ width:17, height:17, accentColor:"#9D174D", cursor:"pointer", flexShrink:0, marginTop:2 }}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:3 }}>
                            <span style={{ fontSize:15, fontWeight:800, color:C.text }}>{s.legal_name}</span>
                            {s.verified
                              ? <span className="bs-chip" style={{ background:"#ECFDF5", color:C.green }}><Check size={11}/> Verificato</span>
                              : <span className="bs-chip" style={{ background:"#FEF3C7", color:C.amber }}>Non verificato</span>}
                            <SupplierTypeBadges roles={s.roles} type={s.supplier_type} />
                          </div>
                          <div style={{ fontSize:12.5, color:C.muted, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                            <CountryFlag code={s.country_iso2} country={s.country} size={12} />
                            <span>{place || s.country || "—"}</span>
                          </div>
                          {Array.isArray(s.colori) && s.colori.length > 0 && (
                            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:7 }}>
                              {s.colori.map(col => (
                                <span key={col} className="bs-chip" style={{ background:"#F1F5F9", color:C.text, textTransform:"capitalize" }}>{col}</span>
                              ))}
                            </div>
                          )}
                          {/* Link alla scheda/sito: stopPropagation così NON spuntano
                              la checkbox del <label> (restano apribili per capire chi si sta selezionando). */}
                          {(s.company_id || s.website) && (
                            <div style={{ display:"flex", gap:14, marginTop:8, flexWrap:"wrap" }}>
                              {s.company_id && (
                                <a href={`/fornitore?id=${s.company_id}`} onClick={e => e.stopPropagation()}
                                  style={{ fontSize:12, color:C.blue, fontWeight:700, textDecoration:"none" }}>Scheda fornitore</a>
                              )}
                              {s.website && (
                                <a href={s.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                  style={{ fontSize:12, color:C.blue, fontWeight:700, textDecoration:"none", display:"inline-flex", alignItems:"center", gap:3 }}>Sito web <ExternalLink size={11}/></a>
                              )}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {sampleOnly && (
                <div style={{ fontSize:12.5, color:C.muted, lineHeight:1.6, background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px", marginBottom:28 }}>
                  Vini e mosti sfusi non si acquistano online: seleziona i fornitori e richiedi un campione, poi concludi la trattativa direttamente con loro.
                </div>
              )}
            </>)}

            {/* SEGNALA UN FORNITORE — solo quando il prodotto non ha alcun fornitore
                attivo (getProduct filtra già active=true). Niente invio automatico:
                apre il client email dell'utente con oggetto e corpo precompilati. */}
            {!loading && suppliers.length === 0 && (
              <div style={{ border:`1px solid ${C.border}`, background:"#EFF6FF", borderRadius:14, padding:"18px 20px", marginBottom:28, display:"flex", gap:12, alignItems:"flex-start", flexWrap:"wrap" }}>
                <Beaker size={18} color={C.blue} style={{ flexShrink:0, marginTop:2 }} />
                <div style={{ flex:1, minWidth:220 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>Non ci sono attualmente fornitori che vendono questo prodotto</div>
                  <div style={{ fontSize:13, color:C.muted, lineHeight:1.55 }}>
                    Conosci un'azienda che lo produce o lo distribuisce?{" "}
                    <a
                      href={suggestSupplierMailto(product.name)}
                      style={{ color:C.blue, fontWeight:700, textDecoration:"underline" }}
                    >Segnalacelo</a>{" "}
                    e lo contattiamo noi.
                  </div>
                </div>
              </div>
            )}

            {/* FORNITORI VERIFICATI SENZA PREZZO PUBBLICATO — dopo DAV-33 è un
                caso raro/transitorio (l'approvazione admin rende visibile il
                listino già compilato), ma se esiste resta distinto dalla sezione
                "Fornitori non verificati": qui la verifica c'è, manca il listino. */}
            {!sampleOnly && verifiedUnpriced.length > 0 && (
              <div style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:"18px 20px", marginBottom:28 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <Factory size={17} color={C.muted} />
                  <span style={{ fontSize:15, fontWeight:700 }}>Altri fornitori su BulkStrike</span>
                  <span className="bs-chip" style={{ background:"#FEF3C7", color:C.amber }}>prezzo non ancora pubblicato</span>
                </div>
                <div style={{ fontSize:12.5, color:C.muted, lineHeight:1.55, marginBottom:14 }}>
                  Aziende verificate su BulkStrike che trattano questa materia prima ma non hanno
                  ancora caricato un listino per questo prodotto. Nessun acquisto protetto in escrow
                  finché non pubblicano un prezzo.
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:10 }}>
                  {verifiedUnpriced.map(s => (
                    <div key={s.id} style={{ border:`1px solid ${C.border}`, borderRadius:11, padding:"12px 13px", background:C.bg }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                        <SupplierName name={s.name} companyId={s.company_id} className="bs-suplink" style={{ fontSize:13.5, fontWeight:700 }}/>
                        <CountryFlag country={s.origin} size={12} />
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:11.5, color:C.muted, flexWrap:"wrap" }}>
                        <span style={{ display:"flex", alignItems:"center", gap:3 }}><Star size={11} fill={C.amber} color={C.amber}/> {s.rating.toFixed(1)}</span>
                        <span style={{ display:"flex", alignItems:"center", gap:3 }}><Truck size={11}/> {s.delivery}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FORNITORI NON VERIFICATI (DAV-33) — aziende censite su BulkStrike
                (schede da import, collegate al prodotto) che nessun admin ha
                ancora controllato. Niente prezzo né escrow, ma si contattano con
                la messaggistica INTERNA (mascheramento DAV-23) — mai col mailto
                esterno, che resta solo per i "Fornitori individuati" qui sotto. */}
            {!sampleOnly && unverifiedSuppliers.length > 0 && (
              <div style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:"18px 20px", marginBottom:28 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <Factory size={17} color={C.muted} />
                  <span style={{ fontSize:15, fontWeight:700 }}>Fornitori non verificati</span>
                  <span className="bs-chip" style={{ background:"#FEF3C7", color:C.amber }}>in attesa di verifica</span>
                </div>
                <div style={{ fontSize:12.5, color:C.muted, lineHeight:1.55, marginBottom:14 }}>
                  Aziende individuate da <b>fonti pubbliche</b> che trattano questa materia prima,
                  non ancora verificate da BulkStrike: nessun prezzo pubblicato né acquisto protetto
                  in escrow. Puoi comunque scriverle: la conversazione resta sulla piattaforma.
                  Sei il titolare di una di queste aziende? Dal suo profilo puoi rivendicarla o
                  chiederne la rimozione.
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:10 }}>
                  {unverifiedSuppliers.map(s => (
                    <div key={s.id} style={{ border:`1px solid ${C.border}`, borderRadius:11, padding:"12px 13px", background:C.bg, display:"flex", flexDirection:"column", gap:8 }}>
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                          <SupplierName name={s.name} companyId={s.company_id} className="bs-suplink" style={{ fontSize:13.5, fontWeight:700 }}/>
                          <CountryFlag country={s.origin} size={12} />
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:11.5, color:C.muted, flexWrap:"wrap" }}>
                          <span style={{ display:"flex", alignItems:"center", gap:3 }}><Star size={11} fill={C.amber} color={C.amber}/> {s.rating.toFixed(1)}</span>
                          <span style={{ display:"flex", alignItems:"center", gap:3 }}><Truck size={11}/> {s.delivery}</span>
                        </div>
                      </div>
                      {s.company_id && (
                        <div style={{ display:"flex", flexDirection:"column", gap:5, marginTop:"auto" }}>
                          <a href={`/messaggi?to=${s.company_id}`} className="bs-btn-ghost"
                            style={{ textDecoration:"none", justifyContent:"center", fontSize:12, borderColor:C.blue, color:C.blue, fontWeight:700 }}>
                            <MessageSquare size={12}/> Contatta fornitore
                          </a>
                          <a href={`/fornitore?id=${s.company_id}#titolare`}
                            style={{ fontSize:10.5, color:C.muted, textDecoration:"underline", textAlign:"center" }}>
                            Sei il titolare?
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FORNITORI INDIVIDUATI — aziende censite dalla nostra ricerca che
                vendono il prodotto ma non sono su BulkStrike. Complementare al
                banner qui sopra, non alternativa: il banner resta anche quando
                questa sezione c'è, perché servono a due cose diverse (segnalarci
                un fornitore nuovo vs contattarne uno già individuato). */}
            {candidates.length > 0 && (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Factory size={17} color={C.muted} />
                  <span style={{ fontSize: 15, fontWeight: 700 }}>Fornitori individuati</span>
                  <span className="bs-chip" style={{ background: "#F1F5F9", color: C.muted }}>non ancora su BulkStrike</span>
                </div>
                <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55, marginBottom: 14 }}>
                  Aziende che risultano vendere questa materia prima, individuate dalla nostra ricerca ma
                  non ancora iscritte a BulkStrike. Non hanno un&apos;offerta attiva qui: non c&apos;è prezzo né
                  acquisto protetto in escrow. <b>Contatto e trattativa avvengono direttamente sul loro sito,
                  fuori da BulkStrike.</b>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10 }}>
                  {candidates.map(c => {
                    const url = normalizeUrl(c.website);
                    return (
                      <div key={c.id} style={{ border: `1px solid ${C.border}`, borderRadius: 11, padding: "12px 13px", background: C.bg, display: "flex", flexDirection: "column", gap: 8 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>
                            <CountryFlag code={c.country_iso2} country={c.country} size={12} />
                            <span style={{ flex: 1, minWidth: 0 }}>{c.legal_name}</span>
                            <SupplierTypeBadges roles={c.roles} type={c.supplier_type} />
                          </div>
                          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{c.country || "Paese non indicato"}</div>
                        </div>
                        {url ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "auto" }}>
                            <a href={url} target="_blank" rel="noopener noreferrer" className="bs-btn-ghost"
                              style={{ textDecoration: "none", justifyContent: "center", fontSize: 12 }}>
                              Visita il sito <ExternalLink size={12} />
                            </a>
                            {/* Senza email pubblica non abbiamo un modulo contatti a cui
                                puntare: il preventivo si chiede dal sito dell'azienda. */}
                            {c.support_email ? (
                              <a href={quoteRequestMailto({ email: c.support_email, productName: product.name, qty, unit: massUnit, buyerCompanyName })}
                                className="bs-btn-ghost"
                                style={{ textDecoration: "none", justifyContent: "center", fontSize: 12, borderColor: C.blue, color: C.blue, fontWeight: 700 }}>
                                Chiedi un preventivo
                              </a>
                            ) : (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="bs-btn-ghost"
                                title="Nessuna email pubblica: la richiesta si fa dal sito dell'azienda"
                                style={{ textDecoration: "none", justifyContent: "center", fontSize: 12, borderColor: C.blue, color: C.blue, fontWeight: 700 }}>
                                Chiedi un preventivo <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                        ) : (
                          // Senza sito non mostriamo un link rotto. Se però l'azienda
                          // ha un'email pubblica, il preventivo si può comunque chiedere.
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "auto" }}>
                            <div style={{ fontSize: 11.5, color: C.muted, fontStyle: "italic" }}>Sito web non disponibile</div>
                            {c.support_email && (
                              <a href={quoteRequestMailto({ email: c.support_email, productName: product.name, qty, unit: massUnit, buyerCompanyName })}
                                className="bs-btn-ghost"
                                style={{ textDecoration: "none", justifyContent: "center", fontSize: 12, borderColor: C.blue, color: C.blue, fontWeight: 700 }}>
                                Chiedi un preventivo
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
                {/* Schede documentali reali (SDS/TDS): URL pubblici popolati per CAS.
                    Sempre visibili nella card; disabilitati se il prodotto non ne ha. */}
                <div style={{ display:"flex", gap:10, marginTop:16, flexWrap:"wrap" }}>
                  {product.sdsUrl ? (
                    <a href={product.sdsUrl} target="_blank" rel="noopener noreferrer" className="bs-btn-ghost" style={{ textDecoration:"none" }}><Download size={14}/> Scheda di sicurezza (SDS)</a>
                  ) : (
                    <button className="bs-btn-ghost" disabled title="Scheda di sicurezza non disponibile per questo prodotto" style={{ opacity:0.5, cursor:"not-allowed" }}><Download size={14}/> Scheda di sicurezza (SDS)</button>
                  )}
                  {product.tdsUrl ? (
                    <a href={product.tdsUrl} target="_blank" rel="noopener noreferrer" className="bs-btn-ghost" style={{ textDecoration:"none" }}><Download size={14}/> Scheda tecnica (TDS)</a>
                  ) : (
                    <button className="bs-btn-ghost" disabled title="Scheda tecnica non disponibile per questo prodotto" style={{ opacity:0.5, cursor:"not-allowed" }}><Download size={14}/> Scheda tecnica (TDS)</button>
                  )}
                </div>
              </div>
              {showSpecs && (
                <div style={{ padding:"4px 20px 8px" }}>
                  {/* Specifiche REALI da product_specs (una riga per campo, ordinate).
                      Sostituiscono i vecchi campi fissi/inventati. Se il prodotto non
                      ha specifiche (incl. i "Nessun dato"), messaggio dedicato. */}
                  {specs.length > 0 ? (
                    specs.map((s, i) => (
                      <div key={i} className="bs-spec-row"><span style={{ color:C.muted }}>{s.campo}</span><span style={{ fontWeight:600, textAlign:"right" }}>{s.valore}</span></div>
                    ))
                  ) : (
                    <div style={{ fontSize:13, color:C.muted, padding:"10px 0 6px", lineHeight:1.55 }}>
                      Scheda tecnica dettagliata non disponibile per questo prodotto.
                    </div>
                  )}
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
            {/* APRI ASTA — unica posizione in pagina: in alto a destra, sopra il
                grafico prezzi. La scelta tra questo box e il router sottostante
                si basa SOLO su pool.exists (tabella pools), MAI sulla presenza
                di un prezzo pubblicato: un prodotto con prezzi ma senza un'asta
                reale deve offrire "Apri un'asta", non "Vai alla pagina dell'asta"
                (visto dal vivo con l'Acido citrico). Con 1 solo fornitore resta
                il flusso Acquisto di gruppo (router sotto); col divieto di legge
                resta il box normativo. */}
            {/* SEZIONE CAMPIONI (colonna destra) — layout UNICO per vini/mosti e
                materie prime. Il blocco "Specifiche" appare solo se richiede_specifiche. */}
            {sampling && !sampleOnly && !sampling.consentito ? (
              <div style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 18px", background:C.bg }}>
                <div style={{ fontSize:15, fontWeight:800, color:C.text, marginBottom:6, display:"flex", alignItems:"center", gap:8 }}><Beaker size={17}/> Richiedi campioni</div>
                <div style={{ fontSize:13.5, color:C.muted, lineHeight:1.6 }}>
                  {sampling.messaggio || "Per questo prodotto non è possibile richiedere campioni al momento."}
                </div>
              </div>
            ) : showSampling ? (
              <div style={{ border:"1px solid #FBCFE8", borderRadius:14, padding:16, background:"#FDF2F8" }}>
                <div style={{ fontSize:15, fontWeight:800, color:"#9D174D", marginBottom:14 }}>
                  Richiedi campionatura ai fornitori selezionati ({selectedSP.size})
                </div>

                {/* (1) Specifiche per la richiesta — SOLO vini/mosti (richiede_specifiche) */}
                {richiedeSpec && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:C.text }}>Specifiche per la richiesta</div>
                  <div style={{ fontSize:11.5, color:C.muted, marginTop:2, marginBottom:12 }}>Facoltative. Vengono inoltrate a tutti i fornitori selezionati.</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    <div>
                      <div style={specLabel}>Quantità della partita che ti interessa acquistare</div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
                        <input type="number" min={1} max={100000} step={1} value={quantitaPartita} onChange={e=>setQuantitaPartita(e.target.value)} placeholder="es. 1000" style={{ ...specInput, marginTop:0 }}/>
                        <span style={{ fontSize:12, color:C.muted }}>hl</span>
                      </div>
                      <div style={{ fontSize:11, color:C.muted, marginTop:4, lineHeight:1.4 }}>Facoltativo, solo indicativo. Il fornitore può comunicarti quanto ha realmente disponibile anche se inferiore.</div>
                    </div>

                    <label style={specLabel}>Colore
                      <select value={specColore} onChange={e=>setSpecColore(e.target.value)} style={specInput}>
                        <option value="">Indifferente</option>
                        <option value="bianco">Bianco</option>
                        <option value="rosato">Rosato</option>
                        <option value="rosso">Rosso</option>
                      </select>
                    </label>

                    {isMostoPage && (
                      <label style={specLabel}>Lavorazione
                        <select value={specLavorazione} onChange={e=>setSpecLavorazione(e.target.value)} style={specInput}>
                          <option value="">Indifferente</option>
                          <option value="mosto_torbido">Mosto torbido</option>
                          <option value="mosto_limpido">Mosto limpido</option>
                          <option value="vnf">VNF (vino nuovo in fermentazione)</option>
                        </select>
                      </label>
                    )}

                    <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.text, cursor:"pointer" }}>
                      <input type="checkbox" checked={specRefrigerato} onChange={e=>setSpecRefrigerato(e.target.checked)} style={{ width:16, height:16, accentColor:"#9D174D" }}/>
                      Richiedo prodotto refrigerato
                    </label>

                    <label style={specLabel}>Solforosa libera richiesta
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
                        <input type="number" min={0} max={500} step={1} value={specSo2} onChange={e=>setSpecSo2(e.target.value)} placeholder="es. 30" style={{ ...specInput, marginTop:0 }}/>
                        <span style={{ fontSize:12, color:C.muted }}>mg/l</span>
                      </div>
                    </label>

                    <div>
                      <div style={specLabel}>{isMostoPage ? "Gradazione alcolica potenziale" : "Gradazione alcolica"}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
                        <input type="number" min={0.1} max={25} step={0.1} value={specGradoMin} onChange={e=>setSpecGradoMin(e.target.value)} placeholder="Da (min)" aria-label="Gradazione alcolica minima" style={{ ...specInput, marginTop:0 }}/>
                        <span style={{ fontSize:12, color:C.muted }}>–</span>
                        <input type="number" min={0.1} max={25} step={0.1} value={specGradoMax} onChange={e=>setSpecGradoMax(e.target.value)} placeholder="A (max)" aria-label="Gradazione alcolica massima" style={{ ...specInput, marginTop:0 }}/>
                        <span style={{ fontSize:12, color:C.muted }}>% vol</span>
                      </div>
                    </div>

                    <label style={specLabel}>Varietà
                      <input type="text" maxLength={200} value={specVarieta} onChange={e=>setSpecVarieta(e.target.value)} placeholder="es. Trebbiano, Sangiovese" style={specInput}/>
                    </label>

                    <div>
                      <div style={specLabel}>Denominazione</div>
                      <select value={specDenomTipo} onChange={e=>setSpecDenomTipo(e.target.value)} style={specInput}>
                        <option value="">Indifferente</option>
                        <option value="na_nc">NA/NC</option>
                        <option value="varietale">Varietale</option>
                        <option value="igp">IGP</option>
                        <option value="atto_dop">Atto a DOP</option>
                        <option value="atto_docg">Atto a DOCG</option>
                      </select>
                      <input type="text" maxLength={200} value={specDenomTesto} onChange={e=>setSpecDenomTesto(e.target.value)} placeholder="es. Montepulciano d'Abruzzo, Chianti..." aria-label="Dettaglio denominazione" style={{ ...specInput, marginTop:8 }}/>
                    </div>

                    <label style={specLabel}>Annata
                      <input type="number" min={1990} max={new Date().getFullYear() + 1} step={1} value={specAnnata} onChange={e=>setSpecAnnata(e.target.value)} placeholder="es. 2024" style={specInput}/>
                    </label>
                  </div>
                </div>
                )}

                {/* (2) Indirizzo di spedizione — sempre presente, precompilato */}
                <label style={specLabel}>Indirizzo di spedizione
                  <input value={shipAddress} onChange={e=>setShipAddress(e.target.value)} placeholder="Via, città, nazione" style={specInput}/>
                </label>
                <div style={{ fontSize:11, color:C.muted, marginTop:4, marginBottom:12 }}>Precompilato con la sede della tua azienda. Se lo lasci vuoto lo completiamo noi.</div>

                {/* (3) Note per il fornitore — sempre presente */}
                <label style={specLabel}>Note per il fornitore
                  <textarea value={specNote} onChange={e=>setSpecNote(e.target.value)} rows={3} maxLength={2000}
                    placeholder={richiedeSpec ? "" : "Descrivi l'uso previsto, il grado di purezza che ti serve o qualsiasi altra informazione utile al fornitore."}
                    style={{ ...specInput, resize:"vertical", fontFamily:"Inter,system-ui" }}/>
                </label>

                {/* (4) Pulsante di invio */}
                <button onClick={submitBulkSample} disabled={selectedSP.size === 0 || bulkBusy}
                  style={{ width:"100%", marginTop:12, background:(selectedSP.size===0||bulkBusy)?"#E9AEC6":"#9D174D", color:"#fff", border:"none", borderRadius:10, padding:"13px", fontSize:14.5, fontWeight:700, cursor:(selectedSP.size===0||bulkBusy)?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontFamily:"Inter,system-ui" }}>
                  <Beaker size={16}/> {bulkBusy ? "Invio…" : `Richiedi campioni ai fornitori selezionati (${selectedSP.size})`}
                </button>

                {bulkErr && <div style={{ marginTop:10, fontSize:13, color:C.red }}>{bulkErr}</div>}
                {bulkResult && (() => {
                  const created = bulkResult.filter(r => r.status === "created");
                  const failed = bulkResult.filter(r => r.status !== "created");
                  return (
                    <div style={{ marginTop:10, background:"#fff", border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px" }}>
                      <div style={{ fontSize:13.5, fontWeight:700, color:C.text }}>
                        {created.length > 0 ? `Richiesta inviata a ${created.length} ${created.length===1?"fornitore":"fornitori"}.` : "Nessuna richiesta inviata."}
                      </div>
                      {failed.length > 0 && (<>
                        <div style={{ fontSize:12.5, color:C.text, marginTop:6 }}>
                          {failed.length} non {failed.length===1?"è andata":"sono andate"} a buon fine: {bulkSampleErrorText(failed[0].error_message)}
                        </div>
                        <div style={{ fontSize:11.5, color:C.muted, marginTop:6, lineHeight:1.5 }}>
                          Non contattati: {failed.map(r => supplierNameById(r.supplier_product_id)).join(", ")}.
                        </div>
                      </>)}
                    </div>
                  );
                })()}

                {/* (5) limite 24h + (6) spese a carico del cliente */}
                <div style={{ fontSize:11.5, color:C.muted, marginTop:12, textAlign:"center" }}>
                  Massimo {limite24h} richieste di campionatura ogni 24 ore.
                </div>
                <div style={{ fontSize:11.5, color:C.muted, marginTop:4, textAlign:"center" }}>
                  Le spese di spedizione del campione sono a carico del cliente.
                </div>
              </div>
            ) : null}
            {!sampleOnly && !pool.exists && !auctionBlocked && !groupBuy && (
              /* Sfondo #FBF7FF: lo stesso rosino della palette viola gia' usato
                 dal box asta ("Asta a ribasso disponibile") nella pagina aste. */
              <div style={{ border:`1px dashed ${C.border}`, borderRadius:14, padding:"22px 18px", textAlign:"center", color:C.muted, background:"#FBF7FF" }}>
                <Beaker size={26} color={C.muted} style={{ marginBottom:8 }} />
                <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:4 }}>
                  {featured ? "Apri un'asta a ribasso" : "Nessun fornitore quotato per questo prodotto"}
                </div>
                {auctionRestricted ? (
                  <div style={{ fontSize:13, marginTop:6, lineHeight:1.55 }}>
                    La normativa italiana vieta l'acquisto di prodotti agricoli e alimentari tramite aste elettroniche a doppio ribasso, quindi non è possibile aprire un'asta a ribasso su questo prodotto. Resta disponibile solo con Acquisto Rapido, quando un fornitore è quotato.
                  </div>
                ) : (<>
                <div style={{ fontSize:13, marginBottom:14 }}>
                  {featured
                    ? "Non c'è ancora un'asta attiva per questo prodotto: aprila tu — aggreghi la domanda e i fornitori certificati competono al ribasso."
                    : "Puoi comunque aprire un'asta a ribasso: aggreghi la domanda e i fornitori certificati competono al ribasso."}
                </div>
                {canOpenPool
                  ? <button onClick={goToOpenAuction} style={{ background:C.purple, color:"#fff", border:"none", borderRadius:9, padding:"12px 22px", fontSize:14, fontWeight:700, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:7, fontFamily:"Inter,system-ui" }}><Gavel size={16}/> Prosegui per aprire l'asta <ArrowRight size={15}/></button>
                  : <div style={{ fontSize:12 }}>
                      Quantità minima per aprire l'asta a ribasso:
                      <div style={{ fontSize:15, fontWeight:800, color:C.text, margin:"3px 0" }}>1 pallet</div>
                      ({(palletKg/1000).toLocaleString("it-IT")}t)
                    </div>}
                </>)}
              </div>
            )}

            {/* BOX ASTA — sopra "Andamento prezzo". Mostrato SOLO quando esiste
                davvero un pool (aggregazione: "attiva / Vai alla pagina"),
                oppure per i casi speciali: divieto di legge (auctionBlocked) e
                Acquisto di gruppo con 1 solo fornitore (groupBuy, dove il
                router resta l'ingresso per aprirlo). Mai insieme al box
                "Apri un'asta" qui sopra. */}
            {!sampleOnly && (pool.exists || auctionBlocked || groupBuy) && (auctionBlocked ? (
              /* DIVIETO DI LEGGE — sostituisce il box asta per agricoli/alimentari grezzi
                 SOLO in asta competitiva (2+ fornitori). Con 1 fornitore mostra il box
                 "Acquisto di gruppo" (ramo else), che il divieto non vieta. */
              <div style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:16, background:C.bg }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <div style={{ width:32, height:32, borderRadius:9, background:"#F1F5F9", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <Info size={16} color={C.muted}/>
                  </div>
                  <span style={{ fontSize:14, fontWeight:800, color:C.text }}>Asta a ribasso non disponibile</span>
                </div>
                <div style={{ fontSize:13, color:C.muted, lineHeight:1.55 }}>
                  La normativa italiana vieta l'acquisto di prodotti agricoli e alimentari tramite aste elettroniche a doppio ribasso. Questo prodotto è disponibile solo con Acquisto Rapido.
                </div>
                <div style={{ fontSize:11, color:C.muted, opacity:0.85, lineHeight:1.5, marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
                  Rif. normativo: Direttiva (UE) 2019/633 del 17 aprile 2019 sulle pratiche commerciali sleali nella filiera agroalimentare; Decreto Legislativo 8 novembre 2021, n. 198, art. 5, comma 1, lett. a) (in vigore dal 15 dicembre 2021).
                </div>
              </div>
            ) : (
            <div style={{ border:`1.5px solid ${groupBuy?"#BFDBFE":`${C.purple}55`}`, borderRadius:14, padding:16, background:groupBuy?"#EFF6FF":"#FBF7FF" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <div style={{ width:32, height:32, borderRadius:9, background:groupBuy?C.blue:C.purple, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {groupBuy ? <ShoppingCart size={16} color="#fff"/> : <Gavel size={16} color="#fff"/>}
                </div>
                <span style={{ fontSize:14, fontWeight:800, color:C.text }}>{groupBuy
                  ? (pool.exists ? "Acquisto di gruppo attivo" : "Acquisto di gruppo disponibile")
                  : (pool.exists ? "Asta a ribasso attiva" : "Asta a ribasso disponibile")}</span>
              </div>

              {/* MINI-WIDGET asta attiva (solo asta a ribasso, non acquisto di
                  gruppo): stessa barra "prossimo scaglione" della pagina asta
                  (componente condiviso, compact), prezzo sempre valorizzato e
                  countdown alla chiusura. */}
              {pool.exists && !groupBuy && (() => {
                const timerIso = pool.status === "final_phase" ? pool.finalPhaseEndsAt : pool.closesAt;
                const timer = auctionCountdown(timerIso, nowMs) || (pool.closesIn ? `Chiude tra ${pool.closesIn}` : null);
                // Un'asta aperta ha sempre un prezzo: prezzo di partenza (listino)
                // finché non ci sono rilanci, prezzo attuale col primo rilancio.
                const priceLabel = pool.suppliers > 0 ? "Prezzo attuale" : "Prezzo di partenza";
                return (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ marginBottom:12 }}>
                      <BulkStrikeTierProgress currentKg={pool.current} compact />
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"space-between", alignItems:"center", gap:6, fontSize:12.5 }}>
                      <span style={{ color:C.text }}>{priceLabel}: <b style={{ color:C.purple }}>{eurKg(pool.bestPrice)}/kg</b></span>
                      {timer && <span style={{ color:C.muted, display:"inline-flex", alignItems:"center", gap:4 }}><Clock size={12}/> {timer}</span>}
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const canGo = pool.exists || canOpenPool;
                const target = pool.exists ? (pool.id ? `/pool?id=${pool.id}` : null) : (productId ? `/pool?product=${productId}` : null);
                return (<>
                  <button onClick={() => { if (canGo && target) window.location.href = target; }} disabled={!canGo || !target}
                    style={{ width:"100%", background:groupBuy?C.blue:C.purple, color:"#fff", border:"none", borderRadius:9, padding:"12px", fontSize:14, fontWeight:700, cursor:(canGo && target)?"pointer":"default", opacity:(canGo && target)?1:0.45, display:"flex", alignItems:"center", justifyContent:"center", gap:7, fontFamily:"Inter,system-ui" }}>
                    {groupBuy ? "Vai all'acquisto di gruppo" : "Vai alla pagina dell'asta"} <ArrowRight size={15}/>
                  </button>
                  {!pool.exists && !canOpenPool && (
                    <div style={{ fontSize:11.5, color:C.muted, marginTop:8, textAlign:"center" }}>
                      Quantità minima {(palletKg/1000).toLocaleString("it-IT")}t (1 pallet) non ancora raggiunta.
                    </div>
                  )}
                </>);
              })()}
            </div>
            ))}

            {/* PRICE HISTORY — vini/mosti: grafico per PIAZZA (nascosto se non ci
                sono ancora dati); altri prodotti: mercato €/unità o indice. */}
            {sampleOnly ? ((piazzaData?.piazze || []).length > 0 && (
              <div style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:18 }}>
                {(() => {
                  const piazze = piazzaData.piazze;
                  const suffix = unitSuffix(piazzaData.unit || "hl_grado");
                  const COLORS = ["#9D174D","#0EA5E9","#059669","#D97706","#7C3AED"];
                  const sel = selectedPiazze.length ? selectedPiazze : (piazze[0] ? [piazze[0].piazza] : []);
                  const map = {};
                  sel.forEach(pz => {
                    const p = piazze.find(x => x.piazza === pz);
                    (p?.serie || []).forEach(pt => {
                      const key = String(pt.t).slice(0,10);
                      if (!map[key]) { const [,m,d] = key.split("-"); map[key] = { t:`${d}/${m}`, _k:key }; }
                      map[key][pz] = Number(pt.v);
                    });
                  });
                  const data = Object.values(map).sort((a,b) => a._k.localeCompare(b._k));
                  const headline = piazze.find(x => x.piazza === sel[0]);
                  const toggle = (pz) => setSelectedPiazze(cur => cur.includes(pz) ? (cur.length > 1 ? cur.filter(x => x !== pz) : cur) : [...cur, pz]);
                  return (<>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8, flexWrap:"wrap", gap:6 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>Andamento prezzo per piazza</div>
                      {headline && <span className="bs-num" style={{ fontSize:18, fontWeight:800, color:"#9D174D" }}>{Number(headline.ultimo_prezzo).toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2})}<span style={{ fontSize:11, fontWeight:400, color:C.muted }}>{suffix}</span></span>}
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
                      {piazze.map((p) => {
                        const on = sel.includes(p.piazza);
                        const color = COLORS[Math.max(0, sel.indexOf(p.piazza)) % COLORS.length];
                        return <button key={p.piazza} onClick={() => toggle(p.piazza)} style={{ padding:"5px 10px", borderRadius:100, fontSize:11.5, fontWeight:600, cursor:"pointer", border:`1px solid ${on?color:C.border}`, background:on?`${color}14`:"#fff", color:on?color:C.muted, fontFamily:"Inter,system-ui" }}>{p.piazza}</button>;
                      })}
                    </div>
                    {data.length >= 2 ? (
                      <ResponsiveContainer width="100%" height={130}>
                        <LineChart data={data} margin={{ top:4, right:4, bottom:0, left:-22 }}>
                          <XAxis dataKey="t" tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false}/>
                          <YAxis tick={{ fill:C.muted, fontSize:10, fontFamily:"JetBrains Mono" }} axisLine={false} tickLine={false} domain={["auto","auto"]} tickFormatter={v=>`€${Number(v).toFixed(2)}`}/>
                          <Tooltip contentStyle={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, fontSize:12 }} formatter={(v,name)=>[`€${Number(v).toFixed(2)}${suffix}`, name]}/>
                          {sel.map((pz,i) => <Line key={pz} type="monotone" dataKey={pz} stroke={COLORS[i%COLORS.length]} strokeWidth={2.5} dot={false} activeDot={{ r:4 }} connectNulls/>)}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height:70, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11.5, color:C.muted, textAlign:"center", lineHeight:1.4 }}>Storico in raccolta: il grafico si popola a ogni rilevazione.</div>
                    )}
                    <div style={{ fontSize:10.5, color:C.muted, marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}`, lineHeight:1.5 }}>
                      Prezzi indicativi per piazza (CCIAA/ISMEA){piazzaData.last_date ? ` · ultimo aggiornamento ${new Date(piazzaData.last_date).toLocaleDateString("it-IT")}` : ""}. Il prezzo effettivo si definisce con la campionatura.
                    </div>
                  </>);
                })()}
              </div>
            )) : (
            <div style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:18 }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>Andamento prezzo</div>
              {(() => {
                const hasMarket = priceSeries && Array.isArray(priceSeries.series) && priceSeries.series.length > 0;
                if (hasMarket) {
                  // Dati reali di mercato (ISMEA/CUN) con fonte + dicitura obbligatoria.
                  const series = priceSeries.series.map(pt => { const [, m, d] = String(pt.t).slice(0,10).split("-"); return { t:`${d}/${m}`, v:Number(pt.v) }; });
                  const last = series[series.length-1].v;
                  const change = series.length >= 2 ? ((last - series[0].v) / series[0].v) * 100 : null;
                  return (<>
                    <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:10 }}>
                      <span className="bs-num" style={{ fontSize:22, fontWeight:800, color:C.blue }}>{eurKg(last)}<span style={{ fontSize:12, fontWeight:400, color:C.muted }}>{unitSuffix(priceSeries.unit)}</span></span>
                      {change != null && <span style={{ fontSize:12, color:change<=0?C.green:C.red, display:"flex", alignItems:"center", gap:2 }}>{change<=0 && <TrendingDown size={11}/>} {change>0?"+":""}{change.toFixed(1)}%</span>}
                    </div>
                    {series.length >= 2 ? (
                      <ResponsiveContainer width="100%" height={120}>
                        <LineChart data={series} margin={{ top:4, right:4, bottom:0, left:-22 }}>
                          <XAxis dataKey="t" tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false}/>
                          <YAxis tick={{ fill:C.muted, fontSize:10, fontFamily:"JetBrains Mono" }} axisLine={false} tickLine={false} domain={["auto","auto"]} tickFormatter={v=>`€${Number(v).toFixed(1)}`}/>
                          <Tooltip contentStyle={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, fontSize:12 }} formatter={v=>[`€${Number(v).toFixed(2)}${unitSuffix(priceSeries.unit)}`,"Prezzo"]}/>
                          <Line type="monotone" dataKey="v" stroke={C.blue} strokeWidth={2.5} dot={{ fill:C.blue, r:3, strokeWidth:0 }} activeDot={{ r:4 }}/>
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height:70, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11.5, color:C.muted, textAlign:"center", lineHeight:1.4 }}>
                        Storico in raccolta: il grafico si popola a ogni rilevazione settimanale.
                      </div>
                    )}
                    <PriceSourceNote fonte={priceSeries.fonte} fonteUrl={priceSeries.fonte_url} lastDate={priceSeries.last_date} muted={C.muted} border={C.border} />
                  </>);
                }
                // INDICE settoriale Eurostat (tendenza): NON un prezzo €/kg. Mostra
                // l'andamento dell'indice + la var. % YoY, con dicitura chiara che è
                // un indice di settore, non il prezzo del singolo prodotto.
                const idxPts = indexSeries && Array.isArray(indexSeries.series)
                  ? indexSeries.series.filter(pt => pt.index != null).map(pt => { const [y, m] = String(pt.t).slice(0,10).split("-"); return { t:`${m}/${y.slice(2)}`, v:Number(pt.index), pct: pt.pct != null ? Number(pt.pct) : null }; })
                  : [];
                if (idxPts.length >= 2) {
                  const lastPct = [...idxPts].reverse().find(p => p.pct != null)?.pct ?? null;
                  const lastMonth = indexSeries.last_month ? (() => { const [y,m] = String(indexSeries.last_month).slice(0,10).split("-"); return `${m}/${y}`; })() : null;
                  return (<>
                    <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:2, flexWrap:"wrap" }}>
                      <span className="bs-num" style={{ fontSize:22, fontWeight:800, color:C.text }}>Indice {idxPts[idxPts.length-1].v.toFixed(1)}</span>
                      {lastPct != null && <span style={{ fontSize:12, color:lastPct<=0?C.green:C.red, display:"flex", alignItems:"center", gap:2 }}>{lastPct<=0 && <TrendingDown size={11}/>} {lastPct>0?"+":""}{lastPct.toFixed(1)}% <span style={{ color:C.muted }}>su base annua</span></span>}
                    </div>
                    <div style={{ fontSize:10.5, color:C.muted, marginBottom:10 }}>Indice settoriale (base 2021=100){lastMonth ? ` · ${lastMonth}` : ""}</div>
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={idxPts} margin={{ top:4, right:4, bottom:0, left:-22 }}>
                        <XAxis dataKey="t" tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(idxPts.length/6)-0)}/>
                        <YAxis tick={{ fill:C.muted, fontSize:10, fontFamily:"JetBrains Mono" }} axisLine={false} tickLine={false} domain={["auto","auto"]} tickFormatter={v=>Number(v).toFixed(0)}/>
                        <Tooltip contentStyle={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, fontSize:12 }} formatter={v=>[Number(v).toFixed(1),"Indice"]}/>
                        <Line type="monotone" dataKey="v" stroke={C.blue} strokeWidth={2.5} dot={false} activeDot={{ r:4 }}/>
                      </LineChart>
                    </ResponsiveContainer>
                    <div style={{ fontSize:10.5, color:C.muted, opacity:0.9, lineHeight:1.5, marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
                      Indice di <b>tendenza settoriale</b>, non il prezzo €/kg di questo specifico prodotto: {indexSeries.nace_label || "prezzi alla produzione dell'industria"}.{" "}
                      {indexSeries.fonte_url
                        ? <>Fonte: <a href={indexSeries.fonte_url} target="_blank" rel="noopener noreferrer" style={{ color:C.blue }}>Eurostat</a>.</>
                        : "Fonte: Eurostat."}
                    </div>
                  </>);
                }
                // Nessun dato di mercato né indice per questo prodotto: resta il grafico
                // mock (collegamento a dati reali degli altri prodotti = task separato).
                return (<>
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
                </>);
              })()}
            </div>
            )}

            {/* SAMPLE / SAFETY NOTE — non pertinente ai prodotti a sola campionatura */}
            {!sampleOnly && (
            <div style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:18 }}>
              <div style={{ display:"flex", gap:8, fontSize:12, color:C.muted, lineHeight:1.5 }}>
                <Shield size={26} color={C.green} style={{ flexShrink:0 }}/>
                <span>Pagamento protetto in <b style={{ color:C.text }}>escrow</b>: il fornitore viene pagato solo dopo la tua conferma di consegna conforme.</span>
              </div>
            </div>
            )}
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
