import { useState, useEffect } from "react";
import { getPoolDetail, getPoolBids, getPoolParticipants, getPoolTargetJoins, joinPool, joinPoolAtTarget, getMyTargetJoin, cancelTargetJoin, poolErrorMessage, isFollowingProduct, getOpenPoolForProduct, getProduct, openPool } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import SupplierName from "@/components/BulkStrikeSupplierName";
import ProductFollowButton from "@/components/BulkStrikeProductFollow";
import BulkStrikeAuctionConfirm from "@/components/BulkStrikeAuctionConfirm";
import BulkStrikeAuctionSuccess from "@/components/BulkStrikeAuctionSuccess";
import BulkStrikeTierProgress from "@/components/BulkStrikeTierProgress";
import { TIERS, tierIndexFor, tierFor, tierCeiling } from "@/lib/tiers";
import BulkStrikeChatWidget from "@/components/BulkStrikeChatWidget";
import { BSIcon } from "@/components/BSLogo";
import CountryFlag from "@/components/CountryFlag";
import { Search, ArrowRight, Check, Clock, ChevronRight, Shield, Users, TrendingDown, Plus, Minus, Info, Gavel, Award, ShoppingCart } from "lucide-react";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706", purple:"#7C3AED" };

// ─── pool DATA (product-level reverse auction) ────────────────────────────────
const SEED_POOL = {
  product: "Acido Tartarico L(+)",
  enum: "E334",
  standard: "Reg. (UE) 231/2012 · Codex OIV · FCC",
  current: 13800,
  secondsLeft: 4*86400 + 9*3600 + 12*60,
  bestBid: 2.27,
  bestSupplier: "Fornitore #3",
  bids: 4,
};


const SEED_BIDDERS = [
  { tag:"Fornitore #3", origin:"Cina",      flag:"🇨🇳", bid:2.27, when:"12 min fa", leader:true },
  { tag:"Fornitore #1", origin:"Polonia",   flag:"🇵🇱", bid:2.33, when:"40 min fa", leader:false },
  { tag:"Fornitore #4", origin:"Argentina", flag:"🇦🇷", bid:2.41, when:"2 ore fa",  leader:false },
  { tag:"Fornitore #2", origin:"Italia",    flag:"🇮🇹", bid:2.48, when:"5 ore fa",  leader:false },
];

const SEED_PARTICIPANTS = [
  { who:"Azienda vinicola in Abruzzo", qty:3000, when:"2 ore fa" },
  { who:"Cantina in Chianti",          qty:2400, when:"5 ore fa" },
  { who:"Cooperativa in Puglia",       qty:2800, when:"8 ore fa" },
  { who:"Azienda in Sicilia",          qty:1800, when:"1 giorno fa" },
  { who:"Cantina in Veneto",           qty:1500, when:"1 giorno fa" },
  { who:"Cantina in Piemonte",         qty:1200, when:"2 giorni fa" },
  { who:"Azienda in Toscana",          qty:700,  when:"2 giorni fa" },
  { who:"Cantina in Friuli",           qty:400,  when:"3 giorni fa" },
];

const PALLET_KG = 1000;        // peso di 1 pallet demo, usato solo se il prodotto reale non è ancora caricato

const eur = (n) => n.toLocaleString("it-IT", { style:"currency", currency:"EUR", maximumFractionDigits:0 });
const eurKg = (n) => "€" + n.toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });
const kg = (n) => n.toLocaleString("it-IT");

function relTime(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return "ora";
  if (s < 3600) return `${Math.floor(s / 60)} min fa`;
  if (s < 86400) return `${Math.floor(s / 3600)} ore fa`;
  return `${Math.floor(s / 86400)} giorni fa`;
}

// Etichetta anonima per un'azienda: mai il nome, solo città/paese se noti.
function regionLabel(city, country) {
  if (city && country) return `${city}, ${country}`;
  return city || country || "Regione non indicata";
}

