"use client";
import { useEffect, useState, useCallback } from "react";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import { getBachecaFilters, getListingSpecSchema, getBachecaListings } from "@/lib/api";
import {
  C, SpecFilterFields, filterToSpecs, renderSpecList, prezzoUnitaLabel,
  COUNTRIES, REGIONI_ITALIA, bachecaLabelStyle, bachecaInputStyle,
} from "@/components/BulkStrikeSpecFields";

const LIMIT = 24;

// Chip selezionabile con conteggio annunci.
function Chip({ attivo, onClick, children, count }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600,
      border: `1px solid ${attivo ? C.blue : C.border}`, background: attivo ? C.blue : "#fff",
      color: attivo ? "#fff" : C.text, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      {children}
      {count != null && (
        <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
          background: attivo ? "rgba(255,255,255,.25)" : C.bg, color: attivo ? "#fff" : C.muted }}>{count}</span>
      )}
    </button>
  );
}

function Card({ a, schema }) {
  const specs = renderSpecList(schema || null, a.specs).slice(0, 4);
  const luogo = [a.compratore_regione, a.compratore_paese].filter(Boolean).join(", ");
  return (
    <a href={`/bacheca/${a.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      <div className="bc-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{a.prodotto}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{a.settore}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: a.giorni_rimanenti <= 5 ? C.red : C.muted, whiteSpace: "nowrap" }}>
            {a.giorni_rimanenti > 0 ? `${a.giorni_rimanenti} g rimasti` : "In scadenza"}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: .3 }}>Quantità</div>
            <div className="bc-num" style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{a.quantita} {a.unita}</div>
          </div>
          {a.prezzo_max != null && (
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: .3 }}>Prezzo max</div>
              <div className="bc-num" style={{ fontSize: 15, fontWeight: 700, color: C.green }}>{a.prezzo_max} {prezzoUnitaLabel(a.prezzo_unita)}</div>
            </div>
          )}
        </div>

        {specs.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {specs.map((s, i) => (
              <span key={i} style={{ fontSize: 11, color: C.text, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 8px" }}>
                <b style={{ color: C.muted, fontWeight: 600 }}>{s.etichetta}:</b> {s.testo}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 12, color: C.muted }}>{luogo || "Località non indicata"}</span>
          <span style={{ fontSize: 12, color: C.muted }}>{a.risposte || 0} rispost{(a.risposte || 0) === 1 ? "a" : "e"}</span>
        </div>
      </div>
    </a>
  );
}

export default function BulkStrikeBacheca() {
  const [filtri, setFiltri] = useState([]);
  const [sectorId, setSectorId] = useState("");
  const [productId, setProductId] = useState("");
  const [schema, setSchema] = useState([]);
  const [specFilter, setSpecFilter] = useState({});
  const [paesi, setPaesi] = useState([]);
  const [regioni, setRegioni] = useState([]);
  const [dati, setDati] = useState({ totale: 0, annunci: [] });
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pannello, setPannello] = useState(false);
  const [schemi, setSchemi] = useState({}); // product_id → schema (per etichette nelle card)

  const settore = filtri.find((s) => s.id === sectorId) || null;

  const carica = useCallback(async (over = {}) => {
    setLoading(true);
    const off = over.offset != null ? over.offset : offset;
    try {
      const payload = { limit: LIMIT, offset: off };
      const sec = over.sectorId != null ? over.sectorId : sectorId;
      const prod = over.productId != null ? over.productId : productId;
      if (sec) payload.sector_id = sec;
      if (prod) payload.product_id = prod;
      const pa = over.paesi != null ? over.paesi : paesi;
      const re = over.regioni != null ? over.regioni : regioni;
      if (pa.length) payload.paesi = pa;
      if (re.length) payload.regioni = re;
      const sc = over.schema != null ? over.schema : schema;
      const sf = over.specFilter != null ? over.specFilter : specFilter;
      const specs = filterToSpecs(sc, sf);
      if (Object.keys(specs).length) payload.specs = specs;
      const res = await getBachecaListings(payload);
      setDati(res);
      // Carica gli schemi mancanti dei prodotti presenti (per le etichette specs).
      setSchemi((prev) => {
        const mancanti = [...new Set((res.annunci || []).map((x) => x.product_id))].filter((pid) => pid && !(pid in prev));
        if (mancanti.length) {
          mancanti.forEach(async (pid) => {
            try { const sc = await getListingSpecSchema(pid); setSchemi((m) => ({ ...m, [pid]: sc })); }
            catch { setSchemi((m) => ({ ...m, [pid]: [] })); }
          });
        }
        return prev;
      });
    } catch {
      setDati({ totale: 0, annunci: [] });
    } finally {
      setLoading(false);
    }
  }, [sectorId, productId, paesi, regioni, schema, specFilter, offset]);

  useEffect(() => {
    getBachecaFilters().then(setFiltri).catch(() => setFiltri([]));
    carica({ offset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scegliSettore = (id) => {
    const next = id === sectorId ? "" : id;
    setSectorId(next); setProductId(""); setSchema([]); setSpecFilter({}); setOffset(0);
    carica({ sectorId: next, productId: "", schema: [], specFilter: {}, offset: 0 });
  };
  const scegliProdotto = async (id) => {
    const next = id === productId ? "" : id;
    setProductId(next); setSpecFilter({}); setOffset(0);
    let sc = [];
    if (next) { try { sc = await getListingSpecSchema(next); } catch { sc = []; } }
    setSchema(sc);
    carica({ productId: next, schema: sc, specFilter: {}, offset: 0 });
  };
  const applicaFiltri = () => { setOffset(0); carica({ offset: 0 }); };
  const azzera = () => {
    setPaesi([]); setRegioni([]); setSpecFilter({}); setOffset(0);
    carica({ offset: 0, specFilter: {}, paesi: [], regioni: [] });
    // paesi/regioni sono letti dallo stato in carica: forziamo con override manuale
  };
  const vaiPagina = (nuovo) => { setOffset(nuovo); carica({ offset: nuovo }); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };

  const toggleArr = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const prodotti = settore ? settore.prodotti || [] : [];

  return (
    <div style={{ background: "#fff", color: C.text, minHeight: "100vh", colorScheme: "light", fontFamily: "Inter,system-ui,sans-serif" }}>
      <BulkStrikeNav />
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "26px 18px 60px" }}>
      <style>{`
        .bc-card{background:#fff;border:1px solid ${C.border};border-radius:14px;padding:16px 18px;transition:box-shadow .15s,transform .15s;height:100%}
        .bc-card:hover{box-shadow:0 6px 22px rgba(2,132,199,.12);transform:translateY(-2px)}
        .bc-num{font-family:'JetBrains Mono',ui-monospace,monospace}
        .bc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
        .bc-layout{display:grid;grid-template-columns:270px 1fr;gap:20px}
        @media(max-width:820px){.bc-layout{grid-template-columns:1fr}}
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: C.text, margin: 0 }}>Bacheca</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: "6px 0 0", maxWidth: 620 }}>
            Le richieste di acquisto pubblicate dai compratori. Sfoglia liberamente; per rispondere serve un profilo fornitore.
          </p>
        </div>
        <a href="/bacheca/nuovo" style={{ background: "#0369A1", color: "#fff", border: "none", borderRadius: 10, padding: "12px 20px", fontWeight: 700, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" }}>
          + Pubblica una richiesta
        </a>
      </div>

      {/* PRE-FILTRI in cascata: settore → prodotto */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4, marginBottom: 8 }}>Settore</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {filtri.map((s) => <Chip key={s.id} attivo={s.id === sectorId} count={s.annunci} onClick={() => scegliSettore(s.id)}>{s.nome}</Chip>)}
          {filtri.length === 0 && <span style={{ fontSize: 13, color: C.muted }}>Caricamento…</span>}
        </div>
        {settore && prodotti.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4, margin: "16px 0 8px" }}>Prodotto</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {prodotti.map((p) => <Chip key={p.id} attivo={p.id === productId} count={p.annunci} onClick={() => scegliProdotto(p.id)}>{p.nome}</Chip>)}
            </div>
          </>
        )}
      </div>

      <div className="bc-layout" style={{ marginTop: 22 }}>
        {/* PANNELLO FILTRI */}
        <aside>
          <button onClick={() => setPannello((v) => !v)} className="bc-filtri-toggle" style={{
            width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px",
            cursor: "pointer", fontSize: 14, fontWeight: 700, color: C.text,
          }}>
            Filtri <span style={{ color: C.muted, fontSize: 12 }}>{pannello ? "nascondi ▲" : "mostra ▼"}</span>
          </button>
          {pannello && (
            <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 12px 12px", padding: "4px 14px 16px", marginTop: -2 }}>
              <div style={{ marginTop: 14 }}>
                <div style={bachecaLabelStyle}>Paesi cercati</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                  {COUNTRIES.map((p) => (
                    <button key={p} onClick={() => toggleArr(paesi, setPaesi, p)} style={miniChip(paesi.includes(p))}>{p}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={bachecaLabelStyle}>Regione (Italia)
                  <select value="" onChange={(e) => { if (e.target.value) toggleArr(regioni, setRegioni, e.target.value); }} style={{ ...bachecaInputStyle, marginTop: 4 }}>
                    <option value="">Aggiungi regione…</option>
                    {REGIONI_ITALIA.filter((r) => !regioni.includes(r)).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                {regioni.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {regioni.map((r) => (
                      <button key={r} onClick={() => toggleArr(regioni, setRegioni, r)} style={miniChip(true)}>{r} ✕</button>
                    ))}
                  </div>
                )}
              </div>

              {productId && schema.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10 }}>Specifiche</div>
                  <SpecFilterFields schema={schema} value={specFilter} onChange={setSpecFilter} />
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                <button onClick={applicaFiltri} style={{ flex: 1, background: "#0369A1", color: "#fff", border: "none", borderRadius: 9, padding: "10px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Applica</button>
                <button onClick={azzera} style={{ background: "#fff", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Azzera</button>
              </div>
            </div>
          )}
        </aside>

        {/* RISULTATI */}
        <section>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
            {loading ? "Caricamento…" : `${dati.totale} annunc${dati.totale === 1 ? "io" : "i"}`}
          </div>
          {!loading && dati.annunci.length === 0 && (
            <div style={{ background: "#fff", border: `1px dashed ${C.border}`, borderRadius: 14, padding: "40px 20px", textAlign: "center", color: C.muted }}>
              Nessun annuncio corrisponde ai filtri selezionati.
            </div>
          )}
          <div className="bc-grid">
            {dati.annunci.map((a) => <Card key={a.id} a={a} schema={schemi[a.product_id]} />)}
          </div>

          {dati.totale > LIMIT && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 26 }}>
              <button disabled={offset === 0} onClick={() => vaiPagina(Math.max(0, offset - LIMIT))} style={pagBtn(offset === 0)}>← Precedente</button>
              <span style={{ fontSize: 13, color: C.muted }}>Pagina {Math.floor(offset / LIMIT) + 1} di {Math.max(1, Math.ceil(dati.totale / LIMIT))}</span>
              <button disabled={offset + LIMIT >= dati.totale} onClick={() => vaiPagina(offset + LIMIT)} style={pagBtn(offset + LIMIT >= dati.totale)}>Successiva →</button>
            </div>
          )}
        </section>
      </div>
      </div>
    </div>
  );
}

const miniChip = (on) => ({
  padding: "5px 10px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 600,
  border: `1px solid ${on ? C.blue : C.border}`, background: on ? C.blue : "#fff", color: on ? "#fff" : C.text,
});
const pagBtn = (disabled) => ({
  background: disabled ? C.bg : "#fff", color: disabled ? C.muted : C.text, border: `1px solid ${C.border}`,
  borderRadius: 9, padding: "9px 16px", fontWeight: 600, fontSize: 13, cursor: disabled ? "default" : "pointer",
});
