"use client";
// BulkStrikeCarrierProfile — dashboard self-service corrieri (/corriere).
// Un corriere è un'azienda come le altre (stesso account, stesso KYC) che attiva il ruolo
// "corriere". Una tariffa = una riga completa (nazione, regioni, giorni di consegna,
// fascia di peso, prezzo): aggiungerla dichiara automaticamente anche la copertura di
// quell'area, niente più passaggio "Aggiungi area" separato. Le tariffe accessorie
// (collettame, contrassegno, servizio al piano...) sono voci di costo a parte, legate
// al servizio richiesto e non alla distanza/regione.
// NB: il calcolo automatico dei preventivi per i corrieri "a distanza" arriva in un prossimo
// giro (richiede geocodifica indirizzi) — oggi solo i corrieri "a zona" generano preventivi.
import { useState, useEffect, useRef } from "react";
import { Truck, MapPin, Plus, Trash2, Copy, ChevronRight, ShieldCheck, Clock, AlertTriangle, Info, Upload, FileText, Check, LogOut, Package } from "lucide-react";
import { getSession, getMyCarrierProfile, upsertCarrierProfile, upsertCarrierRate, deleteCarrierRate, upsertCarrierServiceFee, deleteCarrierServiceFee, parseCarrierPriceListPdf, poolErrorMessage } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";

const C = { blue: "#0EA5E9", dark: "#0284C7", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", amber: "#D97706", purple: "#7C3AED" };
const eur = (n) => n == null ? "—" : "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EU =["Francia", "Germania", "Spagna", "Polonia", "Paesi Bassi", "Portogallo", "Belgio", "Austria"];
const REGIONI_IT = ["Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche", "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana", "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto"];
const COUNTRIES = ["Italia", ...EU, "Altro extra-UE"];

// Servizi accessori suggeriti — il corriere può usarli come base e modificare il
// prezzo, o aggiungerne di suoi. is_automatic: si applica da sola alla condizione
// indicata, senza che il cliente la scelga (es. collettame su spedizioni consolidate).
const SUGGESTED_SERVICES = [
  { name: "Collettame (consolidamento multi-cliente da pool)", isAutomatic: true, hint: "Si applica in automatico quando la spedizione consolida più clienti dello stesso pool." },
  { name: "Contrassegno", isAutomatic: false, hint: "Incasso alla consegna per conto del fornitore." },
  { name: "Servizio al piano", isAutomatic: false, hint: "Consegna oltre il marciapiede/portone, fino al piano indicato." },
  { name: "Preavviso di consegna", isAutomatic: false, hint: "Il cliente viene contattato prima del passaggio per fissare l'orario." },
  { name: "Secondo tentativo di consegna", isAutomatic: false, hint: "Nuovo passaggio se il cliente era assente al primo." },
  { name: "Sponda idraulica", isAutomatic: false, hint: "Mezzo con sponda per scarico merce pesante senza banchina." },
  { name: "Consegna sabato", isAutomatic: false, hint: "Passaggio anche di sabato." },
  { name: "Facchinaggio", isAutomatic: false, hint: "Movimentazione manuale della merce oltre lo scarico standard." },
];

const emptyRate = { id: null, zoneArea: "Italia", regions: [], leadTimeDays: "", weightMinKg: "0", weightMaxKg: "", baseFee: "", perKgFee: "", distanceMinKm: "", distanceMaxKm: "", perKmFee: "0" };
const rowFromServer = (r) => ({
  id: r.id, zoneArea: r.zone_area || "Italia", regions: r.regions || [],
  leadTimeDays: r.lead_time_days ?? "", weightMinKg: String(r.weight_min_kg ?? 0), weightMaxKg: r.weight_max_kg == null ? "" : String(r.weight_max_kg),
  baseFee: String(r.base_fee ?? 0), perKgFee: String(r.per_kg_fee ?? 0),
  distanceMinKm: r.distance_min_km ?? "", distanceMaxKm: r.distance_max_km ?? "", perKmFee: String(r.per_km_fee ?? 0),
});
const rowFromImport = (r) => ({
  id: null, zoneArea: r.zone_area || "Italia", regions: r.regions || [],
  leadTimeDays: r.lead_time_days ?? "", weightMinKg: String(r.weight_min_kg ?? 0), weightMaxKg: r.weight_max_kg == null ? "" : String(r.weight_max_kg),
  baseFee: String(r.base_fee ?? 0), perKgFee: String(r.per_kg_fee ?? 0), distanceMinKm: "", distanceMaxKm: "", perKmFee: "0",
});

function RegionPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const toggle = (r) => onChange(value.includes(r) ? value.filter(x => x !== r) : [...value, r]);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} type="button" style={{ width: "100%", textAlign: "left", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", fontSize: 13, cursor: "pointer", fontFamily: "Inter,system-ui", color: value.length ? C.text : C.muted }}>
        {value.length ? `${value.length} regione/i` : "Tutta la nazione"}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 20, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 10px 30px rgba(0,0,0,0.12)", padding: 10, width: 220, maxHeight: 240, overflowY: "auto" }}>
          {REGIONI_IT.map(r => (
            <label key={r} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 2px", fontSize: 12.5, cursor: "pointer" }}>
              <input type="checkbox" checked={value.includes(r)} onChange={() => toggle(r)} />
              {r}
            </label>
          ))}
          <button onClick={() => setOpen(false)} style={{ marginTop: 6, width: "100%", background: "#0369A1", color: "#fff", border: "none", borderRadius: 6, padding: "6px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>Fatto</button>
        </div>
      )}
    </div>
  );
}

