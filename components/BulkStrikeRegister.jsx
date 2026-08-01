import { useState, useEffect } from "react";
import { registerCompany, signUpAccount, findClaimCandidates, requestCompanyClaim, completeClaimedCompany, getMacroAreas } from "@/lib/api";
import { ShoppingCart, Factory, Truck, Check, ArrowRight, ArrowLeft, Mail, Lock, Building2, Globe, Phone, User, MapPin, Award, Boxes, Shield, X, Bell, Search, Plus, TrendingDown, Zap, ChevronRight, Eye, EyeOff } from "lucide-react";
import BulkStrikeNav from "@/components/BulkStrikeNav";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", amber:"#D97706", purple:"#7C3AED" };

const COUNTRIES = ["Italia","Francia","Spagna","Germania","Portogallo","Austria","Grecia","Polonia","Cina","Argentina","Turchia","Altro"];
// I settori mostrati sono quelli VERI della tassonomia (get_taxonomy: 55
// settori in 13 macro-aree, gli stessi del pannello filtri "Aree" del
// catalogo). Gli id selezionati vanno in payload.sectors di register_company,
// che li imposta come settori preferiti (+ prodotti, meccanismo DAV-47): il
// nuovo utente apre il catalogo e vede di default solo i prodotti rilevanti.
// SECTOR_PRODUCTS resta la mappa dei suggerimenti materiali, agganciata alle
// macro-aree tramite sectorSuggestionKey.
const SECTOR_PRODUCTS = {
  "Enologia / Vino": ["Acido tartarico","Acido malico","Acido lattico","Acido citrico","Acido metatartarico","Metabisolfito di potassio","Bentonite","Tannini enologici","Mannoproteine","Gomma arabica","CMC","Lieviti enologici","MCR (mosto concentrato rettificato)","Gas tecnici (N2/CO2/O2)"],
  "Alimentare": ["Acido citrico","Acido lattico","Acido malico","Saccarosio","Maltodestrine","Amido","Pectine","Acido ascorbico","Aromi","Conservanti"],
  "Chimica": ["Acido solforico","Soda caustica","Acido acetico","Glicerina","Perossido di idrogeno","Solventi industriali","Tensioattivi"],
  "Cosmetica": ["Glicerina","Acido ialuronico","Tensioattivi","Oli vegetali","Vitamina E","Conservanti cosmetici","Burro di karité"],
  "Farmaceutica": ["Eccipienti","Lattosio farmaceutico","Cellulosa microcristallina","Mannitolo","Acido citrico USP"],
  "Mangimistica": ["Amminoacidi","Carbonato di calcio","Premiscele vitaminiche","Sali minerali","Lieviti zootecnici"],
  "Altro": [],
};
const ALL_MATERIALS = [...new Set(Object.values(SECTOR_PRODUCTS).flat())];

// Da settore reale (slug + macro-area) alla chiave dei suggerimenti materiali.
// I settori senza corrispondenza non mostrano suggerimenti: resta la ricerca.
function sectorSuggestionKey(macroSlug, sectorSlug) {
  if (sectorSlug === "enologia") return "Enologia / Vino";
  if (macroSlug === "alimentare-bevande") return "Alimentare";
  if (macroSlug === "chimica-solventi-gas") return "Chimica";
  if (macroSlug === "cosmetica-detergenza-igiene") return "Cosmetica";
  if (macroSlug === "farmaceutica-nutraceutica") return "Farmaceutica";
  if (macroSlug === "mangimi-zootecnia") return "Mangimistica";
  return null;
}
const CERTS = ["Food Grade","OIV","ISO 9001","ISO 22000","REACH","Kosher","Halal","Bio / Organic","FSSC 22000"];

// per-material alert types, differ by account type
const ALERT_DEFS = {
  buyer: [
    { k:"pool",     icon:Bell,        label:"Apre un'asta a ribasso",   desc:"Avvisami quando apre un'asta a ribasso per questo articolo — per partecipare e approfittarne" },
    { k:"price",    icon:TrendingDown,label:"Prezzo in calo", desc:"Avvisami quando arrivano nuove offerte più basse" },
    { k:"supplier", icon:Factory,     label:"Nuovo fornitore",desc:"Avvisami quando un nuovo fornitore certificato si aggiunge" },
  ],
  supplier: [
    { k:"pool",    icon:Bell,   label:"Apre un'asta a ribasso",     desc:"Avvisami quando apre un'asta a ribasso per questo articolo — per fare un'offerta a ribasso" },
    { k:"request", icon:Search, label:"Richiesta cliente",desc:"Avvisami quando un cliente cerca questo prodotto" },
    { k:"outbid",  icon:Zap,    label:"Offerta superata", desc:"Avvisami se un concorrente offre un prezzo più basso del tuo" },
  ],
};
const DEFAULT_ALERTS = { buyer:{ pool:true, price:false, supplier:false }, supplier:{ pool:true, request:false, outbid:false } };

