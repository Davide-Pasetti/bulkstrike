"use client";
import { useEffect, useState } from "react";
import { getMyListingAlertPrefs, setMyListingAlertPrefs, getBachecaFilters, bachecaErrorMessage } from "@/lib/api";
import { C, FREQUENZE, COUNTRIES, REGIONI_ITALIA, bachecaLabelStyle, bachecaInputStyle } from "@/components/BulkStrikeSpecFields";

// Editor di una singola regola personalizzata.
function Regola({ r, filtri, onChange, onRemove }) {
  const settore = filtri.find((s) => s.id === r.sector_id) || null;
  const prodotti = settore?.prodotti || [];
  const toggle = (campo, v) => {
    const arr = r[campo] || [];
    onChange({ ...r, [campo]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] });
  };
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, background: C.bg }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={bachecaLabelStyle}>Settore
          <select value={r.sector_id || ""} onChange={(e) => onChange({ ...r, sector_id: e.target.value || null, product_id: null })} style={{ ...bachecaInputStyle, marginTop: 4 }}>
            <option value="">Qualsiasi</option>
            {filtri.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </label>
        <label style={bachecaLabelStyle}>Prodotto
          <select value={r.product_id || ""} disabled={!settore} onChange={(e) => onChange({ ...r, product_id: e.target.value || null })} style={{ ...bachecaInputStyle, marginTop: 4, opacity: settore ? 1 : .6 }}>
            <option value="">Qualsiasi</option>
            {prodotti.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={bachecaLabelStyle}>Paesi</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
          {COUNTRIES.map((p) => <button key={p} type="button" onClick={() => toggle("paesi", p)} style={miniChip((r.paesi || []).includes(p))}>{p}</button>)}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={bachecaLabelStyle}>Regioni (Italia)
          <select value="" onChange={(e) => { if (e.target.value) toggle("regioni", e.target.value); }} style={{ ...bachecaInputStyle, marginTop: 4 }}>
            <option value="">Aggiungi regione…</option>
            {REGIONI_ITALIA.filter((x) => !(r.regioni || []).includes(x)).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        {(r.regioni || []).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {(r.regioni || []).map((x) => <button key={x} type="button" onClick={() => toggle("regioni", x)} style={miniChip(true)}>{x} ✕</button>)}
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, marginTop: 12 }}>
        <label style={{ ...bachecaLabelStyle, flex: 1, maxWidth: 200 }}>Quantità minima
          <input type="number" min="0" step="any" value={r.quantita_min ?? ""} onChange={(e) => onChange({ ...r, quantita_min: e.target.value })} style={{ ...bachecaInputStyle, marginTop: 4 }} placeholder="qualsiasi" />
        </label>
        <button type="button" onClick={onRemove} style={{ background: "#fff", color: C.red, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Rimuovi</button>
      </div>
    </div>
  );
}

const miniChip = (on) => ({ padding: "5px 10px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 600, border: `1px solid ${on ? C.blue : C.border}`, background: on ? C.blue : "#fff", color: on ? "#fff" : C.text });

export default function BulkStrikeBachecaNotifiche() {
  const [prefs, setPrefs] = useState(null);
  const [filtri, setFiltri] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    getMyListingAlertPrefs().then((p) => setPrefs(p || { frequenza: "giornaliera", ambito: "catalogo", regole: [] })).catch(() => setPrefs({ frequenza: "giornaliera", ambito: "catalogo", regole: [] }));
    getBachecaFilters().then(setFiltri).catch(() => setFiltri([]));
  }, []);

  if (!prefs) return <div className="bs-card" style={{ padding: 18 }}><p style={{ color: C.muted, margin: 0 }}>Caricamento…</p></div>;

  const set = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));
  const setRegola = (i, r) => setPrefs((p) => ({ ...p, regole: p.regole.map((x, j) => (j === i ? r : x)) }));
  const addRegola = () => setPrefs((p) => ({ ...p, regole: [...(p.regole || []), { sector_id: null, product_id: null, paesi: [], regioni: [], quantita_min: "" }] }));
  const delRegola = (i) => setPrefs((p) => ({ ...p, regole: p.regole.filter((_, j) => j !== i) }));

  const salva = async () => {
    setSalvando(true); setMsg(null);
    try {
      const payload = {
        frequenza: prefs.frequenza,
        ambito: prefs.ambito,
        regole: (prefs.regole || []).map((r) => ({
          product_id: r.product_id || null,
          sector_id: r.sector_id || null,
          paesi: r.paesi || [],
          regioni: r.regioni || [],
          quantita_min: r.quantita_min === "" || r.quantita_min == null ? null : Number(r.quantita_min),
        })),
      };
      const res = await setMyListingAlertPrefs(payload);
      if (res) setPrefs(res);
      setMsg({ ok: true, testo: "Preferenze salvate." });
    } catch (e) {
      setMsg({ ok: false, testo: bachecaErrorMessage(e) });
    } finally {
      setSalvando(false);
    }
  };

  const spento = prefs.frequenza === "nessuna";
  const personalizzato = prefs.ambito === "personalizzato";
  const senzaRegole = personalizzato && (prefs.regole || []).length === 0;

  return (
    <div className="bs-card" style={{ padding: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Notifiche bacheca</div>
      <p style={{ fontSize: 13, color: C.muted, margin: "6px 0 16px" }}>
        Ricevi un avviso quando un compratore pubblica una richiesta che ti interessa.
      </p>

      <div style={sect}>Frequenza</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {FREQUENZE.map(([v, l]) => (
          <button key={v} type="button" onClick={() => set("frequenza", v)} style={pill(prefs.frequenza === v)}>{l}</button>
        ))}
      </div>
      {spento && <p style={{ fontSize: 12.5, color: C.amber, margin: "8px 0 0" }}>Con frequenza “Nessuna” non riceverai alcun avviso dalla bacheca.</p>}

      {!spento && (
        <>
          <div style={{ ...sect, marginTop: 20 }}>Cosa notificare</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={radio(prefs.ambito === "catalogo")}>
              <input type="radio" checked={prefs.ambito === "catalogo"} onChange={() => set("ambito", "catalogo")} style={{ accentColor: C.blue }} />
              <span><b>Il mio catalogo</b> — avvisami per gli annunci sui prodotti che tratto.</span>
            </label>
            <label style={radio(prefs.ambito === "personalizzato")}>
              <input type="radio" checked={prefs.ambito === "personalizzato"} onChange={() => set("ambito", "personalizzato")} style={{ accentColor: C.blue }} />
              <span><b>Regole personalizzate</b> — avvisami solo per gli annunci che rispettano le regole qui sotto.</span>
            </label>
          </div>

          {personalizzato && (
            <div style={{ marginTop: 14 }}>
              {senzaRegole && (
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>
                  Senza almeno una regola non riceverai alcuna notifica.
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {(prefs.regole || []).map((r, i) => (
                  <Regola key={i} r={r} filtri={filtri} onChange={(nr) => setRegola(i, nr)} onRemove={() => delRegola(i)} />
                ))}
              </div>
              <button type="button" onClick={addRegola} style={{ marginTop: 12, background: "#fff", color: C.dark, border: `1px dashed ${C.blue}`, borderRadius: 9, padding: "10px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                + Aggiungi regola
              </button>
            </div>
          )}
        </>
      )}

      {msg && (
        <div style={{ marginTop: 16, borderRadius: 10, padding: "10px 12px", fontSize: 13.5,
          background: msg.ok ? "#ECFDF5" : "#FEF2F2", border: `1px solid ${msg.ok ? "#A7F3D0" : "#FECACA"}`, color: msg.ok ? "#065F46" : "#991B1B" }}>
          {msg.testo}
        </div>
      )}

      <button type="button" onClick={salva} disabled={salvando} style={{ marginTop: 18, background: "#0369A1", color: "#fff", border: "none", borderRadius: 10, padding: "12px 22px", fontWeight: 700, fontSize: 14, cursor: salvando ? "default" : "pointer", opacity: salvando ? .6 : 1 }}>
        {salvando ? "Salvataggio…" : "Salva preferenze"}
      </button>
    </div>
  );
}

const sect = { fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4, marginBottom: 10 };
const pill = (on) => ({ padding: "8px 16px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${on ? C.blue : C.border}`, background: on ? C.blue : "#fff", color: on ? "#fff" : C.text });
const radio = (on) => ({ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13.5, color: C.text, cursor: "pointer", border: `1px solid ${on ? C.blue : C.border}`, borderRadius: 10, padding: "12px 14px", background: on ? "#F0F9FF" : "#fff", lineHeight: 1.4 });