export default function CarrierProfilePage({ inShell = false }) {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [profile, setProfile] = useState(null);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [pricingMode, setPricingMode] = useState("zone");

  const [rateForm, setRateForm] = useState(emptyRate);
  const [rateBusy, setRateBusy] = useState(false);

  const [serviceForm, setServiceForm] = useState({ id: null, selectedOption: "", customName: "", fee: "" });
  const [serviceBusy, setServiceBusy] = useState(false);

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState("");
  const [pdfDraftRows, setPdfDraftRows] = useState([]); // tariffe importate, da rivedere prima di salvarle davvero
  const fileInputRef = useRef(null);

  async function reload() {
    try { setProfile(await getMyCarrierProfile()); } catch (e) { setErr(poolErrorMessage(e)); }
  }

  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      await reload();
      setLoading(false);
    })();
  }, []);

  async function activate() {
    setSaving(true); setErr("");
    try { await upsertCarrierProfile(pricingMode, null); await reload(); } // i giorni di consegna si impostano per tariffa, non qui
    catch (e) { setErr(poolErrorMessage(e)); }
    finally { setSaving(false); }
  }

  async function changeMode(mode) {
    setSaving(true); setErr("");
    try { await upsertCarrierProfile(mode, null); await reload(); }
    catch (e) { setErr(poolErrorMessage(e)); }
    finally { setSaving(false); }
  }

  async function addRate() {
    if (!rateForm.zoneArea) { setErr("Seleziona la nazione."); return; }
    if (rateForm.baseFee === "" && rateForm.perKgFee === "") { setErr("Inserisci almeno la tariffa base o €/kg."); return; }
    setRateBusy(true); setErr("");
    try {
      await upsertCarrierRate({
        id: rateForm.id,
        zoneArea: rateForm.zoneArea,
        regions: rateForm.regions,
        distanceMinKm: pricingMode === "distance" && rateForm.distanceMinKm !== "" ? Number(rateForm.distanceMinKm) : null,
        distanceMaxKm: pricingMode === "distance" && rateForm.distanceMaxKm !== "" ? Number(rateForm.distanceMaxKm) : null,
        weightMinKg: Number(rateForm.weightMinKg) || 0,
        weightMaxKg: rateForm.weightMaxKg !== "" ? Number(rateForm.weightMaxKg) : null,
        baseFee: Number(rateForm.baseFee) || 0,
        perKmFee: pricingMode === "distance" ? (Number(rateForm.perKmFee) || 0) : 0,
        perKgFee: Number(rateForm.perKgFee) || 0,
        leadTimeDays: rateForm.leadTimeDays !== "" ? parseInt(rateForm.leadTimeDays, 10) : null,
      });
      setRateForm(emptyRate);
      await reload();
      setOkMsg("Tariffa salvata.");
    } catch (e) { setErr(poolErrorMessage(e)); }
    finally { setRateBusy(false); }
  }

  function duplicateRate(r) {
    setRateForm({ ...rowFromServer(r), id: null });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeRate(id) {
    try { await deleteCarrierRate(id); await reload(); } catch (e) { setErr(poolErrorMessage(e)); }
  }

  async function addServiceFee() {
    const isCustom = serviceForm.selectedOption === "__custom__";
    const name = isCustom ? serviceForm.customName.trim() : serviceForm.selectedOption;
    if (!name) { setErr("Seleziona o inserisci il nome del servizio."); return; }
    const preset = SUGGESTED_SERVICES.find(s => s.name === serviceForm.selectedOption);
    const isAutomatic = preset ? preset.isAutomatic : /collettame/i.test(name);
    const fee = serviceForm.fee === "" ? 0 : Number(serviceForm.fee);
    setServiceBusy(true); setErr("");
    try {
      await upsertCarrierServiceFee({ id: serviceForm.id, serviceName: name, fee, isAutomatic });
      setServiceForm({ id: null, selectedOption: "", customName: "", fee: "" });
      await reload();
    } catch (e) { setErr(poolErrorMessage(e)); }
    finally { setServiceBusy(false); }
  }

  async function removeServiceFee(id) {
    try { await deleteCarrierServiceFee(id); await reload(); } catch (e) { setErr(poolErrorMessage(e)); }
  }

  function handlePickPdf() { fileInputRef.current?.click(); }

  async function handlePdfSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfErr(""); setPdfBusy(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const imported = await parseCarrierPriceListPdf(base64);
      if (!imported.length) { setPdfErr("Non ho trovato tariffe leggibili in questo PDF. Provane un altro o inseriscile a mano."); return; }
      setPdfDraftRows(imported.map(rowFromImport));
      setOkMsg(`${imported.length} tariffa/e letta/e dal PDF. Controllale con attenzione qui sotto prima di salvarle.`);
    } catch (e) {
      setPdfErr("Non sono riuscito a leggere questo PDF. Verifica che sia un listino leggibile e riprova.");
    } finally {
      setPdfBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function saveDraftRow(idx) {
    const r = pdfDraftRows[idx];
    setErr("");
    try {
      await upsertCarrierRate({
        id: null, zoneArea: r.zoneArea, regions: r.regions,
        weightMinKg: Number(r.weightMinKg) || 0, weightMaxKg: r.weightMaxKg !== "" ? Number(r.weightMaxKg) : null,
        baseFee: Number(r.baseFee) || 0, perKgFee: Number(r.perKgFee) || 0,
        leadTimeDays: r.leadTimeDays !== "" ? parseInt(r.leadTimeDays, 10) : null,
      });
      setPdfDraftRows(prev => prev.filter((_, i) => i !== idx));
      await reload();
    } catch (e) { setErr(poolErrorMessage(e)); }
  }

  function updateDraftRow(idx, patch) {
    setPdfDraftRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }
  function discardDraftRow(idx) {
    setPdfDraftRows(prev => prev.filter((_, i) => i !== idx));
  }

  function handleExit() { window.location.href = "/dashboard"; }

  const inputStyle = { width: "100%", padding: "9px 11px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13.5, outline: "none", fontFamily: "Inter,system-ui", background: "#fff", color: C.text };
  const labelStyle = { fontSize: 11.5, fontWeight: 600, color: C.muted, display: "block", height: 28, lineHeight: "14px", marginBottom: 5, overflow: "hidden" };

  return (
    <div style={{ background: "#fff", color: C.text, fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh", colorScheme: "light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .cp-num { font-family:'JetBrains Mono',monospace; }
        .cp-card { border:1px solid ${C.border}; border-radius:14px; padding:20px; margin-bottom:18px; }
        .cp-rate-row { display:grid; grid-template-columns:1fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr auto; gap:10px; align-items:center; padding:10px 0; border-bottom:1px solid ${C.border}; font-size:13px; }
        .cp-btn { background:${C.blue}; color:#fff; border:none; border-radius:9px; padding:11px 20px; font-size:14px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:7px; font-family:'Inter',system-ui; }
        .cp-btn:disabled { opacity:0.5; cursor:default; }
        .cp-btn-out { background:transparent; color:${C.muted}; border:1px solid ${C.border}; border-radius:9px; padding:11px 18px; font-size:14px; font-weight:600; cursor:pointer; font-family:'Inter',system-ui; }
        @media (max-width:820px) { .cp-rate-row { grid-template-columns:1fr 1fr; } }
      `}</style>

      {!inShell && <BulkStrikeNav />}

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "22px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginBottom: 18 }}>
          <span onClick={() => { window.location.href = "/dashboard"; }} style={{ cursor: "pointer" }}>Profilo</span><ChevronRight size={13} />
          <span style={{ color: C.text, fontWeight: 600 }}>Listino servizi</span>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <Truck size={24} color={C.blue} /> Listino servizi
        </h1>

        {err && <div style={{ marginBottom: 18, padding: "11px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13, color: C.red }}>{err}</div>}
        {okMsg && <div style={{ marginBottom: 18, padding: "11px 14px", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 10, fontSize: 13, color: C.green }}>{okMsg}</div>}

        {loading ? (
          <div style={{ padding: "50px 0", textAlign: "center", color: C.muted }}>Caricamento…</div>
        ) : needLogin ? (
          <div style={{ padding: "40px 20px", textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Accedi per registrarti come corriere</div>
            <button onClick={() => { window.location.href = "/login"; }} style={{ background: "#0369A1", color: "#fff", border: "none", borderRadius: 9, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>Accedi</button>
          </div>
        ) : !profile?.is_carrier ? (
          <div className="cp-card">
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Diventa corriere su BulkStrike</div>
            <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.6, marginBottom: 18 }}>Attiva il ruolo corriere sul tuo account: imposti le tue tariffe e le aree che servi, e i clienti ti vedranno tra le opzioni di spedizione disponibili sulle tratte che copri.</p>

            <div style={{ marginBottom: 18 }}>
              <span style={labelStyle}>Come calcoli le tue tariffe?</span>
              <div style={{ display: "flex", gap: 10 }}>
                {[["zone", "Per zona geografica", "Tariffe per paese/regione — semplice, nessun indirizzo da geocodificare"], ["distance", "Per distanza reale", "Tariffe per fascia di km — più precise, calcolo automatico dei preventivi in arrivo a breve"]].map(([val, label, desc]) => (
                  <div key={val} onClick={() => setPricingMode(val)} style={{ flex: 1, cursor: "pointer", border: `2px solid ${pricingMode === val ? C.blue : C.border}`, background: pricingMode === val ? "#EFF6FF" : "#fff", borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={activate} disabled={saving} style={{ background: "#0369A1", color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1, fontFamily: "Inter,system-ui" }}>
              {saving ? "Attivazione…" : "Attiva profilo corriere"}
            </button>
          </div>
        ) : (
          <>
            {/* CARICA LISTINO PDF — in alto, come richiesto */}
            <div className="cp-card">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <FileText size={17} color={C.blue} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>Carica file PDF listino prezzi</span>
              </div>
              <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handlePdfSelected} style={{ display: "none" }} />
              <button onClick={handlePickPdf} disabled={pdfBusy} className="cp-btn-out" style={{ marginBottom: 12 }}>
                <Upload size={15} /> {pdfBusy ? "Lettura in corso…" : "Scegli PDF"}
              </button>
              <div style={{ display: "flex", gap: 8, background: "#FFFBEB", border: `1px solid ${C.amber}44`, borderRadius: 9, padding: "10px 12px" }}>
                <AlertTriangle size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
                  Il caricamento è automatico, effettuato da un'intelligenza artificiale: ricontrolla sempre con attenzione tutti i dati importati prima di salvarli. BulkStrike non si assume alcuna responsabilità per eventuali errori nell'estrazione. Maggiori dettagli nei <a href="/legale#termini" style={{ color: C.blue, fontWeight: 600, textDecoration: "underline" }}>Termini e Condizioni</a>.
                </span>
              </div>
              {pdfErr && <div style={{ marginTop: 10, fontSize: 13, color: C.red }}>{pdfErr}</div>}

              {pdfDraftRows.length > 0 && (
                <div style={{ marginTop: 16, border: `1px solid ${C.amber}44`, borderRadius: 10, padding: 14, background: "#FFFDF7" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Tariffe importate da rivedere ({pdfDraftRows.length})</div>
                  {pdfDraftRows.map((r, idx) => (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.7fr 0.7fr 0.7fr 0.7fr auto auto", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <select value={r.zoneArea} onChange={e => updateDraftRow(idx, { zoneArea: e.target.value })} style={inputStyle}>{COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                      <RegionPicker value={r.regions} onChange={v => updateDraftRow(idx, { regions: v })} />
                      <input type="number" value={r.leadTimeDays} onChange={e => updateDraftRow(idx, { leadTimeDays: e.target.value })} placeholder="gg" style={inputStyle} />
                      <input type="number" value={r.weightMinKg} onChange={e => updateDraftRow(idx, { weightMinKg: e.target.value })} style={inputStyle} />
                      <input type="number" value={r.weightMaxKg} onChange={e => updateDraftRow(idx, { weightMaxKg: e.target.value })} placeholder="illimitato" style={inputStyle} />
                      <input type="number" step="0.01" value={r.baseFee} onChange={e => updateDraftRow(idx, { baseFee: e.target.value })} style={inputStyle} />
                      <button onClick={() => saveDraftRow(idx)} title="Salva questa tariffa" style={{ background: C.green, border: "none", borderRadius: 7, width: 34, height: 34, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={14} /></button>
                      <button onClick={() => discardDraftRow(idx)} title="Scarta" style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 7, width: 34, height: 34, cursor: "pointer", color: C.red, display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* profilo / modalità */}
            <div className="cp-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{profile.legal_name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.muted }}>
                  {profile.status === "verified"
                    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.green, fontWeight: 700 }}><ShieldCheck size={13} /> Verificato — visibile ai clienti</span>
                    : <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.amber, fontWeight: 700 }}><AlertTriangle size={13} /> In attesa di verifica — non ancora visibile ai clienti</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[["zone", "Per zona"], ["distance", "Per distanza"]].map(([val, label]) => (
                  <button key={val} onClick={() => changeMode(val)} style={{ padding: "8px 14px", borderRadius: 9, border: `1.5px solid ${profile.pricing_mode === val ? C.blue : C.border}`, background: profile.pricing_mode === val ? "#EFF6FF" : "#fff", color: profile.pricing_mode === val ? C.dark : C.muted, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>{label}</button>
                ))}
              </div>
            </div>

            {profile.pricing_mode === "distance" && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: C.muted, background: C.bg, borderRadius: 10, padding: "12px 14px", marginBottom: 18, lineHeight: 1.5 }}>
                <Info size={15} color={C.blue} style={{ marginTop: 1, flexShrink: 0 }} />
                <span>Le tue tariffe a distanza sono già salvate, ma il calcolo automatico dei preventivi (che richiede geocodificare gli indirizzi) non è ancora attivo — è il prossimo passo. Nel frattempo, imposta comunque le tue fasce così sono pronte appena lo attiviamo.</span>
              </div>
            )}

            {/* TABELLA UNICA: nazione, regione, giorni di consegna, kg, tariffe — sostituisce "aree servite" + "tariffe" separate */}
            <div className="cp-card">
              <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: C.muted, marginBottom: 4 }}><MapPin size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Tariffe</div>
              
              {(profile.rates || []).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="cp-rate-row" style={{ fontWeight: 800, fontSize: 10.5, color: C.muted, textTransform: "uppercase" }}>
                    <span>Nazione</span><span>Regione</span><span>Giorni</span><span>Kg da</span><span>Kg a</span><span>Base €</span><span>€/kg</span><span></span>
                  </div>
                  {(profile.rates || []).map(r => (
                    <div key={r.id} className="cp-rate-row">
                      <span>{r.zone_area || "—"}</span>
                      <span style={{ fontSize: 12 }}>{(r.regions || []).length ? r.regions.join(", ") : "Tutta la nazione"}</span>
                      <span className="cp-num">{r.lead_time_days ?? "—"}</span>
                      <span className="cp-num">{r.weight_min_kg}</span>
                      <span className="cp-num">{r.weight_max_kg ?? "∞"}</span>
                      <span className="cp-num">{eur(r.base_fee)}</span>
                      <span className="cp-num">{eur(r.per_kg_fee)}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => duplicateRate(r)} title="Duplica" style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, width: 30, height: 30, cursor: "pointer", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center" }}><Copy size={13} /></button>
                        <button onClick={() => removeRate(r.id)} title="Elimina" style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, width: 30, height: 30, cursor: "pointer", color: C.red, display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ background: C.bg, borderRadius: 10, padding: 14 }}>
                {/* Griglia responsive: i campi vanno a capo su più righe quando non
                    c'è spazio, invece di richiedere lo scorrimento orizzontale. */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
                <div>
                  <span style={labelStyle}>Nazione</span>
                  <select value={rateForm.zoneArea} onChange={e => setRateForm({ ...rateForm, zoneArea: e.target.value })} style={inputStyle}>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <span style={labelStyle}>Regione (facoltativa)</span>
                  <RegionPicker value={rateForm.regions} onChange={v => setRateForm({ ...rateForm, regions: v })} />
                </div>
                <div><span style={labelStyle}>Giorni di spedizione</span><input type="number" min={1} value={rateForm.leadTimeDays} onChange={e => setRateForm({ ...rateForm, leadTimeDays: e.target.value })} style={inputStyle} placeholder="gg" /></div>
                {pricingMode === "distance" && (
                  <>
                    <div><span style={labelStyle}>Km da</span><input type="number" value={rateForm.distanceMinKm} onChange={e => setRateForm({ ...rateForm, distanceMinKm: e.target.value })} style={inputStyle} placeholder="0" /></div>
                    <div><span style={labelStyle}>Km a</span><input type="number" value={rateForm.distanceMaxKm} onChange={e => setRateForm({ ...rateForm, distanceMaxKm: e.target.value })} style={inputStyle} placeholder="illimitato" /></div>
                  </>
                )}
                <div><span style={labelStyle}>Kg da</span><input type="number" value={rateForm.weightMinKg} onChange={e => setRateForm({ ...rateForm, weightMinKg: e.target.value })} style={inputStyle} /></div>
                <div><span style={labelStyle}>Kg a</span><input type="number" value={rateForm.weightMaxKg} onChange={e => setRateForm({ ...rateForm, weightMaxKg: e.target.value })} style={inputStyle} placeholder="illimitato" /></div>
                <div><span style={labelStyle}>Tariffa base €</span><input type="number" value={rateForm.baseFee} onChange={e => setRateForm({ ...rateForm, baseFee: e.target.value })} style={inputStyle} /></div>
                {pricingMode === "distance" && <div><span style={labelStyle}>€/km</span><input type="number" step="0.01" value={rateForm.perKmFee} onChange={e => setRateForm({ ...rateForm, perKmFee: e.target.value })} style={inputStyle} /></div>}
                <div><span style={labelStyle}>Tariffa aggiuntiva €/kg</span><input type="number" step="0.01" value={rateForm.perKgFee} onChange={e => setRateForm({ ...rateForm, perKgFee: e.target.value })} style={inputStyle} /></div>
                </div>
                <button onClick={addRate} disabled={rateBusy} style={{ width: "100%", background: "#0369A1", color: "#fff", border: "none", borderRadius: 8, padding: "11px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 14, fontWeight: 700, fontFamily: "Inter,system-ui" }}><Plus size={15} /> {rateForm.id ? "Salva modifica" : "Aggiungi tariffa"}</button>
              </div>
            </div>

            {/* SERVIZI ACCESSORI — voce di costo separata da distanza/regione, legata al servizio richiesto */}
            <div className="cp-card">
              <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: C.muted, marginBottom: 4 }}><Package size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Servizi accessori</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.6 }}>Il servizio di collettame si applica automaticamente quando è necessario sbancalare la pedana per spedire separatamente a più clienti: va impostato obbligatoriamente per poter partecipare alle aste. Gli altri servizi accessori vengono invece selezionati dal cliente in checkout.</div>

              {(profile.service_fees || []).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  {(profile.service_fees || []).map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid #F1F5F9`, fontSize: 13.5 }}>
                      <span>{s.service_name} {s.is_automatic && <span style={{ fontSize: 10.5, fontWeight: 700, color: C.purple, background: "#F5F0FF", borderRadius: 100, padding: "2px 8px", marginLeft: 6 }}>automatico</span>}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span className="cp-num" style={{ fontWeight: 700 }}>{eur(s.fee)}</span>
                        <button onClick={() => removeServiceFee(s.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "end", background: C.bg, borderRadius: 10, padding: 14, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 220px" }}>
                  <span style={labelStyle}>Servizio</span>
                  <select value={serviceForm.selectedOption} onChange={e => setServiceForm({ ...serviceForm, selectedOption: e.target.value })} style={inputStyle}>
                    <option value="">— seleziona —</option>
                    {SUGGESTED_SERVICES.filter(s => !(profile.service_fees || []).some(x => x.service_name === s.name)).map(s => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                    <option value="__custom__">Altro (personalizzato)</option>
                  </select>
                </div>
                {serviceForm.selectedOption === "__custom__" && (
                  <div style={{ flex: "1 1 200px" }}>
                    <span style={labelStyle}>Nome servizio</span>
                    <input value={serviceForm.customName} onChange={e => setServiceForm({ ...serviceForm, customName: e.target.value })} style={inputStyle} placeholder="Es. Imballaggio rinforzato" />
                  </div>
                )}
                <div style={{ width: 120 }}>
                  <span style={labelStyle}>Costo €</span>
                  <input type="number" step="0.01" value={serviceForm.fee} onChange={e => setServiceForm({ ...serviceForm, fee: e.target.value })} style={inputStyle} />
                </div>
                <button onClick={() => addServiceFee()} disabled={serviceBusy || !serviceForm.selectedOption} style={{ background: "#0369A1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, fontFamily: "Inter,system-ui", opacity: !serviceForm.selectedOption ? 0.5 : 1 }}><Plus size={14} /> Aggiungi</button>
              </div>
            </div>

            {/* SALVA / ESCI */}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => { setOkMsg("Tutto salvato."); }} className="cp-btn"><Check size={16} /> Salva</button>
              <button onClick={handleExit} className="cp-btn-out" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><LogOut size={15} /> Esci</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