export default function PoolAuctionPage() {
  const [pool, setPool] = useState(SEED_POOL);
  const [bidders, setBidders] = useState(SEED_BIDDERS);
  const [participants, setParticipants] = useState(SEED_PARTICIPANTS);
  const [poolId, setPoolId] = useState(null);
  const [joining, setJoining] = useState(false);
  const [joinMsg, setJoinMsg] = useState(null);
  // Azione in attesa di conferma nel pop-up 1 (joinTheAuction o joinAtTarget), o
  // null se è chiuso. È l'unico punto di accettazione T&C.
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [confirmError, setConfirmError] = useState(null);   // errore mostrato dentro il pop-up 1 (l'azione non chiude il pop-up)
  const [successInfo, setSuccessInfo] = useState(null);      // pop-up 2: { mode, quantityKg, closeHref } quando l'azione è andata a buon fine
  const [userQty, setUserQty] = useState(2000);
  const [format, setFormat] = useState("pallet"); // formato di vendita selezionato: sacco | pallet | container | kg (liberi)
  const [secs, setSecs] = useState(pool.secondsLeft);
  const [joined, setJoined] = useState(false);
  const [realPalletKg, setRealPalletKg] = useState(null); // kg di 1 pallet per il prodotto reale, se noto
  const [realSaccoKg, setRealSaccoKg] = useState(null);       // kg di 1 sacco, solo se impostato sul prodotto
  const [realContainerKg, setRealContainerKg] = useState(null); // kg di 1 container, solo se impostato sul prodotto
  const [targetJoin, setTargetJoin] = useState(null);   // { id, quantity_kg, target_price_per_kg } | null
  const [pendingJoins, setPendingJoins] = useState([]); // adesioni in attesa di altri clienti, in forma anonima
  const [myQty, setMyQty] = useState(0); // quanto ho già messo in questo pool (anche da sessioni precedenti)
  const [showTargetInput, setShowTargetInput] = useState(false);
  const [targetPrice, setTargetPrice] = useState("");
  const [productId, setProductId] = useState(null);       // per il bottone "Segui" prodotto
  const [followingProduct, setFollowingProduct] = useState(false);
  // Modalità "apri nuova asta" per un prodotto (arrivo con ?product=<id> e nessun
  // pool ancora aperto): il pannello apre l'asta con openPool() invece di joinPool().
  const [productMode, setProductMode] = useState(false);
  // Divieto d'asta a ribasso per legge (agricoli/alimentari grezzi, D.Lgs. 198/2021):
  // il pannello mostra l'avviso legale invece dei controlli di apertura/adesione.
  const [auctionRestricted, setAuctionRestricted] = useState(false);
  // Numero di fornitori attivi del prodotto: 2+ → asta a ribasso (competizione);
  // 1 (o 0) → "Acquisto di gruppo" (nessuna competizione, prezzo dell'unico
  // fornitore, si aggrega solo la domanda per sbloccare gli scaglioni di volume).
  const [availableSuppliers, setAvailableSuppliers] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setSecs(s => s>0 ? s-1 : 0), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const url = new URLSearchParams(window.location.search);
    const id = url.get("id");
    const productParam = url.get("product");
    if (id) {
      setPoolId(id);
      loadPool(id);
      getMyTargetJoin(id).then(setTargetJoin).catch(() => {});
      return;
    }
    if (productParam) {
      // Se esiste già un'asta aperta per questo prodotto → vai alla sua pagina.
      // Altrimenti entra in modalità "apri nuova asta" per quel prodotto.
      getOpenPoolForProduct(productParam)
        .then((op) => {
          if (op && op.id) { window.location.href = `/pool?id=${op.id}`; return; }
          loadProductForOpen(productParam);
        })
        .catch(() => loadProductForOpen(productParam));
      return;
    }
    // nessun parametro → resta il pool dimostrativo
  }, []);

  // Modalità "apri nuova asta": carica il prodotto e prepara il pannello con volume 0.
  async function loadProductForOpen(pid) {
    try {
      const p = await getProduct(pid);
      if (!p) return;
      setProductMode(true);
      setAuctionRestricted(!!p.auction_restricted_by_law);
      setAvailableSuppliers(new Set((p.suppliers || []).map(s => s.company_id).filter(Boolean)).size);
      setProductId(pid);
      isFollowingProduct(pid).then(setFollowingProduct).catch(() => {});
      if (p.pallet_kg) setRealPalletKg(Number(p.pallet_kg));
      if (p.sacco_kg) setRealSaccoKg(Number(p.sacco_kg));
      if (p.container_kg) setRealContainerKg(Number(p.container_kg));
      setBidders([]); setParticipants([]); setPendingJoins([]); setMyQty(0);
      setPool({
        product: p.canonical_name || "",
        enum: p.e_number || "",
        standard: SEED_POOL.standard,
        current: 0,
        secondsLeft: 0,
        bestBid: tierFor(0).price,
        bestSupplier: "—",
        bids: 0,
        status: "open",
        finalPrice: null, winnerName: null, myOrderId: null, closesAt: null,
      });
      setSecs(0);
    } catch (e) {
      setJoinMsg(poolErrorMessage(e));
    }
  }

  // Apre davvero l'asta per il prodotto (dalla modalità productMode). Non naviga
  // più subito: torna lo stato d'esito così il pop-up 2 (conferma di apertura)
  // gestisce l'uscita — "Chiudi" porta al pool appena creato, "Vai alle aste
  // personali" al profilo.
  async function openNewAuction() {
    if (!productId) return { status: "noop" };
    setJoining(true); setJoinMsg(null);
    try {
      const qty = userQty;
      const newId = await openPool(productId, qty, true);
      setJoining(false);
      return { status: "success", mode: "open", quantityKg: qty, closeHref: `/pool?id=${newId}` };
    } catch (e) {
      // se nel frattempo qualcuno l'ha aperta, vai su quella
      try {
        const op = await getOpenPoolForProduct(productId);
        if (op && op.id) { window.location.href = `/pool?id=${op.id}`; return { status: "noop" }; }
      } catch (_) { /* ignore */ }
      const m = poolErrorMessage(e);
      setJoinMsg(m);
      setJoining(false);
      return { status: "error", message: m };
    }
  }

  async function loadPool(id) {
    try {
      const [detail, bids, parts, waiting] = await Promise.all([
        getPoolDetail(id), getPoolBids(id), getPoolParticipants(id).catch(() => []), getPoolTargetJoins(id).catch(() => []),
      ]);
      const bd = (bids || []).map((b, i) => ({ tag: b.anon_label, origin: "", flag: "", bid: b.price_per_kg, when: relTime(b.created_at), leader: i === 0, won: b.status === "winning" }));
      const total = detail.total_volume_kg || 0;
      setBidders(bd);
      // Anonimo: solo città/paese e kg, mai il nome dell'azienda.
      setParticipants((parts || []).map(p => ({ who: regionLabel(p.city, p.country), qty: p.quantity_kg, when: "" })));
      setPendingJoins(waiting || []);
      setMyQty(Number(detail.my_quantity_kg) || 0);
      setAvailableSuppliers(detail.available_suppliers != null ? Number(detail.available_suppliers) : null);
      if (detail.product?.id) { setProductId(detail.product.id); isFollowingProduct(detail.product.id).then(setFollowingProduct).catch(() => {}); }
      if (detail.pallet_kg) setRealPalletKg(Number(detail.pallet_kg));
      if (detail.sacco_kg) setRealSaccoKg(Number(detail.sacco_kg));
      if (detail.container_kg) setRealContainerKg(Number(detail.container_kg));
      setPool({
        product: detail.product?.canonical_name || "",
        enum: detail.product?.e_number || "",
        standard: SEED_POOL.standard,
        current: total,
        secondsLeft: 0,
        bestBid: detail.best_price_per_kg ?? (bd[0]?.bid ?? tierFor(total).price),
        bestSupplier: bd[0]?.tag || "—",
        bids: bd.length,
        // Stato/esito per la pagina di un'asta conclusa (null sull'asta demo).
        status: detail.status || "open",
        finalPrice: detail.final_price_per_kg != null ? Number(detail.final_price_per_kg) : null,
        winnerName: detail.winner_name || null,
        myOrderId: detail.my_order_id || null,
        closesAt: detail.closes_at || null,
      });
      setSecs(Math.max(0, Math.floor((new Date(detail.closes_at) - Date.now()) / 1000)));
    } catch (e) {
      setJoinMsg(poolErrorMessage(e));
    }
  }

  async function joinTheAuction() {
    if (productMode) { return openNewAuction(); }
    if (!poolId) { const m = "Questa è l'asta dimostrativa: per partecipare apri un'asta a ribasso reale dalla pagina di un prodotto."; setJoinMsg(m); return { status: "error", message: m }; }
    setJoining(true); setJoinMsg(null);
    try {
      const qty = userQty;
      await joinPool(poolId, qty, true);
      setJoinMsg("✓ Adesione registrata: la tua quantità è nel volume aggregato.");
      setJoined(true);
      loadPool(poolId);
      return { status: "success", mode: "join", quantityKg: qty, closeHref: null };
    } catch (e) {
      const m = poolErrorMessage(e);
      setJoinMsg(m);
      return { status: "error", message: m };
    } finally {
      setJoining(false);
    }
  }

  // Aderisci quando il prezzo raggiunge la soglia scelta. Se il prezzo attuale
  // è già a quel livello o sotto, il server unisce subito (stessa cosa di joinTheAuction).
  async function joinAtTarget() {
    if (productMode) { return openNewAuction(); }
    if (!poolId) { setJoinMsg("Questa è l'asta dimostrativa: per partecipare apri un'asta a ribasso reale dalla pagina di un prodotto."); return; }
    const price = parseFloat(String(targetPrice).replace(",", "."));
    if (!price || price <= 0) { const m = "Inserisci un prezzo soglia valido."; setJoinMsg(m); return { status: "error", message: m }; }
    setJoining(true); setJoinMsg(null);
    try {
      const qty = userQty;
      const res = await joinPoolAtTarget(poolId, qty, price, true);
      if (res?.status === "joined_now") {
        setJoinMsg("✓ Adesione registrata: sei nell'asta.");
        setJoined(true);
        loadPool(poolId);
        return { status: "success", mode: "join", quantityKg: qty, closeHref: null };
      }
      // Soglia programmata: non è un'adesione immediata → nessun pop-up 2, il
      // pannello mostra lo stato "adesione in attesa".
      setTargetJoin({ quantity_kg: qty, target_price_per_kg: price });
      setShowTargetInput(false);
      loadPool(poolId);
      return { status: "scheduled" };
    } catch (e) {
      const m = poolErrorMessage(e);
      setJoinMsg(m);
      return { status: "error", message: m };
    } finally {
      setJoining(false);
    }
  }

  async function cancelTarget() {
    if (targetJoin?.id) { try { await cancelTargetJoin(targetJoin.id); } catch (e) {} }
    setTargetJoin(null);
  }

  const d = Math.floor(secs/86400), h = Math.floor((secs%86400)/3600), m = Math.floor((secs%3600)/60), s = secs%60;

  // Asta conclusa: la pagina diventa un RIEPILOGO/ESITO (niente countdown, niente
  // pannello di adesione, offerte come storico con vincitore rivelato).
  const concluded = pool.status === "closed" || pool.status === "cancelled";
  const closedDate = pool.closesAt ? new Date(pool.closesAt).toLocaleDateString("it-IT", { day:"2-digit", month:"long", year:"numeric" }) : "";
  const finalPrice = pool.finalPrice ?? pool.bestBid;

  const projected = pool.current + userQty;
  const currentTier = tierFor(pool.current);
  const projectedTier = tierFor(projected);
  const ceilingNow = currentTier.price;
  const effectiveNow = Math.min(pool.bestBid, ceilingNow);
  // Prezzo "stimato (live)": il TETTO dello scaglione che la quantità proiettata
  // (attuale + in sospeso) sblocca — salta al prezzo del nuovo scaglione appena la
  // barra lo supera, così bar e prezzo si aggiornano insieme. È distinto dal "Miglior
  // prezzo attuale" (l'offerta più bassa dei fornitori), che può scendere ancora sotto.
  const ceilingProjected = projectedTier.price;
  // Fascia che la barra sta RIEMPIENDO: il confine subito sopra il volume REALE
  // attuale. La quantità in sospeso avanza alla fascia successiva solo quando SUPERA
  // (strettamente) quel confine: se lo raggiunge ESATTAMENTE (es. "Chiudi scaglione"
  // che atterra sul bordo), la barra resta su questa fascia e si legge PIENA al 100%.
  // Con anche solo +1 kg oltre il confine si entra nella fascia successiva e la barra
  // si resetta sui suoi confini. (tierIndexFor usa "<" e da solo, sul bordo esatto,
  // salterebbe subito alla fascia lontana facendo apparire parziale una fascia appena
  // completata: qui usiamo ">" stretto per tenere la barra sulla fascia che si chiude.)
  let barIdx = tierIndexFor(pool.current);
  while (TIERS[barIdx].max !== Infinity && projected > TIERS[barIdx].max) barIdx++;
  const barTarget = TIERS[barIdx].max === Infinity ? null : TIERS[barIdx].max;
  const aloneCeiling = tierCeiling(userQty);
  const savings = Math.max(0, (aloneCeiling - ceilingProjected) * userQty);
  // min 1 kg (i sacchi possono essere piccoli), max 100 t (più container).
  const setQtySafe = (v) => setUserQty(Math.max(1, Math.min(100000, v)));
  const palletKg = realPalletKg || PALLET_KG; // kg di 1 pallet: reale se noto, altrimenti la demo
  const belowMin = userQty < palletKg;
  // La soglia di 1 pedana vale SOLO per APRIRE una nuova asta, non per partecipare a
  // una GIÀ ATTIVA (come dice l'avviso a schermo). Un'asta è già attiva se c'è un pool
  // reale (poolId) o volume aggregato/offerte già presenti. Quindi il blocco
  // sotto-pedana scatta solo mentre si sta aprendo una nuova asta.
  const isExistingAuction = !!poolId || pool.current > 0;
  const mustOpenWithPallet = !isExistingAuction && belowMin;
  // "Acquisto di gruppo": esattamente un fornitore per il prodotto → niente
  // competizione al ribasso, si aggrega solo la domanda per sbloccare gli scaglioni
  // di volume al prezzo dell'unico fornitore. Con 2+ fornitori resta l'asta a ribasso.
  // Con 0 fornitori si lascia il comportamento storico (caso non modificato).
  const groupBuy = availableSuppliers === 1;
  // Il divieto (D.Lgs 198/2021) vieta l'ASTA A RIBASSO, non la domanda aggregata:
  // mostro l'avviso legale (invece del box pool) SOLO se sarebbe un'asta competitiva
  // (2+ fornitori). Con 1 fornitore resta l'Acquisto di gruppo, consentito.
  const auctionBlocked = auctionRestricted && !groupBuy;
  // userQty (kg) resta lo stato reale; palletCount è solo la sua vista in
  // pallet per questo prodotto (usata dalla nota nei "Kg personalizzati").
  const palletCount = Math.max(1, Math.round(userQty / palletKg));
  const isPalletMultiple = userQty % palletKg === 0;

  // Formati di vendita: Pallet sempre disponibile; Sacchi/Container SOLO se il
  // prodotto ha il peso di quel formato impostato (mai valori inventati).
  const FORMATS = [
    ...(realSaccoKg ? [{ id:"sacco", label:"Sacchi", unitKg:realSaccoKg, one:"sacco", many:"sacchi" }] : []),
    { id:"pallet", label:"Pallet", unitKg:palletKg, one:"pallet", many:"pallet" },
    ...(realContainerKg ? [{ id:"container", label:"Container", unitKg:realContainerKg, one:"container", many:"container" }] : []),
  ];
  const activeFormat = FORMATS.find(f => f.id === format) || null; // null → "Kg personalizzati"
  const unitCount = activeFormat ? Math.max(1, Math.round(userQty / activeFormat.unitKg)) : palletCount;
  const setUnitCount = (n) => { if (activeFormat) setQtySafe(Math.max(1, n) * activeFormat.unitKg); };
  // cambio formato: aggancia la quantità al multiplo più vicino del nuovo formato
  const selectFormat = (f) => { setFormat(f.id); setQtySafe(Math.max(1, Math.round(userQty / f.unitKg)) * f.unitKg); };
  // "Chiudi scaglione": azione diretta che inserisce i kg esatti che mancano al
  // volume AGGREGATO per sbloccare il prossimo scaglione di prezzo.
  const aggTier = tierFor(pool.current);
  const tierGapKg = aggTier.max === Infinity ? 0 : Math.max(0, aggTier.max - pool.current);
  const closeTierNow = () => { if (tierGapKg > 0) { setFormat("kg"); setQtySafe(tierGapKg); } };

  return (
    <div style={{ background:"#fff", color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", overflowX:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .bs-num { font-family:'JetBrains Mono',monospace; }
        .bs-ticker-wrap { overflow:hidden; width:100%; }
        .bs-ticker { display:flex; width:max-content; animation:tick 45s linear infinite; }
        .bs-ticker:hover { animation-play-state:paused; }
        @keyframes tick { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes fill { from{width:0} }
        .bs-btn { background:#7C3AED; color:#fff; border:none; border-radius:10px; padding:14px 24px; font-size:16px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:8px; transition:all 0.2s; font-family:'Inter',system-ui; }
        .bs-btn:hover:not(:disabled){ background:#6D28D9; transform:translateY(-1px); box-shadow:0 6px 20px rgba(124,58,237,0.3); }
        .bs-btn:disabled { background:#CBD5E1; cursor:not-allowed; }
        .bs-btn-blue { background:#0EA5E9; }
        .bs-btn-blue:hover { background:#0284C7; box-shadow:0 6px 20px rgba(14,165,233,0.3); }
        .bs-qty-btn { width:38px; height:38px; border:1px solid #E2E8F0; background:#fff; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#475569; }
        .bs-qty-btn:hover { border-color:#7C3AED; color:#7C3AED; }
        .bs-chip { border-radius:6px; padding:3px 9px; font-size:11px; font-weight:600; display:inline-flex; align-items:center; gap:4px; }
        .bs-card { border:1px solid #E2E8F0; border-radius:14px; padding:20px; }
        .bs-live-dot { width:8px; height:8px; border-radius:50%; background:#DC2626; animation:pulse 1.5s infinite; }
        .bs-search-wrap { display:flex; border:2px solid #0EA5E9; border-radius:10px; overflow:hidden; height:44px; flex:1; max-width:520px; background:#fff; }
        @media (max-width:880px){
          .bs-hero-grid { grid-template-columns:1fr !important; gap:24px !important; }
          .bs-cols { grid-template-columns:1fr !important; }
          .bs-two { grid-template-columns:1fr !important; }
          .bs-nav-links { display:none !important; }
          .bs-search-wrap { max-width:100% !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <BulkStrikeNav />

      {/* TICKER */}
      <div style={{ background:"#07111E", padding:"9px 0" }}>
        <div className="bs-ticker-wrap"><div className="bs-ticker">
          {[...Array(2)].flatMap((_,k) => [
            ["Acido Tartarico","€2,27",-3.1],["Acido Citrico","€0,81",-2.3],["Metabisolfito K","€1,95",1.1],["Bentonite","€0,42",-0.6],["Acido Malico","€3,10",0.9],["Gomma Arabica","€8,40",2.2],["Mannoproteine","€14,20",-0.3],["MCR","€0,95",1.7]
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

        {/* BREADCRUMB */}
        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.muted, marginBottom:18, flexWrap:"wrap" }}>
          <span onClick={() => { window.location.href = "/"; }} style={{ cursor:"pointer" }}>Home</span><ChevronRight size={13}/>
          <span onClick={() => { window.location.href = "/pool"; }} style={{ cursor:"pointer" }}>Asta a ribasso · attive</span><ChevronRight size={13}/>
          <span style={{ color:C.text, fontWeight:600 }}>{pool.product}</span>
        </div>

        {/* HEADER */}
        <div style={{ display:"flex", justifyContent:"space-between", gap:16, flexWrap:"wrap", marginBottom:20 }}>
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap", alignItems:"center" }}>
              {!auctionBlocked && (groupBuy
                ? <span className="bs-chip" style={{ background:"#EFF6FF", color:C.blue }}><ShoppingCart size={12}/> Acquisto di gruppo · per prodotto</span>
                : <span className="bs-chip" style={{ background:"#FBF7FF", color:C.purple }}><Gavel size={12}/> Asta a ribasso · per prodotto</span>)}
              {/* Nessun badge "Live" per i prodotti con asta vietata per legge. */}
              {auctionBlocked
                ? null
                : concluded
                ? <span className="bs-chip" style={{ background:"#F1F5F9", color:C.muted }}><Check size={12}/> Asta terminata</span>
                : <span className="bs-chip" style={{ background:"#FEF2F2", color:C.red }}><span className="bs-live-dot"/> Live</span>}
              <span className="bs-chip" style={{ background:"#EFF6FF", color:"#1D4ED8" }}>{pool.enum}</span>
            </div>
            <h1 style={{ fontSize:30, fontWeight:800, letterSpacing:"-0.02em", marginBottom:6 }}>{pool.product}</h1>
            <div style={{ fontSize:14, color:C.muted, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
              <Award size={14} color={C.green}/> Standard garantito: <b style={{ color:C.text }}>{pool.standard}</b>
            </div>
            {productId && (
              <div style={{ marginTop:12 }}>
                <ProductFollowButton productId={productId} following={followingProduct} onChange={setFollowingProduct} muted={C.muted} border={C.border} />
              </div>
            )}
          </div>
          {auctionBlocked ? null : concluded ? (
            <div style={{ textAlign:"center", background:C.bg, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 18px" }}>
              <div style={{ fontSize:11, color:C.muted, marginBottom:6, display:"flex", alignItems:"center", gap:4, justifyContent:"center" }}><Check size={12}/> Asta conclusa</div>
              <div className="bs-num" style={{ fontSize:20, fontWeight:800, color:C.text }}>{closedDate || "—"}</div>
            </div>
          ) : (
            <div style={{ textAlign:"center", background:C.bg, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 18px" }}>
              <div style={{ fontSize:11, color:C.muted, marginBottom:6, display:"flex", alignItems:"center", gap:4, justifyContent:"center" }}><Clock size={12}/> Chiusura tra (ciclo 7 giorni)</div>
              <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
                {[[d,"g"],[h,"h"],[m,"m"],[s,"s"]].map(([val,lab],i) => (
                  <div key={i} style={{ minWidth:42 }}>
                    <div className="bs-num" style={{ fontSize:24, fontWeight:800, color:C.text }}>{String(val).padStart(2,"0")}</div>
                    <div style={{ fontSize:10, color:C.muted }}>{lab}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {auctionBlocked ? (
          /* Asta competitiva (2+ fornitori) su prodotto ristretto: pagina minimale,
             solo l'avviso legale. Con 1 fornitore si mostra invece l'Acquisto di
             gruppo (ramo else), che il divieto non vieta. */
          <div style={{ border:`1px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:28, maxWidth:640, background:C.bg }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
              <div style={{ width:34, height:34, borderRadius:"50%", background:"#F1F5F9", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Info size={18} color={C.muted}/></div>
              <div style={{ fontSize:16, fontWeight:700 }}>Asta a ribasso non disponibile</div>
            </div>
            <div style={{ fontSize:13.5, color:C.muted, lineHeight:1.6 }}>
              La normativa italiana vieta l'acquisto di prodotti agricoli e alimentari tramite aste elettroniche a doppio ribasso. Questo prodotto è disponibile solo con Acquisto Rapido.
            </div>
            <div style={{ fontSize:11.5, color:C.muted, opacity:0.85, lineHeight:1.5, marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}` }}>
              Rif. normativo: Direttiva (UE) 2019/633 del 17 aprile 2019 sulle pratiche commerciali sleali nella filiera agroalimentare; Decreto Legislativo 8 novembre 2021, n. 198, art. 5, comma 1, lett. a) (in vigore dal 15 dicembre 2021).
            </div>
            <button onClick={() => { window.location.href = productId ? `/prodotto?id=${productId}` : "/catalogo"; }} className="bs-btn bs-btn-blue" style={{ marginTop:16, fontSize:14, padding:"11px 18px" }}>Vai all'Acquisto Rapido <ArrowRight size={15}/></button>
          </div>
        ) : (
        <>
        {/* MECCANISMO: 2+ fornitori = due leve (volume + ribasso); 1 fornitore =
            solo aggregazione della domanda (nessun ribasso fornitori). */}
        {groupBuy ? (
          <div style={{ marginBottom:24 }}>
            <div style={{ background:"#EFF6FF", border:`1px solid #BFDBFE`, borderRadius:12, padding:"14px 16px", display:"flex", gap:12, alignItems:"flex-start" }}>
              <div style={{ width:34, height:34, borderRadius:9, background:C.blue, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Users size={17} color="#fff"/></div>
              <div>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:2 }}>Volume aggregato · sconto quantità</div>
                <div style={{ fontSize:13, color:C.muted, lineHeight:1.5 }}>Più acquirenti aggregano la domanda, più si sblocca uno scaglione di prezzo più basso per tutti. Il prezzo è quello dell'unico fornitore quotato: non c'è competizione né asta.</div>
              </div>
            </div>
          </div>
        ) : (
        <div className="bs-two" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:24 }}>
          <div style={{ background:"#FBF7FF", border:`1px solid ${C.purple}33`, borderRadius:12, padding:"14px 16px", display:"flex", gap:12, alignItems:"flex-start" }}>
            <div style={{ width:34, height:34, borderRadius:9, background:C.purple, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Users size={17} color="#fff"/></div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:2 }}>Leva 1 · Volume aggregato</div>
              <div style={{ fontSize:13, color:C.muted, lineHeight:1.5 }}>Più richieste di prodotto si aggregano, più si sblocca uno scaglione di prezzo più basso per tutti.</div>
            </div>
          </div>
          <div style={{ background:"#EFF6FF", border:`1px solid #BFDBFE`, borderRadius:12, padding:"14px 16px", display:"flex", gap:12, alignItems:"flex-start" }}>
            <div style={{ width:34, height:34, borderRadius:9, background:C.blue, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Gavel size={17} color="#fff"/></div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:2 }}>Leva 2 · Ribasso fornitori</div>
              <div style={{ fontSize:13, color:C.muted, lineHeight:1.5 }}>Tutti i fornitori certificati di questa materia prima competono al ribasso. Vince il più economico.</div>
            </div>
          </div>
        </div>
        )}

        {/* HERO: live auction + join */}
        <div className="bs-hero-grid" style={{ display:"grid", gridTemplateColumns:"1.5fr 1fr", gap:24, border:`2px solid ${C.purple}`, borderRadius:18, padding:28, marginBottom:24, background:"#FBF9FF" }}>

          {/* LEFT */}
          <div>
            <div style={{ display:"flex", gap:24, flexWrap:"wrap", marginBottom:22 }}>
              <div>
                <div style={{ fontSize:12, color:C.muted, marginBottom:2 }}>{concluded ? "Prezzo di chiusura" : (groupBuy ? "Prezzo attuale" : "Miglior prezzo attuale")}</div>
                <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                  <span className="bs-num" style={{ fontSize:38, fontWeight:800, color:C.purple }}>{eurKg(concluded ? finalPrice : effectiveNow)}</span>
                  <span style={{ fontSize:14, color:C.muted }}>/kg</span>
                  {!concluded && !groupBuy && <span style={{ fontSize:12, color:C.green, display:"flex", alignItems:"center", gap:2 }}><TrendingDown size={12}/> in calo</span>}
                </div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{concluded
                  ? (pool.winnerName ? <>aggiudicata a <SupplierName name={pool.winnerName} style={{ color:C.text, fontWeight:700 }}/></> : <>{pool.bids} offerte ricevute</>)
                  : (groupBuy ? <>prezzo dell'unico fornitore quotato · scaglione di volume attuale</> : <>offerto da <b style={{ color:C.text }}>{pool.bestSupplier}</b> · {pool.bids} fornitori in gara</>)}</div>
              </div>
              <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:24 }}>
                <div style={{ fontSize:12, color:C.muted, marginBottom:2 }}>Volume aggregato</div>
                <div className="bs-num" style={{ fontSize:38, fontWeight:800, color:C.text }}>{kg(pool.current)}<span style={{ fontSize:14, fontWeight:400, color:C.muted }}> kg</span></div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{participants.length} aziende · scaglione {currentTier.label}</div>
              </div>
            </div>

            {!concluded && (barTarget ? (
              <div style={{ marginBottom:20 }}>
                {/* barra "prossimo scaglione" — componente condiviso con il
                    mini-widget della pagina prodotto (unica fonte del calcolo). */}
                <BulkStrikeTierProgress currentKg={pool.current} addedKg={userQty} />
              </div>
            ) : (
              <div style={{ marginBottom:20, fontSize:12.5, color:C.blue, fontWeight:600, background:"#EFF6FF", border:`1px solid #BFDBFE`, borderRadius:10, padding:"10px 12px" }}>
                🎉 Con questa quantità raggiungi lo scaglione minimo: tetto {eurKg(TIERS[TIERS.length-1].price)}/kg.
              </div>
            ))}

            {/* "Offerte dei fornitori" solo in asta a ribasso: nell'acquisto di gruppo
                c'è un solo fornitore, quindi nessuna competizione da mostrare. */}
            {groupBuy ? (
              <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:12, padding:16, fontSize:13, color:C.muted, lineHeight:1.55, display:"flex", gap:10, alignItems:"flex-start" }}>
                <ShoppingCart size={16} color={C.blue} style={{ flexShrink:0, marginTop:2 }}/>
                <span>Un solo fornitore quotato per questo prodotto: il prezzo è quello dello scaglione di volume raggiunto, senza asta. Aggregando la domanda con altri acquirenti sblocchi lo scaglione successivo, più conveniente per tutti.</span>
              </div>
            ) : (
              <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:12, padding:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <span style={{ fontSize:13, fontWeight:700, display:"flex", alignItems:"center", gap:6 }}><Gavel size={14} color={C.purple}/> {concluded ? "Offerte dei fornitori · esito finale" : "Offerte dei fornitori (live)"}</span>
                  <span style={{ fontSize:11, color:C.muted }}>{concluded ? "identità del vincitore svelata" : "identità svelata alla chiusura"}</span>
                </div>
                {bidders.map((b,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:i<bidders.length-1?`1px solid #F1F5F9`:"none" }}>
                    <span style={{ fontSize:13, fontWeight:600, minWidth:96 }}>{concluded && b.won && pool.winnerName ? <SupplierName name={pool.winnerName}/> : b.tag}</span>
                    {b.origin ? <CountryFlag country={b.origin} size={12} /> : null}
                    <span style={{ fontSize:12, color:C.muted, flex:1 }}>{b.when}</span>
                    {concluded
                      ? (b.won && <span className="bs-chip" style={{ background:"#DCFCE7", color:C.green }}><Award size={12}/> Vincitore</span>)
                      : (b.leader && <span className="bs-chip" style={{ background:"#DCFCE7", color:C.green }}>★ leader</span>)}
                    <span className="bs-num" style={{ fontSize:15, fontWeight:700, color:(concluded?b.won:b.leader)?C.green:C.text, minWidth:64, textAlign:"right" }}>{eurKg(b.bid)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Scaglioni di volume — spostati qui dalla sezione a due colonne più
                in basso: riempiono lo spazio della colonna sinistra (vuoto quando
                non ci sono ancora offerte) e mostrano subito, senza scrollare, a
                quale scaglione/prezzo tetto ci si trova. Logica invariata: cerchio
                verde sugli scaglioni raggiunti, evidenza dello scaglione attuale,
                testo groupBuy vs asta competitiva. Stile allineato al box offerte
                (bianco, bordo sottile) per stare bene nella colonna più stretta. */}
            <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginTop:16 }}>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>Scaglioni di volume (prezzo tetto)</div>
              <div style={{ fontSize:12.5, color:C.muted, marginBottom:12, lineHeight:1.5 }}>{groupBuy ? "Prezzo garantito per fascia di volume, fissato dall'unico fornitore quotato. Aggregando la domanda si sblocca lo scaglione successivo." : "Prezzo massimo automatico garantito per fascia di volume. N.B. I fornitori possono comunque ribassare sotto questi valori in asta."}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {TIERS.map((t,i) => {
                  const reached = pool.current >= (i===0?0:TIERS[i-1].max);
                  const isCurrent = t.max===currentTier.max;
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, border:`1px solid ${isCurrent?C.purple:C.border}`, background:isCurrent?"#FBF7FF":"#fff" }}>
                      <div style={{ width:26, height:26, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", background:reached?C.green:"#F1F5F9", flexShrink:0 }}>
                        {reached ? <Check size={14} color="#fff"/> : <span style={{ fontSize:12, fontWeight:700, color:C.muted }}>{i+1}</span>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <span style={{ fontSize:13.5, fontWeight:600 }}>{t.label}</span>
                        {isCurrent && <span className="bs-chip" style={{ background:C.purple, color:"#fff", marginLeft:8 }}>Scaglione attuale</span>}
                      </div>
                      <span className="bs-num" style={{ fontSize:16, fontWeight:800, color:isCurrent?C.purple:C.text, whiteSpace:"nowrap" }}>{eurKg(t.price)}<span style={{ fontSize:11, fontWeight:400, color:C.muted }}>/kg tetto</span></span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: join */}
          <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:20 }}>
            {concluded ? (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                  <div style={{ width:34, height:34, borderRadius:"50%", background:"#F1F5F9", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Check size={18} color={C.muted}/></div>
                  <div style={{ fontSize:15, fontWeight:700 }}>Asta terminata</div>
                </div>
                <div style={{ fontSize:13, color:C.muted, marginBottom:16, lineHeight:1.5 }}>{closedDate ? <>Chiusa il <b style={{color:C.text}}>{closedDate}</b>. </> : null}L'esito è definitivo: non è più possibile aderire.</div>
                <div style={{ background:C.bg, borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
                    <span style={{ fontSize:13, color:C.muted }}>Prezzo di chiusura</span>
                    <span className="bs-num" style={{ fontSize:22, fontWeight:800, color:C.purple }}>{eurKg(finalPrice)}<span style={{ fontSize:12, fontWeight:400, color:C.muted }}>/kg</span></span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", paddingTop:8, borderTop:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:13, color:C.muted }}>Volume aggregato finale</span>
                    <span className="bs-num" style={{ fontSize:16, fontWeight:800, color:C.text }}>{kg(pool.current)} kg</span>
                  </div>
                  {pool.winnerName && (
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:10, paddingTop:8, borderTop:`1px solid ${C.border}`, marginTop:8 }}>
                      <span style={{ fontSize:13, color:C.muted, whiteSpace:"nowrap" }}>Fornitore vincitore</span>
                      <SupplierName name={pool.winnerName} style={{ fontSize:13, fontWeight:700, color:C.text, textAlign:"right" }}/>
                    </div>
                  )}
                  {myQty > 0 && (
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", paddingTop:8, borderTop:`1px solid ${C.border}`, marginTop:8 }}>
                      <span style={{ fontSize:13, color:C.muted }}>Il tuo quantitativo</span>
                      <span className="bs-num" style={{ fontSize:13, fontWeight:700, color:C.text }}>{kg(myQty)} kg</span>
                    </div>
                  )}
                </div>
                {pool.myOrderId ? (
                  <button onClick={() => { window.location.href = `/ordine?id=${pool.myOrderId}`; }} className="bs-btn" style={{ width:"100%" }}>Vai al tuo ordine <ArrowRight size={18}/></button>
                ) : myQty > 0 ? (
                  <button onClick={() => { window.location.href = "/ordini"; }} className="bs-btn" style={{ width:"100%" }}>Vai ai tuoi ordini <ArrowRight size={18}/></button>
                ) : (
                  <button onClick={() => { window.location.href = "/pool"; }} style={{ width:"100%", background:"transparent", color:C.purple, border:`1.5px solid ${C.purple}`, borderRadius:10, padding:"12px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>Vedi le aste attive <ArrowRight size={16}/></button>
                )}
              </>
            ) : joined ? (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                  <div style={{ width:34, height:34, borderRadius:"50%", background:"#DCFCE7", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Check size={18} color={C.green}/></div>
                  <div style={{ fontSize:15, fontWeight:700 }}>{groupBuy ? "Ti sei unito al gruppo d'acquisto!" : "Ti sei unito all'asta a ribasso!"}</div>
                </div>
                <div style={{ fontSize:13, color:C.muted, marginBottom:16, lineHeight:1.5 }}>{groupBuy ? "La tua quantità è entrata nel volume aggregato. Segui l'andamento dal tuo profilo." : "La tua quantità è entrata nel volume aggregato. Segui l'andamento dell'asta dal tuo profilo."}</div>
                <button onClick={() => { window.location.href = "/dashboard?section=pools"; }} className="bs-btn" style={{ width:"100%" }}>{groupBuy ? "Visualizza i tuoi acquisti di gruppo" : "Visualizza le tue aste"} <ArrowRight size={18}/></button>
              </>
            ) : targetJoin ? (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                  <div style={{ width:34, height:34, borderRadius:"50%", background:"#FFF7ED", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Clock size={18} color={C.amber}/></div>
                  <div style={{ fontSize:15, fontWeight:700 }}>Adesione in attesa</div>
                </div>
                <div style={{ fontSize:13, color:C.muted, marginBottom:16, lineHeight:1.5 }}>
                  Ti aggiungeremo automaticamente con <b style={{color:C.text}}>{kg(targetJoin.quantity_kg)} kg</b> non appena un fornitore scende a <b style={{color:C.text}}>{eurKg(targetJoin.target_price_per_kg)}/kg</b> o sotto. Nessuna azione richiesta da parte tua.
                </div>
                <button onClick={cancelTarget} style={{ width:"100%", background:"transparent", color:C.muted, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"12px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui" }}>Annulla adesione in attesa</button>
              </>
            ) : auctionBlocked ? (
              /* DIVIETO DI LEGGE (asta competitiva 2+ fornitori) — D.Lgs. 198/2021. */
              <>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                  <div style={{ width:34, height:34, borderRadius:"50%", background:"#F1F5F9", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Info size={18} color={C.muted}/></div>
                  <div style={{ fontSize:15, fontWeight:700 }}>Asta a ribasso non disponibile</div>
                </div>
                <div style={{ fontSize:13, color:C.muted, lineHeight:1.55 }}>
                  La normativa italiana vieta l'acquisto di prodotti agricoli e alimentari tramite aste elettroniche a doppio ribasso. Questo prodotto è disponibile solo con Acquisto Rapido.
                </div>
                <div style={{ fontSize:11, color:C.muted, opacity:0.85, lineHeight:1.5, marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}` }}>
                  Rif. normativo: Direttiva (UE) 2019/633 del 17 aprile 2019 sulle pratiche commerciali sleali nella filiera agroalimentare; Decreto Legislativo 8 novembre 2021, n. 198, art. 5, comma 1, lett. a) (in vigore dal 15 dicembre 2021).
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>{myQty > 0 ? "Aggiungi un quantitativo" : (groupBuy ? (isExistingAuction ? "Unisciti al gruppo d'acquisto" : "Avvia l'acquisto di gruppo") : (isExistingAuction ? "Partecipa all'asta" : "Apri un'asta"))}</div>
                {myQty > 0 ? (
                  <div style={{ fontSize:13, color:C.muted, marginBottom:14, lineHeight:1.5 }}>Hai già aderito con <b style={{color:C.text}}>{kg(myQty)} kg</b>. Il quantitativo qui sotto si aggiunge a quello che hai già.</div>
                ) : (
                  <div style={{ fontSize:13, color:C.muted, marginBottom:14 }}>La tua quantità entra subito nel volume aggregato</div>
                )}

                {/* Formati di vendita: Sacchi/Container compaiono solo se il prodotto
                    ha il peso di quel formato; "Chiudi scaglione" è un'azione diretta
                    che inserisce i kg esatti mancanti al prossimo scaglione. */}
                <div style={{ fontSize:12, fontWeight:600, color:C.muted, marginBottom:6 }}>Formato di vendita</div>
                <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                  {FORMATS.map(f => (
                    <button key={f.id} onClick={() => selectFormat(f)} style={{ flex:"1 1 auto", padding:"7px 10px", borderRadius:7, border:`1px solid ${format===f.id?C.purple:C.border}`, background:format===f.id?"#FBF7FF":"#fff", color:format===f.id?C.purple:C.muted, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui", whiteSpace:"nowrap" }}>{f.label}</button>
                  ))}
                  {tierGapKg > 0 && (
                    <button onClick={closeTierNow} title={`Inserisce i ${kg(tierGapKg)} kg che mancano al volume aggregato per sbloccare il prossimo scaglione`} style={{ flex:"1 1 auto", padding:"7px 10px", borderRadius:7, border:`1px dashed ${C.purple}`, background:"#fff", color:C.purple, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"Inter,system-ui", whiteSpace:"nowrap" }}>Chiudi scaglione</button>
                  )}
                  <button onClick={() => setFormat("kg")} style={{ flex:"1 1 auto", padding:"7px 10px", borderRadius:7, border:`1px solid ${format==="kg"?C.purple:C.border}`, background:format==="kg"?"#FBF7FF":"#fff", color:format==="kg"?C.purple:C.muted, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui", whiteSpace:"nowrap" }}>Kg personalizzati</button>
                </div>

                {activeFormat ? (
                  <>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <button className="bs-qty-btn" onClick={() => setUnitCount(unitCount-1)}><Minus size={16}/></button>
                      <div style={{ flex:1, display:"flex", alignItems:"baseline", justifyContent:"center", gap:6, background:C.bg, border:`1px solid ${belowMin?C.amber:C.border}`, borderRadius:8, padding:"9px 12px" }}>
                        <input className="bs-num" style={{ width:60, border:"none", outline:"none", background:"transparent", fontSize:20, fontWeight:700, textAlign:"center", color:C.text }} value={unitCount} onChange={e => setUnitCount(parseInt(e.target.value.replace(/\D/g,"")||"0"))}/>
                        <span style={{ fontSize:14, color:C.muted }}>{unitCount===1?activeFormat.one:activeFormat.many}</span>
                      </div>
                      <button className="bs-qty-btn" onClick={() => setUnitCount(unitCount+1)}><Plus size={16}/></button>
                    </div>
                    <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>= <b className="bs-num" style={{color:C.text}}>{kg(userQty)} kg</b> totali <span style={{ color:"#94A3B8" }}>(1 {activeFormat.one} = {kg(activeFormat.unitKg)} kg per questo prodotto)</span></div>
                  </>
                ) : (
                  <>
                    {/* Kg liberi: stessi controlli − / + dei formati, con passo di 100 kg. */}
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <button className="bs-qty-btn" onClick={() => setQtySafe(userQty-100)}><Minus size={16}/></button>
                      <div style={{ flex:1, display:"flex", alignItems:"baseline", justifyContent:"center", gap:6, background:C.bg, border:`1px solid ${belowMin?C.amber:C.border}`, borderRadius:8, padding:"9px 12px" }}>
                        <input className="bs-num" style={{ width:90, border:"none", outline:"none", background:"transparent", fontSize:20, fontWeight:700, textAlign:"center", color:C.text }} value={userQty} onChange={e => setQtySafe(parseInt(e.target.value.replace(/\D/g,"")||"0"))}/>
                        <span style={{ fontSize:14, color:C.muted }}>kg</span>
                      </div>
                      <button className="bs-qty-btn" onClick={() => setQtySafe(userQty+100)}><Plus size={16}/></button>
                    </div>
                    <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>= <b className="bs-num" style={{color:C.text}}>{palletCount}</b> pedane circa <span style={{ color:"#94A3B8" }}>(≈ {(userQty/palletKg).toFixed(2)} · 1 pallet = {kg(palletKg)} kg per questo prodotto)</span></div>
                  </>
                )}

                {belowMin && (
                  <div style={{ background:"#FFFBEB", border:`1px solid ${C.amber}55`, borderRadius:9, padding:"10px 12px", marginBottom:14, fontSize:12, color:"#92400E", display:"flex", gap:8 }}>
                    <Info size={26} color={C.amber} style={{ flexShrink:0 }}/>
                    <span>{groupBuy
                      ? (isExistingAuction
                        ? <>Meno di 1 pallet (<b>{kg(palletKg)} kg</b> per questo prodotto): puoi comunque <b>aggiungere</b> questo quantitativo al gruppo d'acquisto già avviato. Il minimo di 1 pedana vale solo per <b>avviare</b> un nuovo acquisto di gruppo.</>
                        : <>Sotto 1 pallet (<b>{kg(palletKg)} kg</b> per questo prodotto) non puoi avviare un acquisto di gruppo, ma puoi aggiungerti a uno già avviato oppure fare l'<b>Acquisto Rapido</b>.</>)
                      : (isExistingAuction
                        ? <>Meno di 1 pallet (<b>{kg(palletKg)} kg</b> per questo prodotto): puoi comunque <b>aggiungere</b> questo quantitativo all'asta già attiva. Il minimo di 1 pedana vale solo per <b>aprire</b> una nuova asta.</>
                        : <>Sotto 1 pallet (<b>{kg(palletKg)} kg</b> per questo prodotto) non puoi aprire un'asta, ma puoi aggiungerti a una già attiva oppure fare l'<b>Acquisto Rapido</b>.</>)}</span>
                  </div>
                )}

                {!isPalletMultiple && (
                  <div style={{ background:"#FFFBEB", border:`1px solid ${C.amber}55`, borderRadius:9, padding:"10px 12px", marginBottom:14, fontSize:12, color:"#92400E", display:"flex", gap:8 }}>
                    <Info size={26} color={C.amber} style={{ flexShrink:0 }}/>
                    <span>Questa quantità non è un multiplo di pedana: potrebbe comportare un supplemento di spedizione in collettame, verificato quando l'asta si chiude e viene assegnato il corriere. Se nessun corriere disponibile offre il collettame su quella tratta, l'ordine resterà in attesa di corriere, come già accade oggi per gli acquisti diretti.</span>
                  </div>
                )}

                <div style={{ background:C.bg, borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
                    <span style={{ fontSize:13, color:C.muted }}>Prezzo stimato (live)</span>
                    <span className="bs-num" style={{ fontSize:24, fontWeight:800, color:C.purple }}>{eurKg(ceilingProjected)}<span style={{ fontSize:13, fontWeight:400, color:C.muted }}>/kg</span></span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", paddingTop:8, borderTop:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:13, color:C.muted }}>Risparmio vs Acquisto Rapido</span>
                    <span className="bs-num" style={{ fontSize:18, fontWeight:800, color:C.green }}>{eur(savings)}</span>
                  </div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{groupBuy ? "Il prezzo scende solo sbloccando scaglioni di volume più alti — non ci sono ribassi da altri fornitori." : "Il prezzo finale può solo scendere fino alla chiusura."}</div>
                </div>

                {/* L'accettazione dei termini è stata spostata nel pop-up di
                    conferma (unico flag finale): qui niente più checkbox. */}

                {showTargetInput && (
                  <div style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:12, marginBottom:12, background:C.bg }}>
                    <div style={{ fontSize:12.5, fontWeight:600, color:C.muted, marginBottom:8 }}>A quale prezzo vuoi aderire?</div>
                    <div style={{ display:"flex", alignItems:"center", gap:6, background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px" }}>
                      <span style={{ color:C.muted }}>€</span>
                      <input value={targetPrice} onChange={e => setTargetPrice(e.target.value.replace(/[^0-9,.]/g,""))} placeholder={String(effectiveNow.toFixed(2)).replace(".",",")} className="bs-num" style={{ flex:1, border:"none", outline:"none", background:"transparent", fontSize:16, fontWeight:700, color:C.text }}/>
                      <span style={{ color:C.muted, fontSize:13 }}>/kg</span>
                    </div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>Prezzo attuale: {eurKg(effectiveNow)}/kg. Ti aggiungeremo in automatico se e quando un fornitore arriva a questa cifra.</div>
                  </div>
                )}

                {/* Il click NON esegue più direttamente: apre il pop-up di conferma
                    vincolante (unico flag T&C), che poi chiama joinTheAuction. */}
                <button onClick={() => { setConfirmError(null); setPendingConfirm(() => joinTheAuction); }} className="bs-btn" style={{ width:"100%", marginBottom:8 }} disabled={joining || mustOpenWithPallet}>{joining ? "Adesione in corso…" : <>{myQty > 0 ? (groupBuy ? "Aggiungi questo quantitativo al gruppo" : "Aggiungi questo quantitativo all'asta in corso") : (groupBuy ? (isExistingAuction ? "Unisciti al gruppo d'acquisto" : "Avvia l'acquisto di gruppo") : (isExistingAuction ? "Partecipa all'asta a ribasso all'attuale prezzo" : "Apri un'asta a ribasso all'attuale prezzo"))} <ArrowRight size={18}/></>}</button>
                {/* Adesione a soglia di prezzo: solo in asta (dipende dal ribasso dei
                    fornitori). Nell'acquisto di gruppo il prezzo non dipende da offerte,
                    quindi non ha senso — nascosta. Il click di conferma passa dallo
                    stesso pop-up (unico flag finale). */}
                {!groupBuy && (
                <button
                  onClick={() => { if (showTargetInput) { setConfirmError(null); setPendingConfirm(() => joinAtTarget); } else setShowTargetInput(true); }}
                  style={{ width:"100%", background:"transparent", color:C.purple, border:`1.5px solid ${C.purple}`, borderRadius:10, padding:"12px", fontSize:14, fontWeight:700, cursor:(joining||mustOpenWithPallet)?"default":"pointer", opacity:(joining||mustOpenWithPallet)?0.5:1, fontFamily:"Inter,system-ui", display:"flex", alignItems:"center", justifyContent:"center", gap:6, textAlign:"center" }}
                  disabled={joining || mustOpenWithPallet}
                >
                  {joining ? "Attivazione in corso…" : showTargetInput ? "Conferma soglia e attiva adesione" : (myQty > 0 ? "Aggiungi altro quantitativo quando il prezzo raggiunge una cifra stabilita" : (isExistingAuction ? "Partecipa all'asta a ribasso quando il prezzo raggiunge una cifra stabilita" : "Apri un'asta a ribasso quando il prezzo raggiunge una cifra stabilita"))}
                </button>
                )}
                {joinMsg && <div style={{ marginTop:10, fontSize:13, textAlign:"center", color: joinMsg.startsWith("✓") ? C.green : C.red }}>{joinMsg}</div>}
              </>
            )}
          </div>
        </div>

        {/* GUARANTEE STRIP */}
        <div style={{ background:"#07111E", borderRadius:14, padding:"18px 24px", marginBottom:28, display:"flex", gap:14, alignItems:"center", flexWrap:"wrap" }}>
          <Shield size={22} color="#22D3EE" style={{ flexShrink:0 }}/>
          <div style={{ flex:1, minWidth:220 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#F0F6FF" }}>{groupBuy ? "L'acquisto di gruppo si chiude sempre · a rischio zero" : "L'asta si chiude sempre · a rischio zero"}</div>
            <div style={{ fontSize:13, color:"#6B94B8", lineHeight:1.5 }}>{groupBuy
              ? "Anche se sei l'unico partecipante, alla scadenza acquisti comunque la tua quantità al prezzo del tuo scaglione di volume. Non paghi mai più dell'Acquisto Rapido: l'unico costo è l'attesa."
              : "Anche se l'asta resta deserta e sei l'unico partecipante, alla scadenza acquisti comunque la tua quantità al prezzo del tuo volume. Non paghi mai più dell'Acquisto Rapido: l'unico costo è l'attesa."}</div>
          </div>
        </div>

        {/* TWO COLUMNS */}
        <div className="bs-cols" style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:24, alignItems:"start" }}>

          {/* LEFT */}
          <div>
            {/* "Scaglioni di volume" è stato spostato nel box asta in evidenza
                (colonna sinistra, sotto le offerte live). Qui parte direttamente
                da "Chi ha aderito". */}
            <div className="bs-card" style={{ marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div style={{ fontSize:16, fontWeight:700 }}>Chi ha aderito</div>
                <span style={{ fontSize:12, color:C.muted }}>{participants.length} aziende · {kg(pool.current)} kg</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column" }}>
                {participants.map((p,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:i<participants.length-1?`1px solid #F1F5F9`:"none" }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", background:"#EFF6FF", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Users size={15} color={C.blue}/></div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600 }}>{p.who}</div>
                      {p.when && <div style={{ fontSize:12, color:C.muted }}>{p.when}</div>}
                    </div>
                    <span className="bs-num" style={{ fontSize:14, fontWeight:700 }}>{kg(p.qty)} kg</span>
                  </div>
                ))}
              </div>
            </div>

            {pendingJoins.length > 0 && (
              <div className="bs-card" style={{ marginBottom:20, borderColor:`${C.amber}55` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                  <div style={{ fontSize:16, fontWeight:700 }}>Chi ha aderito in base al prezzo</div>
                  <span style={{ fontSize:12, color:C.muted }}>{pendingJoins.length} in attesa</span>
                </div>
                <div style={{ fontSize:12.5, color:C.muted, marginBottom:12, lineHeight:1.5 }}>Clienti pronti ad aderire automaticamente se un fornitore raggiunge il loro prezzo. Utile per i fornitori: un ulteriore ribasso può far entrare subito questi volumi.</div>
                <div style={{ display:"flex", flexDirection:"column" }}>
                  {pendingJoins.map((p,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:i<pendingJoins.length-1?`1px solid #F1F5F9`:"none" }}>
                      <div style={{ width:32, height:32, borderRadius:"50%", background:"#FFF7ED", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Clock size={15} color={C.amber}/></div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:600 }}>{regionLabel(p.city, p.country)}</div>
                        <div style={{ fontSize:12, color:C.muted }}>{kg(p.quantity_kg)} kg in attesa</div>
                      </div>
                      <span className="bs-num" style={{ fontSize:14, fontWeight:700, color:C.amber }}>{eurKg(p.target_price_per_kg)}/kg</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bs-card">
              <div style={{ fontSize:16, fontWeight:700, marginBottom:14 }}>{groupBuy ? "Come funziona l'acquisto di gruppo" : "Come funziona l'asta a ribasso"}</div>
              {(groupBuy ? [
                ["Avvia o unisciti",`Avvia un acquisto di gruppo (minimo 1 pallet, ${kg(palletKg)} kg per questo prodotto) o unisciti a uno già avviato. La tua quantità entra subito nel volume aggregato.`],
                ["Aggrega la domanda","Più acquirenti si uniscono, più sale il volume totale: al superamento di ogni scaglione il prezzo dell'unico fornitore quotato scende per tutti."],
                ["Prezzo fisso del fornitore","Non c'è competizione né asta: il prezzo è quello dello scaglione di volume raggiunto, fissato dall'unico fornitore quotato."],
                ["Chiusura garantita","L'acquisto di gruppo chiude sempre. Anche da solo acquisti al prezzo del tuo volume. Pagamento in escrow, spedizione separata per ogni azienda."],
              ] : [
                ["Apri o unisciti",`Apri un'asta a ribasso (minimo 1 pallet, ${kg(palletKg)} kg per questo prodotto) o unisciti a una già attiva. La tua quantità entra subito nel volume aggregato.`],
                ["Doppio ribasso per 7 giorni","Per una settimana il prezzo scende in due modi: i fornitori certificati competono al ribasso e ogni nuova adesione può sbloccare uno scaglione di volume più basso."],
                ["Vince il più economico","Alla chiusura si aggiudica il fornitore con l'offerta più bassa tra quelli conformi allo standard. La sua identità viene svelata."],
                ["Chiusura garantita","L'asta chiude sempre. Anche da solo acquisti al prezzo del tuo volume. Pagamento in escrow, spedizione separata per ogni azienda."],
              ]).map(([t,desc],i) => (
                <div key={i} style={{ display:"flex", gap:12, marginBottom:i<3?14:0 }}>
                  <div style={{ width:24, height:24, borderRadius:"50%", background:C.purple, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>{i+1}</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, marginBottom:2 }}>{t}</div>
                    <div style={{ fontSize:13, color:C.muted, lineHeight:1.55 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT STICKY */}
          <div style={{ position:"sticky", top:80, display:"flex", flexDirection:"column", gap:16 }}>
            {/* "Fornitori in gara" solo in asta a ribasso: nell'acquisto di gruppo
                c'è un solo fornitore, nessuna gara da mostrare. */}
            {!groupBuy && (
            <div className="bs-card">
              <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Fornitori in gara</div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>Tutti certificati allo standard richiesto. Identità svelata alla chiusura.</div>
              {bidders.map((b,i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderBottom:i<bidders.length-1?`1px solid #F1F5F9`:"none" }}>
                  {b.origin ? <CountryFlag country={b.origin} size={12} /> : null}
                  <span style={{ fontSize:13, fontWeight:600, flex:1 }}>{b.tag}</span>
                  <span style={{ fontSize:12, color:C.muted }}>{b.origin}</span>
                  {b.leader && <Award size={14} color={C.green}/>}
                </div>
              ))}
            </div>
            )}

            <div className="bs-card">
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
                <span className="bs-live-dot"/><span style={{ fontSize:14, fontWeight:700 }}>Attività recente</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
                {/* Attività di ribasso fornitore solo in asta a ribasso. */}
                {!groupBuy && <Activity icon={<Gavel size={12} color={C.blue}/>} text={<><b>Fornitore #3</b> ha ribassato a <b className="bs-num" style={{color:C.green}}>€2,27/kg</b></>} when="12 min fa"/>}
                {participants.slice(0,4).map((p,i) => (
                  <Activity key={i} icon={<Users size={12} color={C.purple}/>} text={<><b>{p.who}</b> ha aggiunto <b className="bs-num" style={{color:C.purple}}>{kg(p.qty)} kg</b></>} when={p.when}/>
                ))}
              </div>
            </div>

            <div className="bs-card" style={{ background:"#EFF6FF", borderColor:"#BFDBFE", textAlign:"center" }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Vuoi scegliere il fornitore?</div>
              <div style={{ fontSize:13, color:C.muted, marginBottom:12 }}>Con l'Acquisto Rapido scegli qualità, origine e tempi — non solo prezzo.</div>
              {/* Stessa azione di "Acquista subito" (Home): la pagina prodotto, dove
                  vive l'Acquisto Rapido. Sull'asta demo (senza prodotto) → catalogo. */}
              <button className="bs-btn bs-btn-blue" onClick={() => { window.location.href = productId ? `/prodotto?id=${productId}` : "/catalogo"; }} style={{ width:"100%", fontSize:14, padding:"11px" }}>Acquista subito <ArrowRight size={15}/></button>
            </div>
          </div>
        </div>
        </>
        )}
      </div>

      {/* FOOTER */}
      <div style={{ background:"#050D18", padding:"28px 20px" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:14 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display:"flex", alignItems:"center", gap:9, cursor:"pointer" }}>
            <BSIcon size={26} uid="foot"/><span style={{ fontSize:15, fontWeight:900, color:"#F0F6FF" }}>BulkStrike</span>
          </div>
          <div style={{ display:"flex", gap:18, flexWrap:"wrap" }}>
            {[["Termini","/legale#termini"],["Privacy","/legale#privacy"],["Cookie","/legale#cookie"],["Contatti","mailto:info@bulkstrike.com"]].map(([l,href]) => <a key={l} href={href} style={{ fontSize:13, color:"#3B5A7A", cursor:"pointer", textDecoration:"none" }}>{l}</a>)}
          </div>
          <div style={{ fontSize:13, color:"#3B5A7A" }}>© 2026 BulkStrike S.r.l.</div>
        </div>
      </div>

      {/* CHATBOT */}
      <BulkStrikeChatWidget accent={C.purple} />

      {/* POP-UP di conferma vincolante: ultimo passaggio prima di aderire/aprire
          davvero. Solo dopo l'accettazione dei T&C esegue l'azione reale. In
          productMode l'azione è l'apertura del pool (openNewAuction, richiamata
          da joinTheAuction), altrimenti l'adesione a quello esistente. */}
      <BulkStrikeAuctionConfirm
        open={!!pendingConfirm}
        mode={productMode ? "open" : "join"}
        groupBuy={groupBuy}
        productName={pool.product || "questo prodotto"}
        quantityKg={userQty}
        busy={joining}
        error={confirmError}
        onCancel={() => { setPendingConfirm(null); setConfirmError(null); }}
        onConfirm={async () => {
          const run = pendingConfirm;
          if (!run) return;
          const res = await run();
          // Solo se l'azione va a buon fine chiudiamo il pop-up 1 e apriamo il 2.
          if (res?.status === "success") {
            setConfirmError(null);
            setPendingConfirm(null);
            setSuccessInfo({ mode: res.mode, quantityKg: res.quantityKg, closeHref: res.closeHref });
          } else if (res?.status === "scheduled" || res?.status === "noop") {
            setConfirmError(null);
            setPendingConfirm(null);
          } else {
            // errore: il pop-up 1 resta aperto e mostra il messaggio
            setConfirmError(res?.message || "Operazione non riuscita. Riprova.");
          }
        }}
      />

      {/* POP-UP 2 — conferma di avvenuta partecipazione (appare solo dopo il
          successo). "Vai alle aste personali" porta al profilo; "Chiudi" resta
          dove si è (per l'apertura: va al pool appena creato via closeHref). */}
      <BulkStrikeAuctionSuccess
        open={!!successInfo}
        mode={successInfo?.mode || "join"}
        groupBuy={groupBuy}
        productName={pool.product || "questo prodotto"}
        quantityKg={successInfo?.quantityKg ?? userQty}
        onGoToPersonal={() => { window.location.href = "/dashboard?section=pools"; }}
        onClose={() => { const href = successInfo?.closeHref; setSuccessInfo(null); if (href) window.location.href = href; }}
      />
    </div>
  );
}

function Activity({ icon, text, when }) {
  return (
    <div style={{ display:"flex", gap:9, fontSize:13 }}>
      <div style={{ marginTop:2, flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ color:"#0F172A", lineHeight:1.4 }}>{text}</div>
        <div style={{ fontSize:11, color:"#64748B" }}>{when}</div>
      </div>
    </div>
  );
}
