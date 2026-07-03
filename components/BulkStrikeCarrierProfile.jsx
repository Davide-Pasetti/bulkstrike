"use client";
// BulkStrikeCarrierProfile — dashboard self-service corrieri (/corriere).
// Un corriere è un'azienda come le altre (stesso account, stesso KYC) che attiva il ruolo
// "corriere" e configura: modalità prezzo (zona o distanza reale in km — il corriere sceglie),
// aree servite, e tariffe (formula base+km+kg, oppure tabella a scaglioni: basta lasciare gli
// scaglioni vuoti per la formula, o crearne più righe per gli scaglioni).
// NB: il calcolo automatico dei preventivi per i corrieri "a distanza" arriva in un prossimo
// giro (richiede geocodifica indirizzi) — oggi solo i corrieri "a zona" generano preventivi.
import { useState, useEffect } from "react";
import { Truck, MapPin, Plus, Trash2, ChevronRight, ShieldCheck, Clock, AlertTriangle, Info } from "lucide-react";
import { getSession, getMyCarrierProfile, upsertCarrierProfile, addCarrierCoverage, removeCarrierCoverage, upsertCarrierRate, deleteCarrierRate, poolErrorMessage } from "@/lib/api";
import NavAuth from "@/components/BulkStrikeNavAuth";

