"use client";
import { useEffect, useState } from "react";
import { getBachecaFilters, getListingSpecSchema, getSession, getMyCompany, createListing, bachecaErrorMessage } from "@/lib/api";
import { C, SpecFormFields, formValuesToSpecs, PREZZO_UNITA, COUNTRIES, REGIONI_ITALIA, bachecaLabelStyle, bachecaInputStyle } from "@/components/BulkStrikeSpecFields";

const UNITA = ["hl", "l", "kg", "t"];

// Avviso anonimato — obbligatorio e sempre visibile prima della pubblicazione.
function AvvisoAnonimato() {
  return (
    <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "14px 16px", color: "#92400E", fontSize: 13.5, lineHeight: 1.5 }}>
      <b>Il nome della tua azienda non viene mostrato in bacheca.</b> I fornitori vedranno solo la tua nazione e la tua regione.
    </div>
  );
}

export default function BulkStrikeBachecaNuovo() {
  const [step, setStep] = useState(1);
  const [filtri, setFiltri] = useState([]);
  const [loggato, setLoggato] = useState(null); // null = in caricamento
  const [regioneMancante, setRegioneMancante] = useState(false);
  const [sectorId, setSectorId] = useState("");
  const [productId, setProductId] = useState("");
  const [schema, setSchema] = useState([]);
  const [base, setBase] = useState({ quantita: "", unita: "hl", prezzo_max: "", prezzo_unita: "", note: "", regione_compratore: "" });
  const [paesi, setPaesi] = useState([]);
  const [regioni, setRegioni] = useState([]);
  const [specValues, setSpecValues] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState(null);
  const [fatto, setFatto] = useState(null);

  useEffect(() => {
    getBachecaFilters().then(setFiltri).catch(() => setFiltri([]));
    getSession().then(async (s) => {
      setLoggato(!!s);
      if (s) {
        const c = await getMyCompany().catch(() => null);
        setRegioneMancante(!c || !c.region || !String(c.region).trim());
      }
    }).catch(() => setLoggato(false));
  }, []);

  const settore = filtri.find((s) => s.id === sectorId) || null;
  const prodotto = settore?.prodotti?.find((p) => p.id === productId) || null;
  const setB = (k, v) => setBase((b) => ({ ...b, [k]: v }));
  const toggle = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const scegliProdotto = async (id) => {
    setProductId(id);
    const p = settore?.prodotti?.find((x) => x.id === id);
    if (p?.unita) setB("unita", p.unita);
    try { setSchema(await getListingSpecSchema(id)); } catch { setSchema([]); }
    setSpecValues({});
  };

  const pubblica = async () => {
    setSalvando(true); setErrore(null);
    try {
      const payload = {
        product_id: productId, sector_id: sectorId,
        quantita: Number(base.quantita), unita: base.unita,
        paesi, regioni, specs: formValuesToSpecs(schema, specValues),
      };
      if (base.prezzo_max !== "") payload.prezzo_max = Number(base.prezzo_max);
      if (base.prezzo_unita) payload.prezzo_unita = base.prezzo_unita;
      if (base.note.trim()) payload.note = base.note.trim();
      if (regioneMancante && base.regione_compratore.trim()) payload.regione_compratore = base.regione_compratore.trim();
      const res = await createListing(payload);
      setFatto(res);
    } catch (e) {
      setErrore(bachecaErrorMessage(e, schema));
    } finally {
      setSalvando(false);
    }
  };

  if (loggato === false) return (
    <div style={wrap}>
      <h1 style={h1}>Pubblica una richiesta</h1>
      <div style={{ ...box, marginTop: 18 }}>
        <b>Accedi per pubblicare.</b>
        <p style={{ margin: "8px 0 0", color: C.muted }}>Per pubblicare una richiesta di acquisto devi accedere al tuo account.</p>
        <a href="/auth/login" style={{ display: "inline-block", marginTop: 12, background: "#0369A1", color: "#fff", borderRadius: 9, padding: "10px 18px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>Accedi</a>
      </div>
    </div>
  );

  if (fatto) return (
    <div style={wrap}>
      <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 14, padding: "26px 22px", textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>✓</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#065F46", margin: 0 }}>Richiesta pubblicata</h1>
        <p style={{ color: "#047857", marginTop: 8 }}>Il tuo annuncio è online e resterà visibile per 30 giorni. Ricorda: i fornitori non vedono il nome della tua azienda.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
          <a href="/bacheca/miei" style={{ background: "#0369A1", color: "#fff", borderRadius: 9, padding: "10px 18px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>I miei annunci</a>
          <a href="/bacheca" style={{ background: "#fff", color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 18px", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>Vai alla bacheca</a>
        </div>
      </div>
    </div>
  );

  const step1ok = sectorId && productId;
  const step2ok = base.quantita !== "" && Number(base.quantita) > 0 && (!base.prezzo_max || base.prezzo_unita) && (!regioneMancante || base.regione_compratore.trim());

  return (
    <div style={wrap}>
      <p style={{ marginBottom: 12 }}><a href="/bacheca" style={{ color: C.dark, fontWeight: 600, textDecoration: "none", fontSize: 13 }}>← Bacheca</a></p>
      <h1 style={h1}>Pubblica una richiesta</h1>

      {/* Stepper */}
      <div style={{ display: "flex", gap: 8, margin: "18px 0 22px" }}>
        {["Prodotto", "Dettagli", "Specifiche"].map((t, i) => {
          const n = i + 1, on = step === n, done = step > n;
          return (
            <div key={t} style={{ flex: 1, padding: "8px 10px", borderRadius: 9, textAlign: "center", fontSize: 12.5, fontWeight: 700,
              background: on ? C.blue : done ? "#ECFDF5" : "#fff", color: on ? "#fff" : done ? "#065F46" : C.muted, border: `1px solid ${on ? C.blue : done ? "#A7F3D0" : C.border}` }}>
              {n}. {t}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div style={card}>
          <div style={sect}>Settore</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {filtri.map((s) => (
              <button key={s.id} onClick={() => { setSectorId(s.id); setProductId(""); setSchema([]); }} style={chip(s.id === sectorId)}>{s.nome}</button>
            ))}
            {filtri.length === 0 && <span style={{ color: C.muted, fontSize: 13 }}>Caricamento…</span>}
          </div>
          {settore && (
            <>
              <div style={{ ...sect, marginTop: 18 }}>Prodotto</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(settore.prodotti || []).map((p) => (
                  <button key={p.id} onClick={() => scegliProdotto(p.id)} style={chip(p.id === productId)}>{p.nome}</button>
                ))}
              </div>
            </>
          )}
          <div style={navRow}>
            <span />
            <button disabled={!step1ok} onClick={() => setStep(2)} style={btnPrimary(!step1ok)}>Continua →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label style={bachecaLabelStyle}>Quantità *
              <input type="number" min="1" step="any" value={base.quantita} onChange={(e) => setB("quantita", e.target.value)} style={{ ...bachecaInputStyle, marginTop: 4 }} placeholder="es. 1000" />
            </label>
            <label style={bachecaLabelStyle}>Unità
              <select value={base.unita} onChange={(e) => setB("unita", e.target.value)} style={{ ...bachecaInputStyle, marginTop: 4 }}>
                {UNITA.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label style={bachecaLabelStyle}>Prezzo massimo
              <input type="number" min="0" step="any" value={base.prezzo_max} onChange={(e) => setB("prezzo_max", e.target.value)} style={{ ...bachecaInputStyle, marginTop: 4 }} placeholder="facoltativo" />
            </label>
            <label style={bachecaLabelStyle}>Unità di prezzo
              <select value={base.prezzo_unita} onChange={(e) => setB("prezzo_unita", e.target.value)} style={{ ...bachecaInputStyle, marginTop: 4 }}>
                <option value="">—</option>
                {PREZZO_UNITA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={bachecaLabelStyle}>Paesi di provenienza cercati</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
              {COUNTRIES.map((p) => <button key={p} onClick={() => toggle(paesi, setPaesi, p)} style={miniChip(paesi.includes(p))}>{p}</button>)}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={bachecaLabelStyle}>Regioni cercate (Italia)
              <select value="" onChange={(e) => { if (e.target.value) toggle(regioni, setRegioni, e.target.value); }} style={{ ...bachecaInputStyle, marginTop: 4 }}>
                <option value="">Aggiungi regione…</option>
                {REGIONI_ITALIA.filter((r) => !regioni.includes(r)).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            {regioni.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {regioni.map((r) => <button key={r} onClick={() => toggle(regioni, setRegioni, r)} style={miniChip(true)}>{r} ✕</button>)}
              </div>
            )}
          </div>

          <label style={{ ...bachecaLabelStyle, marginTop: 16 }}>Note
            <textarea value={base.note} onChange={(e) => setB("note", e.target.value)} maxLength={2000} rows={4} style={{ ...bachecaInputStyle, marginTop: 4, resize: "vertical" }} placeholder="Descrivi cosa cerchi, tempistiche, requisiti particolari…" />
          </label>

          {regioneMancante && (
            <label style={{ ...bachecaLabelStyle, marginTop: 16 }}>La tua regione *
              <select value={base.regione_compratore} onChange={(e) => setB("regione_compratore", e.target.value)} style={{ ...bachecaInputStyle, marginTop: 4 }}>
                <option value="">Seleziona…</option>
                {REGIONI_ITALIA.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <span style={{ display: "block", fontSize: 11, color: C.muted, fontWeight: 400, marginTop: 4 }}>
                Serve perché i fornitori vedono la tua regione (mai il nome dell’azienda). La salviamo sul tuo profilo.
              </span>
            </label>
          )}

          <div style={{ marginTop: 18 }}><AvvisoAnonimato /></div>

          <div style={navRow}>
            <button onClick={() => setStep(1)} style={btnGhost}>← Indietro</button>
            <button disabled={!step2ok} onClick={() => setStep(3)} style={btnPrimary(!step2ok)}>Continua →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={card}>
          {schema.length > 0 ? (
            <>
              <div style={sect}>Specifiche di {prodotto?.nome}</div>
              <SpecFormFields schema={schema} values={specValues} onChange={(k, v) => setSpecValues((s) => ({ ...s, [k]: v }))} />
            </>
          ) : (
            <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>Nessuna specifica tecnica per questo prodotto.</p>
          )}

          <div style={{ marginTop: 20 }}><AvvisoAnonimato /></div>
          <div style={{ marginTop: 10, fontSize: 12.5, color: C.muted }}>
            L’annuncio resterà visibile per <b>30 giorni</b>, poi scadrà automaticamente.
          </div>

          {errore && <div style={{ marginTop: 14, background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 10, padding: "12px 14px", fontSize: 13.5 }}>{errore}</div>}

          <div style={navRow}>
            <button onClick={() => setStep(2)} style={btnGhost}>← Indietro</button>
            <button disabled={salvando} onClick={pubblica} style={btnPrimary(salvando)}>{salvando ? "Pubblicazione…" : "Pubblica la richiesta"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const wrap = { maxWidth: 720, margin: "0 auto", padding: "26px 18px 60px", fontFamily: "Inter,system-ui,sans-serif" };
const h1 = { fontSize: 26, fontWeight: 900, color: C.text, margin: 0 };
const card = { background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 };
const box = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", fontSize: 14 };
const sect = { fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4, marginBottom: 10 };
const navRow = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22, gap: 10 };
const chip = (on) => ({ padding: "8px 15px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${on ? C.blue : C.border}`, background: on ? C.blue : "#fff", color: on ? "#fff" : C.text });
const miniChip = (on) => ({ padding: "5px 10px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 600, border: `1px solid ${on ? C.blue : C.border}`, background: on ? C.blue : "#fff", color: on ? "#fff" : C.text });
const btnPrimary = (disabled) => ({ background: disabled ? "#93C5DD" : "#0369A1", color: "#fff", border: "none", borderRadius: 10, padding: "12px 22px", fontWeight: 700, fontSize: 14, cursor: disabled ? "default" : "pointer" });
const btnGhost = { background: "#fff", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" };