function Field({ icon, label, children, required, half }) {
  return (
    <div style={{ marginBottom:16, ...(half?{}:{gridColumn:"1 / -1"}) }}>
      <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, fontWeight:600, color:C.text, marginBottom:6 }}>
        {icon}{label}{required && <span style={{ color:C.blue }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = { width:"100%", border:`1px solid ${C.border}`, borderRadius:9, padding:"11px 13px", fontSize:14, outline:"none", fontFamily:"Inter,system-ui", color:C.text, background:"#fff" };

// Messaggio "email già registrata": costante così il render dello step 1 può
// riconoscerlo e affiancargli il link al login, senza regex fragili sul testo.
const EMAIL_TAKEN_MSG = "Questa email risulta già registrata.";

function ChipSelect({ options, selected, onToggle }) {
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
      {options.map(o => {
        const on = selected.includes(o);
        return (
          <button key={o} onClick={() => onToggle(o)} type="button"
            style={{ padding:"7px 13px", borderRadius:100, border:`1.5px solid ${on?C.blue:C.border}`, background:on?"#EFF6FF":"#fff", color:on?C.blue:C.muted, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui", display:"flex", alignItems:"center", gap:5 }}>
            {on && <Check size={13}/>}{o}
          </button>
        );
      })}
    </div>
  );
}

const chipStyle = (on) => ({ padding:"7px 13px", borderRadius:100, border:`1.5px solid ${on?C.blue:C.border}`, background:on?"#EFF6FF":"#fff", color:on?C.blue:C.muted, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui", display:"flex", alignItems:"center", gap:5 });

function MaterialsPicker({ type, f, set }) {
  const [q, setQ] = useState("");
  const sectors = f.sectors; // array di sector_id (uuid) della tassonomia reale
  const materials = f.materials;
  const defs = ALERT_DEFS[type];

  // Tassonomia reale macro-aree → settori, la stessa del pannello "Aree".
  const [taxonomy, setTaxonomy] = useState([]);
  const [openMacros, setOpenMacros] = useState(() => new Set());
  useEffect(() => { getMacroAreas().then(m => setTaxonomy(m || [])).catch(() => {}); }, []);

  const toggleSector = (id) => set("sectors", sectors.includes(id) ? sectors.filter(x=>x!==id) : [...sectors, id]);
  const toggleMacroOpen = (slug) => setOpenMacros(prev => {
    const n = new Set(prev); n.has(slug) ? n.delete(slug) : n.add(slug); return n;
  });
  const addMat = (m) => { if(!materials[m]) set("materials", { ...materials, [m]:{...DEFAULT_ALERTS[type]} }); };
  const removeMat = (m) => { const c={...materials}; delete c[m]; set("materials", c); };
  const toggleMat = (m) => materials[m] ? removeMat(m) : addMat(m);
  const toggleAlert = (m,k) => set("materials", { ...materials, [m]:{ ...materials[m], [k]:!materials[m][k] } });

  const query = q.trim().toLowerCase();
  const searchHits = query ? ALL_MATERIALS.filter(m => m.toLowerCase().includes(query)) : [];
  const exact = query && ALL_MATERIALS.some(m => m.toLowerCase()===query);
  const selectedNames = Object.keys(materials);
  // Chiavi dei suggerimenti materiali derivate dai settori reali selezionati.
  const suggestionKeys = [...new Set(taxonomy.flatMap(m =>
    (m.sub_areas || [])
      .filter(s => sectors.includes(s.id))
      .map(s => sectorSuggestionKey(m.slug, s.slug))
  ).filter(Boolean))];

  return (
    <div style={{ marginBottom:18 }}>
      {/* SECTORS — tassonomia reale, accordion per macro-area */}
      <div style={{ fontSize:13, fontWeight:600, marginBottom:4, display:"flex", alignItems:"center", gap:6 }}>
        <Boxes size={14} color={C.muted}/> In quali settori {type==="supplier"?"operi":"opera la tua azienda"}? <span style={{ color:C.muted, fontWeight:400 }}>· seleziona uno o più</span>
      </div>
      <div style={{ fontSize:12, color:C.muted, marginBottom:8 }}>
        Li impostiamo come preferiti: il catalogo ti mostrerà subito solo i prodotti dei tuoi settori (potrai sempre cambiare).
      </div>
      <div style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:"8px 12px", marginBottom:16, maxHeight:280, overflowY:"auto" }}>
        {taxonomy.length === 0 && <div style={{ fontSize:13, color:C.muted, padding:"6px 0" }}>Caricamento settori…</div>}
        {taxonomy.map(m => {
          const subs = m.sub_areas || [];
          const selCount = subs.filter(s => sectors.includes(s.id)).length;
          const open = openMacros.has(m.slug);
          return (
            <div key={m.id}>
              <div onClick={() => toggleMacroOpen(m.slug)}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 2px", cursor:"pointer", fontSize:13.5, fontWeight:600, color:C.text }}>
                <span style={{ fontSize:15 }}>{m.icon || "📦"}</span>
                <span style={{ flex:1 }}>{m.name}</span>
                {selCount > 0 && <span style={{ fontSize:11.5, fontWeight:700, color:C.blue, background:"#EFF6FF", borderRadius:100, padding:"2px 8px" }}>{selCount}</span>}
                <ChevronRight size={14} color={C.muted} style={{ transform: open ? "rotate(90deg)" : "none", transition:"transform 0.15s" }}/>
              </div>
              {open && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, padding:"4px 0 10px 26px" }}>
                  {subs.map(s => {
                    const on = sectors.includes(s.id);
                    return <button key={s.id} type="button" onClick={()=>toggleSector(s.id)} style={chipStyle(on)}>{on && <Check size={13}/>}{s.icon} {s.name}</button>;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* SEARCH */}
      <div style={{ position:"relative", marginBottom:12 }}>
        <Search size={15} color={C.muted} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)" }}/>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cerca o aggiungi una materia prima, anche fuori dai tuoi settori..." style={{ ...inputStyle, paddingLeft:36 }}/>
      </div>

      {/* RESULTS: search-driven, or grouped by sector */}
      {query ? (
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:18 }}>
          {searchHits.map(m => { const on=!!materials[m]; return <button key={m} type="button" onClick={()=>toggleMat(m)} style={chipStyle(on)}>{on && <Check size={13}/>}{m}</button>; })}
          {!exact && (
            <button type="button" onClick={()=>{ addMat(q.trim()); setQ(""); }} style={{ padding:"7px 13px", borderRadius:100, border:`1.5px dashed ${C.blue}`, background:"#fff", color:C.blue, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"Inter,system-ui", display:"flex", alignItems:"center", gap:5 }}>
              <Plus size={14}/> Aggiungi “{q.trim()}”
            </button>
          )}
        </div>
      ) : sectors.length>0 ? (
        <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:18 }}>
          {suggestionKeys.map(s => (
            <div key={s}>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.05em" }}>{s}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {SECTOR_PRODUCTS[s].map(m => { const on=!!materials[m]; return <button key={m} type="button" onClick={()=>toggleMat(m)} style={chipStyle(on)}>{on && <Check size={13}/>}{m}</button>; })}
              </div>
            </div>
          ))}
          {suggestionKeys.length === 0 && (
            <div style={{ fontSize:13, color:C.muted }}>Per i settori scelti usa la ricerca qui sopra per aggiungere le materie prime.</div>
          )}
        </div>
      ) : (
        <div style={{ fontSize:13, color:C.muted, background:C.bg, borderRadius:10, padding:"14px 16px", marginBottom:18, textAlign:"center" }}>
          Seleziona uno o più settori per vedere le materie prime correlate, oppure cercane una qui sopra.
        </div>
      )}

      {/* SELECTED + PER-MATERIAL ALERTS */}
      {selectedNames.length>0 && (
        <div style={{ border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden" }}>
          <div style={{ background:"#FBFCFE", padding:"12px 14px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <Bell size={15} color={C.blue}/>
            <span style={{ fontSize:13, fontWeight:700 }}>I tuoi avvisi · {selectedNames.length}</span>
            <span style={{ fontSize:12, color:C.muted }}>scegli quando essere avvisato per ogni materia prima</span>
          </div>
          <div>
            {selectedNames.map((m,i) => (
              <div key={m} style={{ padding:"14px", borderBottom:i<selectedNames.length-1?`1px solid #F1F5F9`:"none" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, gap:8 }}>
                  <span style={{ fontSize:14, fontWeight:700 }}>{m}</span>
                  <button type="button" onClick={()=>removeMat(m)} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted, display:"flex", alignItems:"center", gap:4, fontSize:12, fontFamily:"Inter,system-ui" }}><X size={13}/> rimuovi</button>
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {defs.map(d => {
                    const on = materials[m][d.k];
                    const Ico = d.icon;
                    return (
                      <button key={d.k} type="button" onClick={()=>toggleAlert(m,d.k)} title={d.desc}
                        style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 11px", borderRadius:8, cursor:"pointer", fontFamily:"Inter,system-ui", fontSize:12.5, fontWeight:600, border:`1.5px solid ${on?C.blue:C.border}`, background:on?"#EFF6FF":"#fff", color:on?C.blue:C.muted }}>
                        <Ico size={14}/> {d.label} {on && <Check size={12}/>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step "la tua azienda è già nel nostro censimento" ──────────────────────
// Tono: è una nostra ricerca di mercato, non dati che l'utente ci ha dato e noi
// gli rigiriamo addosso. Lo diciamo esplicitamente, come nella sezione
// "Fornitori individuati" delle schede prodotto. Rifiutare dev'essere facile
// quanto accettare: il bottone per creare un profilo nuovo sta allo stesso
// livello visivo, non in fondo in piccolo.
function ClaimStep({ loading, candidates, error, onClaim, onSkip, busy }) {
  if (loading) {
    return <div style={{ padding:"40px 0", textAlign:"center", color:C.muted, fontSize:14 }}>Cerchiamo se abbiamo già dei dati sulla tua azienda…</div>;
  }
  return (
    <>
      <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>Abbiamo già dei dati sulla tua azienda</div>
      <p style={{ fontSize:13.5, color:C.muted, lineHeight:1.6, marginBottom:18 }}>
        Mappando il mercato delle materie prime abbiamo raccolto informazioni pubbliche su chi produce
        e distribuisce. Se una di queste è la tua azienda, puoi prenderne il controllo: la completi e la
        gestisci tu, invece di ricominciare da capo. Nessuno di questi dati arriva da te — se preferisci,
        crea pure un profilo nuovo.
      </p>

      {error && <div style={{ fontSize:13, color:C.red, marginBottom:12 }}>{error}</div>}

      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:18 }}>
        {candidates.map(c => (
          <div key={c.canonical_id} style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px", display:"flex", gap:12, alignItems:"center", flexWrap:"wrap", background:"#fff" }}>
            <div style={{ flex:1, minWidth:200 }}>
              <div style={{ fontSize:14.5, fontWeight:700 }}>{c.legal_name}</div>
              <div style={{ fontSize:12.5, color:C.muted, marginTop:2 }}>
                {[c.country, c.website].filter(Boolean).join(" · ")}
              </div>
              {(c.settori || []).length > 0 && (
                <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>
                  {c.settori.join(" · ")}
                  {c.righe > 1 && <> — <b>{c.righe} schede da unificare</b></>}
                </div>
              )}
            </div>
            <button disabled={busy} onClick={() => onClaim(c)} className="bs-btn" style={{ whiteSpace:"nowrap" }}>
              {busy ? "Attendi…" : "È la mia azienda"}
            </button>
          </div>
        ))}
      </div>

      <button onClick={onSkip} className="bs-btn-out" style={{ width:"100%" }}>
        Nessuna di queste — inserisco la mia azienda
      </button>
    </>
  );
}

export default function RegisterPage() {
  const [type, setType] = useState(null);      // 'buyer' | 'supplier'
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [f, setF] = useState({
    email:"", pass:"", pass2:"", company:"", vat:"", country:"Italia", city:"", address:"", phone:"", website:"", contact:"",
    volume:"", deliveryAddr:"", sectors:[], materials:{},
    emailMgmt:"", emailAdmin:"", pec:"", sdi:"", ibanHolder:"", iban:"", bic:"",
    certs:[], capacity:"", served:[], bulk:true,
    terms:false, privacy:false, ai:false,
  });
  const set = (k,v) => setF(s => ({ ...s, [k]:v }));
  const toggle = (k,v) => setF(s => ({ ...s, [k]: s[k].includes(v) ? s[k].filter(x=>x!==v) : [...s[k], v] }));

  const steps = ["Account","Azienda", type==="supplier"?"Catalogo":type==="carrier"?"Pagamenti":"Esigenze"];
  const canConsent = f.terms && f.privacy && f.ai;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showPass, setShowPass] = useState(false);   // occhiolino campo Password
  const [showPass2, setShowPass2] = useState(false);  // occhiolino campo Conferma password

  // ── Rivendicazione azienda ────────────────────────────────────────────────
  // claimState: "choose" = mostriamo le aziende trovate | "form" = inserimento
  // manuale | "claimed" = rivendicata (l'anagrafica esiste gia', niente modulo).
  const [claimState, setClaimState] = useState("choose");
  const [candidates, setCandidates] = useState([]);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState(null);
  const [claimed, setClaimed] = useState(null); // { company_id, status, legal_name }

  // L'account si crea alla fine dello step 1: senza sessione le RPC di
  // rivendicazione non sono chiamabili (il dominio si legge da auth.users).
  const [accountCreated, setAccountCreated] = useState(false);

  async function goToCompanyStep() {
    setError(null);
    // NON avanzare allo step 2 prima che l'account esista: se signUp fallisce
    // l'utente deve restare visibilmente sullo step 1, con l'errore sotto gli
    // occhi, invece di un flash verso lo step 2 seguito da un rimbalzo indietro.
    if (!accountCreated) {
      try {
        await signUpAccount(f.email.trim(), f.pass);
        setAccountCreated(true);
      } catch (e) {
        const msg = String(e?.message || e);
        setError(/already|registered|exists/i.test(msg)
          ? EMAIL_TAKEN_MSG
          : /password/i.test(msg)
          ? "La password non soddisfa i requisiti: usa almeno 12 caratteri."
          : "Non è stato possibile creare l'account. Riprova.");
        return; // resta sullo step 1
      }
    }
    setStep(2); // account creato (o già creato in questa sessione): ora si avanza
    setClaimLoading(true);
    try {
      const rows = await findClaimCandidates({
        email: f.email.trim(), legalName: f.company || null, vat: f.vat || null, role: type,
      });
      setCandidates(rows);
      setClaimState(rows.length ? "choose" : "form");
    } catch (e) {
      // Se la ricerca fallisce non si blocca la registrazione: si va al modulo.
      setCandidates([]);
      setClaimState("form");
    } finally {
      setClaimLoading(false);
    }
  }

  async function handleClaim(candidate) {
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await requestCompanyClaim(candidate.canonical_id);
      setClaimed({ ...res, legal_name: candidate.legal_name });
      setClaimState("claimed");
      set("company", candidate.legal_name);
    } catch (e) {
      const msg = String(e?.message || e);
      setClaimError(/ALREADY_CLAIMED/.test(msg)
        ? "Questa azienda è già stata rivendicata da un altro account. Scrivici e verifichiamo."
        : "Non è stato possibile completare la richiesta. Riprova o inserisci i dati a mano.");
    } finally {
      setClaiming(false);
    }
  }

  async function submitRegistration() {
    setSubmitting(true);
    setError(null);
    try {
      // Azienda rivendicata: l'anagrafica esiste gia' e il profilo e' collegato,
      // qui si completano solo fatturazione/banca/materiali seguiti.
      if (claimed?.status === "approved") {
        await completeClaimedCompany({ ...f, type });
      } else if (claimed?.status === "pending_review") {
        // Rivendicazione in attesa: NON si crea una seconda anagrafica, sarebbe
        // il doppione che il claim serve a evitare. L'account resta senza
        // azienda finche' l'admin non approva e collega quella rivendicata.
      } else {
        await registerCompany({ ...f, type });
      }
      setDone(true);
    } catch (e) {
      setError(e.message === "ALREADY_REGISTERED"
        ? "Questa email risulta già registrata."
        : "Registrazione non riuscita. Riprova.");
    } finally {
      setSubmitting(false);
    }
  }

  const emailOk = (v) => /^\S+@\S+\.\S+$/.test((v || "").trim());
  const filled = (v) => !!(v && v.trim());
  // 12 = minimo impostato su Supabase Auth (dashboard): tenere allineati,
  // altrimenti l'errore arriva dal server senza spiegazione nel form
  const step1Valid = !!type && emailOk(f.email) && f.pass.length >= 12 && f.pass === f.pass2;
  // Con azienda rivendicata i dati anagrafici li abbiamo gia': non si richiedono
  // di nuovo. Nello stato "choose" si prosegue solo scegliendo o rifiutando.
  const step2Valid = claimed
    ? true
    : claimState === "form" &&
      filled(f.company) && filled(f.vat) && filled(f.country) && filled(f.city) && filled(f.address) && filled(f.phone) && filled(f.contact);
  const step3Valid = type === "supplier" || type === "carrier"
    ? emailOk(f.emailMgmt) && emailOk(f.emailAdmin) && filled(f.ibanHolder) && filled(f.iban) && canConsent
    : emailOk(f.emailMgmt) && emailOk(f.emailAdmin) && canConsent;
  const canProceed = step === 1 ? step1Valid : step === 2 ? step2Valid : step3Valid;

  return (
    <div style={{ background:C.bg, color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing:border-box; }
        input:focus, select:focus { border-color:#0EA5E9 !important; box-shadow:0 0 0 3px rgba(14,165,233,0.12); }
        .bs-btn { background:#0369A1; color:#fff; border:none; border-radius:10px; padding:13px 22px; font-size:15px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:8px; font-family:'Inter',system-ui; transition:all 0.2s; }
        .bs-btn:hover:not(:disabled){ background:#075985; }
        .bs-btn:disabled { background:#CBD5E1; cursor:not-allowed; }
        .bs-btn-out { background:#fff; color:#475569; border:1.5px solid #E2E8F0; border-radius:10px; padding:12px 20px; font-size:15px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:8px; font-family:'Inter',system-ui; }
        .bs-btn-out:hover { border-color:#0EA5E9; color:#0EA5E9; }
        @media (max-width:680px){ .bs-grid2 { grid-template-columns:1fr !important; } .bs-typecards { grid-template-columns:1fr !important; } }
      `}</style>

      {/* NAVBAR */}
      <BulkStrikeNav />

      <div style={{ maxWidth:680, margin:"0 auto", padding:"40px 20px 60px" }}>

        {done ? (
          <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:18, padding:36, textAlign:"center" }}>
            <div style={{ width:64, height:64, borderRadius:"50%", background:"#ECFDF5", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 18px" }}>
              <Check size={32} color={C.green}/>
            </div>
            <h1 style={{ fontSize:24, fontWeight:800, marginBottom:8 }}>
              {claimed?.status === "pending_review" ? "Richiesta ricevuta" : "Registrazione inviata!"}
            </h1>
            <p style={{ fontSize:15, color:C.muted, lineHeight:1.6, marginBottom:8, maxWidth:440, marginLeft:"auto", marginRight:"auto" }}>
              {/* Azienda rivendicata: l'anagrafica esisteva già, quindi il messaggio
                  standard "attendi che attiviamo il profilo" sarebbe sbagliato — il
                  profilo è già attivo, in attesa c'è solo la pubblicazione prezzi. */}
              {claimed?.status === "approved"
                ? "Grazie. La tua azienda è già collegata all'account: puoi entrare subito e sistemare la scheda. Per pubblicare i prezzi serve la nostra verifica, di solito entro 1-2 giorni lavorativi: ti avvisiamo via email."
                : claimed?.status === "pending_review"
                ? "Grazie. Stiamo verificando a mano che l'azienda che hai indicato sia la tua: non essendo confermabile dal dominio della tua email, la controlliamo noi. Ti scriviamo appena è collegata, di solito entro 1-2 giorni lavorativi."
                : type==="supplier"
                ? "Grazie. Il team verifica la tua azienda (controllo P.IVA, sanzioni e certificazioni) entro 1-2 giorni lavorativi. Ti avviseremo via email quando il profilo sarà attivo."
                : type==="carrier"
                ? "Grazie. Il team verifica la tua azienda entro 1-2 giorni lavorativi. Nel frattempo puoi già configurare le aree che servi e le tue tariffe."
                : "Grazie. Riceverai un'email di conferma per attivare l'account e iniziare ad acquistare subito."}
            </p>
            <p style={{ fontSize:12, color:C.muted, marginBottom:24 }}>Per assistenza umana: davide@bulkstrike.com</p>
            {type==="carrier"
              ? <button className="bs-btn" onClick={() => { window.location.href = "/corriere"; }}>Configura aree e tariffe <ArrowRight size={16}/></button>
              : <button className="bs-btn-out" onClick={() => { setDone(false); setStep(1); setType(null); }}>Torna all'inizio</button>}
          </div>
        ) : (
        <>
          <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:"-0.02em", marginBottom:6, textAlign:"center" }}>Crea il tuo account</h1>
          <p style={{ fontSize:15, color:C.muted, marginBottom:28, textAlign:"center" }}>Gratuito · Nessun abbonamento · Pochi minuti</p>

          {/* STEPPER */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:0, marginBottom:28 }}>
            {steps.map((label,i) => {
              const n = i+1, active = step===n, doneStep = step>n;
              return (
                <div key={i} style={{ display:"flex", alignItems:"center" }}>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
                    <div style={{ width:30, height:30, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700,
                      background: doneStep?C.green : active?C.blue:"#fff", color:(doneStep||active)?"#fff":C.muted, border:`2px solid ${doneStep?C.green:active?C.blue:C.border}` }}>
                      {doneStep ? <Check size={15}/> : n}
                    </div>
                    <span style={{ fontSize:11, fontWeight:600, color:active?C.text:C.muted }}>{label}</span>
                  </div>
                  {i<steps.length-1 && <div style={{ width:46, height:2, background:step>n?C.green:C.border, margin:"0 6px 18px" }}/>}
                </div>
              );
            })}
          </div>

          <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:18, padding:28 }}>

            {/* STEP 1 — type + access. È avvolto in un vero <form>: senza,
                Chrome non riconosceva la coppia "nuova password / conferma" e
                compilava solo il primo campo con la password generata. */}
            {step===1 && (
              <form id="reg-step1" onSubmit={(e) => { e.preventDefault(); goToCompanyStep(); }}>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:14 }}>Che tipo di account vuoi aprire?</div>
                <div className="bs-typecards" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:24 }}>
                  {[
                    { id:"buyer", icon:<ShoppingCart size={22}/>, title:"Acquirente", desc:"Compro materie prime al miglior prezzo, da solo o in pool" },
                    { id:"supplier", icon:<Factory size={22}/>, title:"Fornitore", desc:"Vendo materie prime sfuse e ricevo richieste qualificate" },
                    { id:"carrier", icon:<Truck size={22}/>, title:"Corriere", desc:"Offro spedizioni per gli ordini della piattaforma, imposto le mie tariffe" },
                  ].map(c => (
                    <button key={c.id} type="button" onClick={() => setType(c.id)}
                      style={{ textAlign:"left", padding:18, borderRadius:14, cursor:"pointer", background:type===c.id?"#EFF6FF":"#fff", border:`2px solid ${type===c.id?C.blue:C.border}`, fontFamily:"Inter,system-ui", transition:"all 0.15s" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                        <div style={{ width:44, height:44, borderRadius:11, background:type===c.id?C.blue:"#F1F5F9", color:type===c.id?"#fff":C.muted, display:"flex", alignItems:"center", justifyContent:"center" }}>{c.icon}</div>
                        {type===c.id && <div style={{ width:22, height:22, borderRadius:"50%", background:C.blue, display:"flex", alignItems:"center", justifyContent:"center" }}><Check size={13} color="#fff"/></div>}
                      </div>
                      <div style={{ fontSize:16, fontWeight:700, marginBottom:3 }}>{c.title}</div>
                      <div style={{ fontSize:13, color:C.muted, lineHeight:1.5 }}>{c.desc}</div>
                    </button>
                  ))}
                </div>

                <div style={{ opacity:type?1:0.4, pointerEvents:type?"auto":"none", transition:"opacity 0.2s" }}>
                  <div style={{ fontSize:15, fontWeight:700, marginBottom:14 }}>Dati di accesso</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }} className="bs-grid2">
                    <Field icon={<Mail size={14} color={C.muted}/>} label="Email aziendale" required>
                      <input style={inputStyle} type="email" name="email" id="reg-email" autoComplete="email" placeholder="nome@azienda.it" value={f.email} onChange={e=>set("email",e.target.value)}/>
                    </Field>
                    <Field icon={<Lock size={14} color={C.muted}/>} label="Password" required half>
                      <div style={{ position:"relative" }}>
                        <input style={{ ...inputStyle, paddingRight:40 }} type={showPass ? "text" : "password"} name="new-password" id="reg-password" autoComplete="new-password" placeholder="Almeno 12 caratteri" value={f.pass} onChange={e=>set("pass",e.target.value)}/>
                        <button type="button" onClick={()=>setShowPass(v=>!v)} aria-label={showPass ? "Nascondi password" : "Mostra password"}
                          style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", padding:0, cursor:"pointer", color:C.muted, display:"flex" }}>
                          {showPass ? <EyeOff size={17}/> : <Eye size={17}/>}
                        </button>
                      </div>
                    </Field>
                    <Field icon={<Lock size={14} color={C.muted}/>} label="Conferma password" required half>
                      <div style={{ position:"relative" }}>
                        <input style={{ ...inputStyle, paddingRight:40 }} type={showPass2 ? "text" : "password"} name="confirm-new-password" id="reg-password-confirm" autoComplete="new-password" placeholder="Ripeti la password" value={f.pass2} onChange={e=>set("pass2",e.target.value)}/>
                        <button type="button" onClick={()=>setShowPass2(v=>!v)} aria-label={showPass2 ? "Nascondi password" : "Mostra password"}
                          style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", padding:0, cursor:"pointer", color:C.muted, display:"flex" }}>
                          {showPass2 ? <EyeOff size={17}/> : <Eye size={17}/>}
                        </button>
                      </div>
                    </Field>
                  </div>

                  {/* Requisiti password — checklist live, allineata alla policy REALE
                      di Supabase Auth (solo lunghezza minima 12, nessuna classe di
                      caratteri obbligatoria): l'utente sa se la password va bene PRIMA
                      del submit, incluse quelle generate dai password manager. */}
                  <div style={{ marginTop:2, display:"flex", flexDirection:"column", gap:6 }}>
                    {[
                      { label: "Almeno 12 caratteri", ok: f.pass.length >= 12 },
                      { label: "Le due password coincidono", ok: f.pass.length > 0 && f.pass === f.pass2 },
                    ].map((r,i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12.5, color: r.ok ? C.green : C.muted }}>
                        {r.ok ? <Check size={14} color={C.green}/> : <X size={13} color={C.muted}/>}
                        <span>{r.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Errore reale del signup (es. email già registrata): reso
                    visibile QUI nello step 1 — prima veniva impostato ma mai
                    mostrato, così "Continua" sembrava non fare nulla. */}
                {error && (
                  <div style={{ fontSize:13, color:C.red, marginTop:16 }}>
                    {error}
                    {error === EMAIL_TAKEN_MSG && <> <a href="/auth/login" style={{ color:C.blue, fontWeight:700, textDecoration:"underline" }}>Accedi</a></>}
                  </div>
                )}
              </form>
            )}

            {/* STEP 2 — company. Se la nostra ricerca di mercato ha gia' censito
                l'azienda, prima si offre di prenderne il controllo; il modulo
                manuale resta sempre raggiungibile e allo stesso livello. */}
            {step===2 && claimState === "claimed" && (
              <div style={{ border:`1px solid ${C.border}`, borderRadius:12, padding:"18px 20px", background:"#F0FDF4" }}>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>
                  {claimed?.status === "approved" ? "Azienda collegata" : "Richiesta inviata"}
                </div>
                <div style={{ fontSize:13.5, color:C.muted, lineHeight:1.6 }}>
                  {claimed?.status === "approved" ? (
                    <>
                      <b style={{ color:C.text }}>{claimed?.legal_name}</b> è ora collegata al tuo account: il dominio
                      della tua email corrisponde a quello aziendale. Nell'ultimo passaggio completi fatturazione e
                      pagamenti. Per pubblicare i prezzi serve la nostra verifica: ti scriviamo noi, di solito entro un
                      giorno lavorativo.
                    </>
                  ) : (
                    <>
                      Abbiamo ricevuto la richiesta per <b style={{ color:C.text }}>{claimed?.legal_name}</b>. Non
                      potendo confermarla dal dominio della tua email, la controlliamo a mano prima di collegarla:
                      ti avvisiamo appena è fatto. Intanto puoi completare la registrazione.
                    </>
                  )}
                </div>
              </div>
            )}

            {step===2 && claimState === "choose" && (
              <ClaimStep
                loading={claimLoading}
                candidates={candidates}
                error={claimError}
                onClaim={handleClaim}
                onSkip={() => setClaimState("form")}
                busy={claiming}
              />
            )}

            {step===2 && claimState === "form" && (
              <>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:16 }}>Dati dell'azienda</div>
                {candidates.length > 0 && (
                  <button onClick={() => setClaimState("choose")} className="bs-linklike"
                    style={{ background:"none", border:"none", color:C.blue, fontSize:13, fontWeight:600, cursor:"pointer", padding:0, marginBottom:14 }}>
                    ← Torna alle aziende che abbiamo trovato
                  </button>
                )}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }} className="bs-grid2">
                  <Field icon={<Building2 size={14} color={C.muted}/>} label="Ragione sociale" required>
                    <input style={inputStyle} placeholder="Es. Cantina Rossi S.r.l." value={f.company} onChange={e=>set("company",e.target.value)}/>
                  </Field>
                  <Field icon={<Building2 size={14} color={C.muted}/>} label="P.IVA / VAT" required half>
                    <input style={inputStyle} placeholder="IT01234567890" value={f.vat} onChange={e=>set("vat",e.target.value)}/>
                  </Field>
                  <Field icon={<Globe size={14} color={C.muted}/>} label="Paese" required half>
                    <select style={inputStyle} value={f.country} onChange={e=>set("country",e.target.value)}>
                      {COUNTRIES.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field icon={<MapPin size={14} color={C.muted}/>} label="Città" required half>
                    <input style={inputStyle} placeholder="Città" value={f.city} onChange={e=>set("city",e.target.value)}/>
                  </Field>
                  <Field icon={<MapPin size={14} color={C.muted}/>} label="Indirizzo" required half>
                    <input style={inputStyle} placeholder="Via e numero, CAP" value={f.address} onChange={e=>set("address",e.target.value)}/>
                  </Field>
                  <Field icon={<Phone size={14} color={C.muted}/>} label="Telefono" required half>
                    <input style={inputStyle} placeholder="+39 ..." value={f.phone} onChange={e=>set("phone",e.target.value)}/>
                  </Field>
                  <Field icon={<Globe size={14} color={C.muted}/>} label="Sito web" half>
                    <input style={inputStyle} placeholder="www.azienda.it" value={f.website} onChange={e=>set("website",e.target.value)}/>
                  </Field>
                  <Field icon={<User size={14} color={C.muted}/>} label="Persona di riferimento" required>
                    <input style={inputStyle} placeholder="Nome e cognome" value={f.contact} onChange={e=>set("contact",e.target.value)}/>
                  </Field>
                </div>
              </>
            )}

            {/* STEP 3 — type specific + consents */}
            {step===3 && type==="buyer" && (
              <>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:16 }}>Le tue esigenze d'acquisto</div>
                <MaterialsPicker type="buyer" f={f} set={set}/>
                <Field icon={<Boxes size={14} color={C.muted}/>} label="Volume annuo indicativo" half>
                  <select style={inputStyle} value={f.volume} onChange={e=>set("volume",e.target.value)}>
                    <option value="">Seleziona...</option><option>&lt; 1 tonnellata</option><option>1 - 10 t</option><option>10 - 50 t</option><option>&gt; 50 t</option>
                  </select>
                </Field>
                <Field icon={<MapPin size={14} color={C.muted}/>} label="Indirizzo di consegna (se diverso dalla sede)">
                  <input style={inputStyle} placeholder="Lascia vuoto se coincide con la sede" value={f.deliveryAddr} onChange={e=>set("deliveryAddr",e.target.value)}/>
                </Field>

                <div style={{ fontSize:15, fontWeight:700, margin:"24px 0 4px" }}>Contatti e fatturazione</div>
                <div style={{ fontSize:12.5, color:C.muted, marginBottom:16 }}>Dove inviamo le comunicazioni operative e i documenti fiscali</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }} className="bs-grid2">
                  <Field icon={<Mail size={14} color={C.muted}/>} label="Email gestione acquisti" required half>
                    <input style={inputStyle} type="email" placeholder="acquisti@azienda.it" value={f.emailMgmt} onChange={e=>set("emailMgmt",e.target.value)}/>
                  </Field>
                  <Field icon={<Mail size={14} color={C.muted}/>} label="Email amministrazione (documenti)" required half>
                    <input style={inputStyle} type="email" placeholder="amministrazione@azienda.it" value={f.emailAdmin} onChange={e=>set("emailAdmin",e.target.value)}/>
                  </Field>
                  <Field icon={<Shield size={14} color={C.muted}/>} label="PEC" half>
                    <input style={inputStyle} type="email" placeholder="azienda@pec.it" value={f.pec} onChange={e=>set("pec",e.target.value)}/>
                  </Field>
                  <Field icon={<Building2 size={14} color={C.muted}/>} label="Codice Destinatario (SDI)" half>
                    <input style={inputStyle} placeholder="Es. USAL8PV" maxLength={7} value={f.sdi} onChange={e=>set("sdi",e.target.value.toUpperCase())}/>
                  </Field>
                </div>
                <div style={{ background:"#EFF6FF", border:`1px solid #BFDBFE`, borderRadius:9, padding:"10px 12px", marginBottom:4, fontSize:12, color:"#1D4ED8", display:"flex", gap:8 }}>
                  <Boxes size={16} color={C.blue} style={{ flexShrink:0 }}/>
                  <span>Per la fatturazione elettronica in Italia è necessario almeno uno tra <b>PEC</b> e <b>Codice Destinatario (SDI)</b>. Le fatture verranno recapitate lì.</span>
                </div>

                <Consents f={f} set={set}/>
              </>
            )}

            {step===3 && type==="supplier" && (
              <>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:16 }}>Il tuo catalogo</div>
                <MaterialsPicker type="supplier" f={f} set={set}/>
                <Field icon={<Award size={14} color={C.muted}/>} label="Certificazioni">
                  <ChipSelect options={CERTS} selected={f.certs} onToggle={v=>toggle("certs",v)}/>
                </Field>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }} className="bs-grid2">
                  <Field icon={<Factory size={14} color={C.muted}/>} label="Capacità produttiva / mese" half>
                    <input style={inputStyle} placeholder="Es. 50 tonnellate" value={f.capacity} onChange={e=>set("capacity",e.target.value)}/>
                  </Field>
                  <Field icon={<Globe size={14} color={C.muted}/>} label="Tipo" half>
                    <select style={inputStyle} value={f.bulk?"Produttore":"Distributore"} onChange={e=>set("bulk",e.target.value==="Produttore")}>
                      <option>Produttore</option><option>Distributore</option>
                    </select>
                  </Field>
                </div>
                <Field icon={<Globe size={14} color={C.muted}/>} label="Paesi serviti">
                  <ChipSelect options={["Italia","UE","Extra-UE","Mondo"]} selected={f.served} onToggle={v=>toggle("served",v)}/>
                </Field>

                <div style={{ fontSize:15, fontWeight:700, margin:"24px 0 4px" }}>Contatti e fatturazione</div>
                <div style={{ fontSize:12.5, color:C.muted, marginBottom:16 }}>Dove ricevi le richieste dei clienti e dove gestisci i documenti fiscali</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }} className="bs-grid2">
                  <Field icon={<Mail size={14} color={C.muted}/>} label="Email gestione clienti / ordini" required half>
                    <input style={inputStyle} type="email" placeholder="ordini@azienda.it" value={f.emailMgmt} onChange={e=>set("emailMgmt",e.target.value)}/>
                  </Field>
                  <Field icon={<Mail size={14} color={C.muted}/>} label="Email amministrazione (documenti)" required half>
                    <input style={inputStyle} type="email" placeholder="amministrazione@azienda.it" value={f.emailAdmin} onChange={e=>set("emailAdmin",e.target.value)}/>
                  </Field>
                  <Field icon={<Shield size={14} color={C.muted}/>} label="PEC" half>
                    <input style={inputStyle} type="email" placeholder="azienda@pec.it" value={f.pec} onChange={e=>set("pec",e.target.value)}/>
                  </Field>
                  <Field icon={<Building2 size={14} color={C.muted}/>} label="Codice Destinatario (SDI)" half>
                    <input style={inputStyle} placeholder="Es. USAL8PV" maxLength={7} value={f.sdi} onChange={e=>set("sdi",e.target.value.toUpperCase())}/>
                  </Field>
                </div>
                <div style={{ background:"#EFF6FF", border:`1px solid #BFDBFE`, borderRadius:9, padding:"10px 12px", marginBottom:20, fontSize:12, color:"#1D4ED8", display:"flex", gap:8 }}>
                  <Boxes size={16} color={C.blue} style={{ flexShrink:0 }}/>
                  <span>Per la fatturazione elettronica in Italia è necessario almeno uno tra <b>PEC</b> e <b>Codice Destinatario (SDI)</b>.</span>
                </div>

                <div style={{ fontSize:15, fontWeight:700, margin:"4px 0 4px" }}>Coordinate bancarie (per gli incassi)</div>
                <div style={{ fontSize:12.5, color:C.muted, marginBottom:16 }}>Su queste coordinate ricevi i pagamenti, rilasciati dall'escrow dopo la conferma di consegna</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }} className="bs-grid2">
                  <Field icon={<User size={14} color={C.muted}/>} label="Intestatario del conto" required>
                    <input style={inputStyle} placeholder="Ragione sociale intestataria" value={f.ibanHolder} onChange={e=>set("ibanHolder",e.target.value)}/>
                  </Field>
                  <Field icon={<Building2 size={14} color={C.muted}/>} label="IBAN" required half>
                    <input style={inputStyle} placeholder="IT.. .. .... .... .... .... ...." value={f.iban} onChange={e=>set("iban",e.target.value.toUpperCase())}/>
                  </Field>
                  <Field icon={<Globe size={14} color={C.muted}/>} label="BIC / SWIFT (per incassi esteri)" half>
                    <input style={inputStyle} placeholder="Es. BCITITMM" value={f.bic} onChange={e=>set("bic",e.target.value.toUpperCase())}/>
                  </Field>
                </div>
                <div style={{ background:"#ECFDF5", border:`1px solid ${C.green}44`, borderRadius:9, padding:"10px 12px", marginBottom:20, fontSize:12, color:"#065F46", display:"flex", gap:8 }}>
                  <Shield size={16} color={C.green} style={{ flexShrink:0 }}/>
                  <span>Le coordinate viaggiano cifrate. La verifica finale e i pagamenti avvengono tramite il nostro <b>provider di pagamenti certificato</b> (conti segregati): BulkStrike non trattiene i tuoi fondi.</span>
                </div>

                <div style={{ background:"#FFF7ED", border:`1px solid ${C.amber}44`, borderRadius:10, padding:"12px 14px", marginBottom:16, fontSize:12.5, color:"#7C2D12", display:"flex", gap:9 }}>
                  <Shield size={26} color={C.amber} style={{ flexShrink:0 }}/>
                  <span>Dopo l'invio, il team verifica la tua azienda (P.IVA, screening sanzioni/AML, certificazioni) prima di attivare il profilo.</span>
                </div>
                <Consents f={f} set={set} supplier/>
              </>
            )}

            {step===3 && type==="carrier" && (
              <>
                <div style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:10, padding:"12px 14px", marginBottom:20, fontSize:12.5, color:"#1D4ED8", display:"flex", gap:9 }}>
                  <Truck size={18} color={C.blue} style={{ flexShrink:0 }}/>
                  <span>Le aree che servi e le tue tariffe di spedizione si impostano dopo, nella pagina <b>Corrieri</b> — qui servono solo i dati per fatturazione e incassi.</span>
                </div>

                <div style={{ fontSize:15, fontWeight:700, margin:"4px 0 4px" }}>Contatti e fatturazione</div>
                <div style={{ fontSize:12.5, color:C.muted, marginBottom:16 }}>Dove ricevi comunicazioni operative e documenti fiscali</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }} className="bs-grid2">
                  <Field icon={<Mail size={14} color={C.muted}/>} label="Email gestione spedizioni" required half>
                    <input style={inputStyle} type="email" placeholder="spedizioni@azienda.it" value={f.emailMgmt} onChange={e=>set("emailMgmt",e.target.value)}/>
                  </Field>
                  <Field icon={<Mail size={14} color={C.muted}/>} label="Email amministrazione (documenti)" required half>
                    <input style={inputStyle} type="email" placeholder="amministrazione@azienda.it" value={f.emailAdmin} onChange={e=>set("emailAdmin",e.target.value)}/>
                  </Field>
                  <Field icon={<Shield size={14} color={C.muted}/>} label="PEC" half>
                    <input style={inputStyle} type="email" placeholder="azienda@pec.it" value={f.pec} onChange={e=>set("pec",e.target.value)}/>
                  </Field>
                  <Field icon={<Building2 size={14} color={C.muted}/>} label="Codice Destinatario (SDI)" half>
                    <input style={inputStyle} placeholder="Es. USAL8PV" maxLength={7} value={f.sdi} onChange={e=>set("sdi",e.target.value.toUpperCase())}/>
                  </Field>
                </div>

                <div style={{ fontSize:15, fontWeight:700, margin:"20px 0 4px" }}>Coordinate bancarie (per gli incassi)</div>
                <div style={{ fontSize:12.5, color:C.muted, marginBottom:16 }}>Su queste coordinate ricevi i pagamenti per le spedizioni effettuate</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 16px" }} className="bs-grid2">
                  <Field icon={<User size={14} color={C.muted}/>} label="Intestatario del conto" required>
                    <input style={inputStyle} placeholder="Ragione sociale intestataria" value={f.ibanHolder} onChange={e=>set("ibanHolder",e.target.value)}/>
                  </Field>
                  <Field icon={<Building2 size={14} color={C.muted}/>} label="IBAN" required half>
                    <input style={inputStyle} placeholder="IT.. .. .... .... .... .... ...." value={f.iban} onChange={e=>set("iban",e.target.value.toUpperCase())}/>
                  </Field>
                  <Field icon={<Globe size={14} color={C.muted}/>} label="BIC / SWIFT (per incassi esteri)" half>
                    <input style={inputStyle} placeholder="Es. BCITITMM" value={f.bic} onChange={e=>set("bic",e.target.value.toUpperCase())}/>
                  </Field>
                </div>
                <div style={{ background:"#ECFDF5", border:`1px solid ${C.green}44`, borderRadius:9, padding:"10px 12px", marginBottom:20, fontSize:12, color:"#065F46", display:"flex", gap:8 }}>
                  <Shield size={16} color={C.green} style={{ flexShrink:0 }}/>
                  <span>Le coordinate viaggiano cifrate. La verifica finale e i pagamenti avvengono tramite il nostro <b>provider di pagamenti certificato</b> (conti segregati): BulkStrike non trattiene i tuoi fondi.</span>
                </div>

                <div style={{ background:"#FFF7ED", border:`1px solid ${C.amber}44`, borderRadius:10, padding:"12px 14px", marginBottom:16, fontSize:12.5, color:"#7C2D12", display:"flex", gap:9 }}>
                  <Shield size={26} color={C.amber} style={{ flexShrink:0 }}/>
                  <span>Dopo l'invio, il team verifica la tua azienda (P.IVA, screening sanzioni/AML) prima di renderti visibile ai clienti nei preventivi di spedizione.</span>
                </div>
                <Consents f={f} set={set} supplier/>
              </>
            )}
            {/* NAV BUTTONS */}
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:24, gap:12 }}>
              {step>1
                ? <button className="bs-btn-out" onClick={()=>setStep(step-1)}><ArrowLeft size={16}/> Indietro</button>
                : <span/>}
              {step<3
                ? <button className="bs-btn" disabled={!canProceed}
                    type={step===1 ? "submit" : "button"} form={step===1 ? "reg-step1" : undefined}
                    onClick={step===1 ? undefined : ()=> setStep(step+1)}>Continua <ArrowRight size={16}/></button>
                : <button className="bs-btn" disabled={!canProceed || submitting} onClick={submitRegistration}>{submitting ? "Invio in corso…" : <>Completa registrazione <Check size={16}/></>}</button>}
            </div>
            {!canProceed && <p style={{ fontSize:12, color:C.muted, textAlign:"right", marginTop:8 }}>Compila i campi obbligatori <span style={{ color:C.blue }}>*</span> per continuare.</p>}
          </div>

          <p style={{ fontSize:12, color:C.muted, textAlign:"center", marginTop:16 }}>
            Registrandoti accetti i Termini e l'Informativa Privacy di BulkStrike.
          </p>
        </>
        )}
      </div>
    </div>
  );
}

function Consents({ f, set, supplier }) {
  const C2 = C;
  const row = (k, node) => (
    <label style={{ display:"flex", gap:10, alignItems:"flex-start", cursor:"pointer", marginBottom:10 }}>
      <input type="checkbox" checked={f[k]} onChange={e=>set(k,e.target.checked)} style={{ marginTop:2, width:16, height:16, accentColor:C2.blue, flexShrink:0 }}/>
      <span style={{ fontSize:12.5, color:C2.muted, lineHeight:1.5 }}>{node}</span>
    </label>
  );
  return (
    <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:18, marginTop:4 }}>
      <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>Consensi</div>
      {row("terms", <>Accetto i <b style={{color:C.text}}>Termini e Condizioni</b> di BulkStrike. <span style={{color:C.blue}}>*</span></>)}
      {row("privacy", <>Ho letto l'<b style={{color:C.text}}>Informativa Privacy</b> (GDPR) e acconsento al trattamento dei dati. <span style={{color:C.blue}}>*</span></>)}
      {row("ai", <>Sono consapevole che BulkStrike usa <b style={{color:C.text}}>assistenti basati su intelligenza artificiale</b> per l'assistenza e la corrispondenza, e che posso sempre richiedere un contatto umano. <span style={{color:C.blue}}>*</span></>)}
    </div>
  );
}