const C = { blue: "#0EA5E9", dark: "#0284C7", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", amber: "#D97706" };
const eur = (n) => n == null ? "—" : "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function BSIcon({ size = 36, uid = "a" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#0D2137" /><stop offset="100%" stopColor="#0C4A6E" /></linearGradient>
        <linearGradient id={`ar${uid}`} x1="42" y1="12" x2="42" y2="40" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#38BDF8" /><stop offset="100%" stopColor="#22D3EE" /></linearGradient>
      </defs>
      <rect width="56" height="56" rx="13" fill={`url(#bg${uid})`} />
      <rect x="10" y="14" width="22" height="5.5" rx="2.75" fill="white" />
      <rect x="10" y="23" width="16" height="5.5" rx="2.75" fill="white" fillOpacity="0.65" />
      <rect x="10" y="32" width="10" height="5.5" rx="2.75" fill="white" fillOpacity="0.35" />
      <rect x="36" y="12" width="1" height="32" fill="white" fillOpacity="0.07" />
      <path d="M42 12 L42 34" stroke={`url(#ar${uid})`} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M35.5 28.5 L42 38 L48.5 28.5" stroke={`url(#ar${uid})`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

const EU = ["Francia", "Germania", "Spagna", "Polonia", "Paesi Bassi", "Portogallo", "Belgio", "Austria"];
const REGIONI_IT = ["Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche", "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana", "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto"];

export default function CarrierProfilePage() {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [profile, setProfile] = useState(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [pricingMode, setPricingMode] = useState("zone");
  const [leadTime, setLeadTime] = useState(5);

  const [areaType, setAreaType] = useState("country");
  const [areaValue, setAreaValue] = useState("Italia");

  const emptyRate = { zoneArea: "", distanceMinKm: "", distanceMaxKm: "", weightMinKg: "0", weightMaxKg: "", baseFee: "", perKmFee: "0", perKgFee: "0" };
  const [rateForm, setRateForm] = useState(emptyRate);
  const [rateBusy, setRateBusy] = useState(false);

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
    try { await upsertCarrierProfile(pricingMode, Number(leadTime) || null); await reload(); }
    catch (e) { setErr(poolErrorMessage(e)); }
    finally { setSaving(false); }
  }

  async function changeMode(mode) {
    setSaving(true); setErr("");
    try { await upsertCarrierProfile(mode, profile?.lead_time_days ?? null); await reload(); }
    catch (e) { setErr(poolErrorMessage(e)); }
    finally { setSaving(false); }
  }

  async function saveLeadTime(days) {
    setErr("");
    try { await upsertCarrierProfile(profile?.pricing_mode || "zone", Number(days) || null); await reload(); }
    catch (e) { setErr(poolErrorMessage(e)); }
  }

  async function addArea() {
    if (!areaValue.trim()) return;
    setSaving(true); setErr("");
    try { await addCarrierCoverage(areaType, areaValue.trim()); setAreaValue(""); await reload(); }
    catch (e) { setErr(poolErrorMessage(e)); }
    finally { setSaving(false); }
  }

  async function removeArea(id) {
    try { await removeCarrierCoverage(id); await reload(); } catch (e) { setErr(poolErrorMessage(e)); }
  }

  async function addRate() {
    if (!rateForm.baseFee) { setErr("Inserisci almeno la tariffa base."); return; }
    setRateBusy(true); setErr("");
    try {
      await upsertCarrierRate({
        zoneArea: profile.pricing_mode === "zone" ? (rateForm.zoneArea || null) : null,
        distanceMinKm: profile.pricing_mode === "distance" && rateForm.distanceMinKm !== "" ? Number(rateForm.distanceMinKm) : null,
        distanceMaxKm: profile.pricing_mode === "distance" && rateForm.distanceMaxKm !== "" ? Number(rateForm.distanceMaxKm) : null,
        weightMinKg: Number(rateForm.weightMinKg) || 0,
        weightMaxKg: rateForm.weightMaxKg !== "" ? Number(rateForm.weightMaxKg) : null,
        baseFee: Number(rateForm.baseFee) || 0,
        perKmFee: profile.pricing_mode === "distance" ? (Number(rateForm.perKmFee) || 0) : 0,
        perKgFee: Number(rateForm.perKgFee) || 0,
      });
      setRateForm(emptyRate);
      await reload();
    } catch (e) { setErr(poolErrorMessage(e)); }
    finally { setRateBusy(false); }
  }

  async function removeRate(id) {
    try { await deleteCarrierRate(id); await reload(); } catch (e) { setErr(poolErrorMessage(e)); }
  }

  const inputStyle = { width: "100%", padding: "9px 11px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13.5, outline: "none", fontFamily: "Inter,system-ui" };
  const labelStyle = { fontSize: 11.5, fontWeight: 600, color: C.muted, display: "block", marginBottom: 5 };

  return (
    <div style={{ background: "#fff", color: C.text, fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh", colorScheme: "light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .cp-num { font-family:'JetBrains Mono',monospace; }
        .cp-card { border:1px solid ${C.border}; border-radius:14px; padding:20px; margin-bottom:18px; }
        .cp-rate-row { display:grid; grid-template-columns:1.3fr 1fr 1fr 1fr 1fr auto; gap:10px; align-items:center; padding:10px 0; border-bottom:1px solid ${C.border}; font-size:13px; }
        @media (max-width:760px) { .cp-rate-row { grid-template-columns:1fr 1fr; } }
      `}</style>

      <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(255,255,255,0.96)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div onClick={() => { window.location.href = "/"; }} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <BSIcon size={34} uid="nav" />
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.03em" }}>Bulk</span>
              <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Strike</span>
            </div>
          </div>
          <NavAuth />
        </div>
      </nav>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "22px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginBottom: 18 }}>
          <span onClick={() => { window.location.href = "/"; }} style={{ cursor: "pointer" }}>Home</span><ChevronRight size={13} />
          <span style={{ color: C.text, fontWeight: 600 }}>Area corrieri</span>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <Truck size={24} color={C.blue} /> Area corrieri
        </h1>

        {err && <div style={{ marginBottom: 18, padding: "11px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13, color: C.red }}>{err}</div>}

        {loading ? (
          <div style={{ padding: "50px 0", textAlign: "center", color: C.muted }}>Caricamento…</div>
        ) : needLogin ? (
          <div style={{ padding: "40px 20px", textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Accedi per registrarti come corriere</div>
            <button onClick={() => { window.location.href = "/login"; }} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 9, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>Accedi</button>
          </div>
        ) : !profile?.is_carrier ? (
          <div className="cp-card">
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Diventa corriere su BulkStrike</div>
            <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.6, marginBottom: 18 }}>Attiva il ruolo corriere sul tuo account: imposti le tue tariffe e le aree che servi, e i clienti ti vedranno tra le opzioni di spedizione disponibili sulle tratte che copri.</p>

            <div style={{ marginBottom: 16 }}>
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

            <div style={{ marginBottom: 18, maxWidth: 220 }}>
              <span style={labelStyle}>Lead time standard (giorni)</span>
              <input type="number" min={1} value={leadTime} onChange={e => setLeadTime(e.target.value)} style={inputStyle} />
            </div>

            <button onClick={activate} disabled={saving} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1, fontFamily: "Inter,system-ui" }}>
              {saving ? "Attivazione…" : "Attiva profilo corriere"}
            </button>
          </div>
        ) : (
          <>
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

            <div className="cp-card">
              <span style={labelStyle}><Clock size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Lead time standard (giorni)</span>
              <div style={{ display: "flex", gap: 10, maxWidth: 220 }}>
                <input type="number" min={1} defaultValue={profile.lead_time_days || ""} onBlur={e => e.target.value && saveLeadTime(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div className="cp-card">
              <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: C.muted, marginBottom: 14 }}><MapPin size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Aree che servi</div>
              {(profile.coverage || []).length === 0 && <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Nessuna area impostata — aggiungine almeno una, altrimenti non comparirai in nessun preventivo.</div>}
              {(profile.coverage || []).map(a => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13.5 }}>
                  <span>{a.area_type === "country" ? "Paese" : "Regione"}: <b>{a.area_value}</b></span>
                  <button onClick={() => removeArea(a.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted }}><Trash2 size={14} /></button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <select value={areaType} onChange={e => setAreaType(e.target.value)} style={{ ...inputStyle, width: 120 }}>
                  <option value="country">Paese</option>
                  <option value="region">Regione</option>
                </select>
                {areaType === "region" ? (
                  <select value={areaValue} onChange={e => setAreaValue(e.target.value)} style={inputStyle}>
                    {REGIONI_IT.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <select value={areaValue} onChange={e => setAreaValue(e.target.value)} style={inputStyle}>
                    {["Italia", ...EU, "Altro extra-UE"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <button onClick={addArea} disabled={saving} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 8, padding: "0 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, fontFamily: "Inter,system-ui" }}><Plus size={14} /> Aggiungi</button>
              </div>
            </div>

            <div className="cp-card">
              <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: C.muted, marginBottom: 4 }}>Tariffe</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
                {profile.pricing_mode === "zone"
                  ? "Una riga = una tariffa per una zona (e, opzionalmente, uno scaglione di peso). Per una formula unica lascia gli scaglioni di peso vuoti; per una tabella a scaglioni crea più righe."
                  : "Una riga = una tariffa per una fascia di km (e, opzionalmente, uno scaglione di peso). Lascia le fasce vuote per una formula unica."}
              </div>

              {(profile.rates || []).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="cp-rate-row" style={{ fontWeight: 800, fontSize: 11, color: C.muted, textTransform: "uppercase" }}>
                    <span>{profile.pricing_mode === "zone" ? "Zona" : "Km"}</span><span>Peso</span><span>Base</span><span>€/km</span><span>€/kg</span><span></span>
                  </div>
                  {(profile.rates || []).map(r => (
                    <div key={r.id} className="cp-rate-row">
                      <span>{profile.pricing_mode === "zone" ? (r.zone_area || "—") : `${r.distance_min_km ?? 0}–${r.distance_max_km ?? "∞"} km`}</span>
                      <span className="cp-num">{r.weight_min_kg}–{r.weight_max_kg ?? "∞"} kg</span>
                      <span className="cp-num">{eur(r.base_fee)}</span>
                      <span className="cp-num">{profile.pricing_mode === "distance" ? eur(r.per_km_fee) : "—"}</span>
                      <span className="cp-num">{eur(r.per_kg_fee)}</span>
                      <button onClick={() => removeRate(r.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.muted }}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, background: C.bg, borderRadius: 10, padding: 14 }}>
                {profile.pricing_mode === "zone" ? (
                  <div>
                    <span style={labelStyle}>Zona</span>
                    <select value={rateForm.zoneArea} onChange={e => setRateForm({ ...rateForm, zoneArea: e.target.value })} style={inputStyle}>
                      <option value="">— seleziona —</option>
                      {(profile.coverage || []).map(a => <option key={a.id} value={a.area_value}>{a.area_value}</option>)}
                    </select>
                  </div>
                ) : (
                  <>
                    <div><span style={labelStyle}>Km da</span><input type="number" value={rateForm.distanceMinKm} onChange={e => setRateForm({ ...rateForm, distanceMinKm: e.target.value })} style={inputStyle} placeholder="0" /></div>
                    <div><span style={labelStyle}>Km a</span><input type="number" value={rateForm.distanceMaxKm} onChange={e => setRateForm({ ...rateForm, distanceMaxKm: e.target.value })} style={inputStyle} placeholder="illimitato" /></div>
                  </>
                )}
                <div><span style={labelStyle}>Kg da</span><input type="number" value={rateForm.weightMinKg} onChange={e => setRateForm({ ...rateForm, weightMinKg: e.target.value })} style={inputStyle} /></div>
                <div><span style={labelStyle}>Kg a</span><input type="number" value={rateForm.weightMaxKg} onChange={e => setRateForm({ ...rateForm, weightMaxKg: e.target.value })} style={inputStyle} placeholder="illimitato" /></div>
                <div><span style={labelStyle}>Tariffa base €</span><input type="number" value={rateForm.baseFee} onChange={e => setRateForm({ ...rateForm, baseFee: e.target.value })} style={inputStyle} /></div>
                {profile.pricing_mode === "distance" && <div><span style={labelStyle}>€/km</span><input type="number" step="0.01" value={rateForm.perKmFee} onChange={e => setRateForm({ ...rateForm, perKmFee: e.target.value })} style={inputStyle} /></div>}
                <div><span style={labelStyle}>€/kg</span><input type="number" step="0.01" value={rateForm.perKgFee} onChange={e => setRateForm({ ...rateForm, perKgFee: e.target.value })} style={inputStyle} /></div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button onClick={addRate} disabled={rateBusy} style={{ width: "100%", background: C.blue, color: "#fff", border: "none", borderRadius: 8, padding: "9px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 13, fontWeight: 700, fontFamily: "Inter,system-ui" }}><Plus size={14} /> Aggiungi tariffa</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
