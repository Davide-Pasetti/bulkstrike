"use client";
// Riepilogo e spedizione della richiesta campioni. Il cliente sceglie la
// destinazione e, per OGNI fornitore selezionato, un corriere con preventivo
// REALE. Non paga qui: se il fornitore accetta e addebita la spedizione,
// riceverà poi una richiesta di pagamento. Percorso unico per mosto/vino e
// materie prime: la differenza (specifiche) è già stata gestita a monte.
import { useEffect, useState, useCallback } from "react";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import { getSession, getMyCompany, getSampleShippingOptions, requestSamplesBulk, bulkSampleGlobalError } from "@/lib/api";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706", wine:"#9D174D" };
const eur = (n) => n == null ? "—" : "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });
const label = { display:"block", fontSize:12, fontWeight:600, color:C.muted, marginBottom:4 };
const input = { width:"100%", minWidth:0, padding:"9px 11px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:13.5, background:"#fff", color:C.text };

export default function BulkStrikeSampleCheckout() {
  const [checkout, setCheckout] = useState(undefined); // undefined = in lettura; null = assente
  const [loggato, setLoggato] = useState(true);
  const [indirizzo, setIndirizzo] = useState("");
  const [nazione, setNazione] = useState("");
  const [regione, setRegione] = useState("");
  const [peso, setPeso] = useState("1");
  const [note, setNote] = useState("");
  const [ship, setShip] = useState(null);        // risposta get_sample_shipping_options
  const [carrierSel, setCarrierSel] = useState({}); // supplier_product_id -> carrier_company_id
  const [caricando, setCaricando] = useState(false);
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState("");
  const [esito, setEsito] = useState(null);       // array risultato request_samples_bulk

  // 1) legge la selezione salvata + precompila la destinazione dalla sede
  useEffect(() => {
    let raw = null;
    try { raw = sessionStorage.getItem("bs_sample_checkout"); } catch { /* no-op */ }
    if (!raw) { setCheckout(null); return; }
    let data = null;
    try { data = JSON.parse(raw); } catch { data = null; }
    if (!data || !Array.isArray(data.supplierProductIds) || data.supplierProductIds.length === 0) { setCheckout(null); return; }
    setCheckout(data);
    setNote(data.note || "");
    getSession().then((s) => {
      setLoggato(!!s);
      if (!s) return;
      return getMyCompany().then((c) => {
        if (!c) return;
        const parts = [c.address, c.city, c.region, c.country].map((x) => (x || "").trim()).filter(Boolean);
        setIndirizzo(parts.join(", "));
        setNazione(c.country || "");
        setRegione(c.region || "");
      });
    }).catch(() => {});
  }, []);

  // 2) (ri)calcola i preventivi quando cambiano fornitori, nazione o peso
  const calcola = useCallback(async (spids, paese, pesoKg) => {
    setCaricando(true); setErrore("");
    try {
      const res = await getSampleShippingOptions(spids, paese || null, pesoKg === "" ? null : Number(pesoKg));
      setShip(res);
    } catch (e) {
      setErrore(bulkSampleGlobalError(e));
      setShip(null);
    } finally {
      setCaricando(false);
    }
  }, []);

  // Debounce su nazione/peso; primo calcolo appena la nazione è precompilata.
  useEffect(() => {
    if (!checkout) return;
    const t = setTimeout(() => { calcola(checkout.supplierProductIds, nazione, peso); }, 350);
    return () => clearTimeout(t);
  }, [checkout, nazione, peso, calcola]);

  // Preseleziona il corriere "consigliato" ad ogni nuovo preventivo.
  useEffect(() => {
    if (!ship?.fornitori) return;
    const next = {};
    for (const f of ship.fornitori) {
      if (f.disponibile && f.consigliato?.carrier_company_id) next[f.supplier_product_id] = f.consigliato.carrier_company_id;
    }
    setCarrierSel(next);
  }, [ship]);

  const invia = async () => {
    if (!checkout) return;
    setInviando(true); setErrore("");
    try {
      const carrier_selections = {};
      for (const f of (ship?.fornitori || [])) {
        const c = carrierSel[f.supplier_product_id];
        if (c) carrier_selections[f.supplier_product_id] = c;
      }
      const sp = checkout.specs || {};
      const res = await requestSamplesBulk({
        supplierProductIds: checkout.supplierProductIds,
        message: note.trim() || null,
        destinationCountry: nazione.trim() || null,
        destinationRegion: regione.trim() || null,
        shippingAddress: indirizzo.trim() || null,
        weightKg: peso === "" ? null : Number(peso),
        carrierSelections: carrier_selections,
        ...(checkout.richiedeSpec ? {
          specQuantitaPartita: sp.quantitaPartita === "" || sp.quantitaPartita == null ? null : Number(sp.quantitaPartita),
          specColore: sp.colore || null,
          specLavorazione: sp.lavorazione || null,
          specRefrigerato: !!sp.refrigerato,
          specSo2: sp.so2 === "" || sp.so2 == null ? null : Number(sp.so2),
          specGradoMin: sp.gradoMin === "" || sp.gradoMin == null ? null : Number(sp.gradoMin),
          specGradoMax: sp.gradoMax === "" || sp.gradoMax == null ? null : Number(sp.gradoMax),
          specVarieta: (sp.varieta || "").trim() || null,
          specDenominazioneTipo: sp.denomTipo || null,
          specDenominazione: (sp.denomTesto || "").trim() || null,
          specAnnata: sp.annata === "" || sp.annata == null ? null : Number(sp.annata),
        } : {}),
      });
      setEsito(Array.isArray(res) ? res : []);
      try { sessionStorage.removeItem("bs_sample_checkout"); } catch { /* no-op */ }
    } catch (e) {
      setErrore(bulkSampleGlobalError(e));
    } finally {
      setInviando(false);
    }
  };

  // ── stati particolari ────────────────────────────────────────────────────
  if (checkout === undefined) return <Shell><p style={{ color:C.muted }}>Caricamento…</p></Shell>;
  if (checkout === null) return (
    <Shell>
      <div style={card}>
        <div style={{ fontSize:16, fontWeight:800 }}>Nessun campione selezionato</div>
        <p style={{ color:C.muted, marginTop:8 }}>Torna alla pagina di un prodotto, scegli i fornitori e clicca “Richiedi campioni”.</p>
        <a href="/catalogo" style={btnPrimary}>Vai al catalogo</a>
      </div>
    </Shell>
  );
  if (!loggato) return (
    <Shell>
      <div style={card}>
        <div style={{ fontSize:16, fontWeight:800 }}>Accedi per continuare</div>
        <a href="/auth/login" style={btnPrimary}>Accedi</a>
      </div>
    </Shell>
  );

  // ── conferma dopo l'invio ────────────────────────────────────────────────
  if (esito) {
    const nomeById = {};
    (ship?.fornitori || []).forEach((f) => { nomeById[f.supplier_product_id] = f.fornitore; });
    const created = esito.filter((r) => r.status === "created");
    const failed = esito.filter((r) => r.status !== "created");
    return (
      <Shell>
        <div style={card}>
          <div style={{ fontSize:44, textAlign:"center", marginBottom:4 }}>✓</div>
          <h1 style={{ fontSize:22, fontWeight:900, textAlign:"center", margin:0, color:C.text }}>Richiesta inoltrata</h1>
          <p style={{ color:C.muted, textAlign:"center", marginTop:8 }}>
            {created.length > 0 ? `Inviata a ${created.length} ${created.length===1?"fornitore":"fornitori"}.` : "Nessuna richiesta inviata."}
          </p>
          {failed.length > 0 && (
            <div style={{ marginTop:12, background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10, padding:"10px 12px", fontSize:13 }}>
              <b>{failed.length}</b> non {failed.length===1?"è andata":"sono andate"} a buon fine:
              <ul style={{ margin:"6px 0 0", paddingLeft:18, color:C.text }}>
                {failed.map((r, i) => <li key={i}>{nomeById[r.supplier_product_id] || "Fornitore"}: {r.error_message || "errore"}</li>)}
              </ul>
            </div>
          )}
          <p style={{ fontSize:12.5, color:C.muted, textAlign:"center", marginTop:14, lineHeight:1.55 }}>
            Non paghi adesso. Se il fornitore accetta e decide di addebitare la spedizione, riceverai una richiesta di pagamento.
          </p>
          <div style={{ display:"flex", gap:10, justifyContent:"center", marginTop:16, flexWrap:"wrap" }}>
            <a href="/le-mie-richieste-campioni" style={btnPrimary}>Vai a “I miei campioni”</a>
            <a href="/catalogo" style={btnGhost}>Torna al catalogo</a>
          </div>
        </div>
      </Shell>
    );
  }

  // ── form principale ──────────────────────────────────────────────────────
  const fornitori = ship?.fornitori || [];
  return (
    <Shell>
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:12, flexWrap:"wrap", marginBottom:6 }}>
        <h1 style={{ fontSize:24, fontWeight:900, color:C.text, margin:0 }}>Richiesta campioni</h1>
        <span style={{ fontSize:13, color:C.muted }}>{checkout.productName || ""}</span>
      </div>

      {ship?.nessuna_tariffa && (
        <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", color:"#92400E", borderRadius:10, padding:"11px 14px", fontSize:13, marginBottom:14 }}>
          Nessun corriere copre questa destinazione: puoi comunque inviare la richiesta e concordare la spedizione direttamente con i fornitori.
        </div>
      )}

      {/* DESTINAZIONE */}
      <div style={card}>
        <div style={sect}>Destinazione</div>
        <label style={label}>Indirizzo di spedizione
          <textarea value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} rows={2} style={{ ...input, resize:"vertical", marginTop:4 }} placeholder="Via, città, CAP…" />
        </label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 130px", gap:10, marginTop:12 }} className="sc-dest">
          <label style={label}>Nazione
            <input value={nazione} onChange={(e) => setNazione(e.target.value)} style={{ ...input, marginTop:4 }} placeholder="es. Italia" />
          </label>
          <label style={label}>Regione
            <input value={regione} onChange={(e) => setRegione(e.target.value)} style={{ ...input, marginTop:4 }} placeholder="facoltativa" />
          </label>
          <label style={label}>Peso (kg)
            <input type="number" min="0.1" max="50" step="0.1" value={peso} onChange={(e) => setPeso(e.target.value)} style={{ ...input, marginTop:4 }} />
          </label>
        </div>
        <div style={{ fontSize:11.5, color:C.muted, marginTop:6 }}>La nazione guida il calcolo dei preventivi. Il preventivo si aggiorna da solo.</div>
      </div>

      {/* FORNITORI + CORRIERE */}
      <div style={{ ...card, marginTop:14 }}>
        <div style={sect}>Spedizione per fornitore {caricando && <span style={{ fontSize:12, color:C.muted, fontWeight:400 }}>· aggiorno i preventivi…</span>}</div>
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {fornitori.length === 0 && !caricando && (
            <div style={{ color:C.muted, fontSize:13 }}>Nessun fornitore da mostrare.</div>
          )}
          {fornitori.map((f) => (
            <div key={f.supplier_product_id} style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:10, flexWrap:"wrap" }}>
                <span style={{ fontSize:14.5, fontWeight:700, color:C.text }}>{f.fornitore}</span>
                <span style={{ fontSize:12, color:C.muted }}>Parte da: {f.paese_partenza || "—"}</span>
              </div>
              {f.disponibile ? (
                <div style={{ marginTop:10 }}>
                  <label style={label}>Corriere</label>
                  <select value={carrierSel[f.supplier_product_id] || ""} onChange={(e) => setCarrierSel((s) => ({ ...s, [f.supplier_product_id]: e.target.value }))} style={{ ...input, marginTop:4 }}>
                    {(f.opzioni || []).map((o) => (
                      <option key={o.carrier_company_id} value={o.carrier_company_id}>
                        {o.corriere} — {eur(o.prezzo)} · {o.giorni_consegna} gg{o.espresso ? " · espresso" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div style={{ marginTop:8, fontSize:12.5, color:C.amber }}>
                  Nessun corriere disponibile per questa destinazione. La richiesta parte lo stesso: concorderai la spedizione col fornitore.
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* NOTE */}
      <div style={{ ...card, marginTop:14 }}>
        <label style={label}>Note per il fornitore
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} style={{ ...input, resize:"vertical", marginTop:4 }}
            placeholder="Informazioni utili al fornitore (facoltative)." />
        </label>
      </div>

      {errore && <div style={{ marginTop:14, background:"#FEF2F2", border:"1px solid #FECACA", color:"#991B1B", borderRadius:10, padding:"11px 14px", fontSize:13.5 }}>{errore}</div>}

      <button onClick={invia} disabled={inviando || caricando}
        style={{ width:"100%", marginTop:16, background:(inviando||caricando)?"#E9AEC6":C.wine, color:"#fff", border:"none", borderRadius:10, padding:"14px", fontSize:15, fontWeight:700, cursor:(inviando||caricando)?"default":"pointer", opacity:(inviando||caricando)?0.7:1 }}>
        {inviando ? "Invio…" : "Invia richiesta"}
      </button>
      <p style={{ fontSize:12, color:C.muted, textAlign:"center", marginTop:8, lineHeight:1.55 }}>
        Non paghi adesso. Se il fornitore accetta e decide di addebitare la spedizione, riceverai una richiesta di pagamento.
      </p>

      <style>{`@media(max-width:640px){.sc-dest{grid-template-columns:1fr!important}}`}</style>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ background:"#fff", color:C.text, minHeight:"100vh", colorScheme:"light", fontFamily:"Inter,system-ui,sans-serif" }}>
      <BulkStrikeNav />
      <div style={{ maxWidth:760, margin:"0 auto", padding:"24px 18px 60px" }}>
        <p style={{ marginBottom:14 }}><a href="/catalogo" style={{ color:C.dark, fontWeight:600, textDecoration:"none", fontSize:13 }}>← Catalogo</a></p>
        {children}
      </div>
    </div>
  );
}

const card = { background:"#fff", border:`1px solid ${C.border}`, borderRadius:14, padding:18 };
const sect = { fontSize:11, color:C.muted, fontWeight:700, textTransform:"uppercase", letterSpacing:".4px", marginBottom:12 };
const btnPrimary = { display:"inline-block", marginTop:14, background:"#0369A1", color:"#fff", borderRadius:9, padding:"11px 20px", fontWeight:700, fontSize:14, textDecoration:"none" };
const btnGhost = { display:"inline-block", marginTop:14, background:"#fff", color:C.text, border:`1px solid ${C.border}`, borderRadius:9, padding:"11px 20px", fontWeight:600, fontSize:14, textDecoration:"none" };
