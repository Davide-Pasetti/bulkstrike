"use client";
// BulkStrikeSpecFields — renderer GENERICO dei campi tecnici della bacheca
// (DAV-78). Legge lo schema dichiarato a DB (get_listing_spec_schema) e disegna
// form, filtri e riepiloghi. NESSUN campo enologico hardcoded: aggiungendo un
// prodotto nuovo (es. olio) il backend fa una INSERT e questo componente
// funziona senza modifiche.

export const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", amber:"#D97706", red:"#DC2626", purple:"#7C3AED" };

// Unità di prezzo → etichetta leggibile.
export const PREZZO_UNITA = [
  ["eur_hl_grado", "€/hl-grado"], ["eur_hl", "€/hl"], ["eur_l", "€/l"], ["eur_kg", "€/kg"], ["eur_t", "€/t"],
];
export const prezzoUnitaLabel = (u) => (PREZZO_UNITA.find(([v]) => v === u)?.[1]) || u || "";
export const FREQUENZE = [
  ["immediata", "Immediata"], ["giornaliera", "Giornaliera"], ["settimanale", "Settimanale"], ["nessuna", "Nessuna"],
];

// Elenco paesi (coerente con la registrazione) e regioni italiane, usati nel
// wizard di pubblicazione e nei filtri geografici della bacheca.
export const COUNTRIES = ["Italia", "Francia", "Spagna", "Germania", "Portogallo", "Austria", "Grecia", "Polonia", "Cina", "Argentina", "Turchia", "Altro"];
export const REGIONI_ITALIA = ["Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche", "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana", "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto"];

const labelInput = { display:"block", fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 };
const input = { width:"100%", minWidth:0, padding:"8px 10px", border:`1px solid ${C.border}`, borderRadius:7, fontSize:13, background:"#fff", color:C.text };

function baseLabel(et) {
  return (et || "").replace(/\s*(minima|massima|min\.?|max\.?)\s*$/i, "").trim() || et;
}

// Ordina lo schema per "ordine" e accoppia i campi <x>_min/<x>_max con lo stesso
// "gruppo" in un unico item "range".
export function groupSchema(schema) {
  const campi = [...(schema || [])].sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
  const gruppi = {};
  for (const c of campi) {
    if (!c.gruppo) continue;
    gruppi[c.gruppo] = gruppi[c.gruppo] || {};
    if (/_min$/.test(c.chiave)) gruppi[c.gruppo].min = c;
    else if (/_max$/.test(c.chiave)) gruppi[c.gruppo].max = c;
  }
  const out = [], usati = new Set();
  for (const c of campi) {
    if (usati.has(c.chiave)) continue;
    const g = c.gruppo && gruppi[c.gruppo];
    if (g && g.min && g.max) {
      usati.add(g.min.chiave); usati.add(g.max.chiave);
      out.push({ kind:"range", gruppo:c.gruppo, min:g.min, max:g.max, etichetta: baseLabel(g.min.etichetta), unita: g.min.unita, ordine: g.min.ordine });
    } else {
      out.push({ kind:"field", campo:c, ordine:c.ordine });
      usati.add(c.chiave);
    }
  }
  return out.sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
}

// Riepilogo leggibile delle specs di un annuncio (per card/dettaglio):
// array di { etichetta, testo }. Usa SEMPRE le etichette dello schema.
export function renderSpecList(schema, specs) {
  const s = specs || {};
  const out = [];
  for (const it of groupSchema(schema)) {
    if (it.kind === "range") {
      const vmin = s[it.min.chiave], vmax = s[it.max.chiave];
      if (vmin == null && vmax == null) continue;
      const u = it.unita ? ` ${it.unita}` : "";
      let testo;
      if (vmin != null && vmax != null) testo = `${vmin}–${vmax}${u}`;
      else if (vmin != null) testo = `da ${vmin}${u}`;
      else testo = `fino a ${vmax}${u}`;
      out.push({ etichetta: it.etichetta, testo });
    } else {
      const c = it.campo, v = s[c.chiave];
      if (v == null || v === "" || v === false) continue;
      if (c.tipo === "flag") { out.push({ etichetta: c.etichetta, testo: "Sì" }); continue; }
      if (c.tipo === "select") {
        const opt = (c.opzioni || []).find(o => o.valore === v);
        out.push({ etichetta: c.etichetta, testo: opt?.etichetta || String(v) });
        continue;
      }
      out.push({ etichetta: c.etichetta, testo: `${v}${c.unita ? ` ${c.unita}` : ""}` });
    }
  }
  return out;
}

// ── FORM (pubblicazione): input per ogni campo dello schema. ──────────────────
// values: { [chiave]: valore }. onChange(chiave, valore).
export function SpecFormFields({ schema, values, onChange }) {
  const items = groupSchema(schema);
  if (items.length === 0) return null;
  const v = values || {};
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {items.map((it) => {
        if (it.kind === "range") {
          return (
            <div key={it.gruppo}>
              <label style={labelInput}>{it.etichetta}{it.unita ? ` (${it.unita})` : ""}</label>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <input type="number" min={it.min.min} max={it.min.max} step="any" value={v[it.min.chiave] ?? ""} placeholder="Da (min)" aria-label={it.min.etichetta}
                  onChange={(e) => onChange(it.min.chiave, e.target.value)} style={input}/>
                <span style={{ color:C.muted, fontSize:12 }}>–</span>
                <input type="number" min={it.max.min} max={it.max.max} step="any" value={v[it.max.chiave] ?? ""} placeholder="A (max)" aria-label={it.max.etichetta}
                  onChange={(e) => onChange(it.max.chiave, e.target.value)} style={input}/>
              </div>
            </div>
          );
        }
        const c = it.campo;
        if (c.tipo === "flag") {
          return (
            <label key={c.chiave} style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.text, cursor:"pointer" }}>
              <input type="checkbox" checked={!!v[c.chiave]} onChange={(e) => onChange(c.chiave, e.target.checked)} style={{ width:16, height:16, accentColor:C.blue }}/>
              {c.etichetta}{c.obbligatorio ? " *" : ""}
            </label>
          );
        }
        if (c.tipo === "select") {
          return (
            <label key={c.chiave} style={labelInput}>{c.etichetta}{c.obbligatorio ? " *" : ""}
              <select value={v[c.chiave] ?? ""} onChange={(e) => onChange(c.chiave, e.target.value)} style={{ ...input, marginTop:4 }}>
                <option value="">— Indifferente —</option>
                {(c.opzioni || []).map((o) => <option key={o.valore} value={o.valore}>{o.etichetta}</option>)}
              </select>
            </label>
          );
        }
        if (c.tipo === "numero" || c.tipo === "intero") {
          return (
            <label key={c.chiave} style={labelInput}>{c.etichetta}{c.obbligatorio ? " *" : ""}{c.unita ? ` (${c.unita})` : ""}
              <input type="number" min={c.min} max={c.max} step={c.tipo === "intero" ? 1 : "any"} value={v[c.chiave] ?? ""}
                onChange={(e) => onChange(c.chiave, e.target.value)} style={{ ...input, marginTop:4 }}/>
            </label>
          );
        }
        // testo
        return (
          <label key={c.chiave} style={labelInput}>{c.etichetta}{c.obbligatorio ? " *" : ""}
            <input type="text" maxLength={c.max_lunghezza || undefined} value={v[c.chiave] ?? ""}
              onChange={(e) => onChange(c.chiave, e.target.value)} style={{ ...input, marginTop:4 }}/>
          </label>
        );
      })}
    </div>
  );
}

// Converte i valori grezzi del form nell'oggetto "specs" da inviare a create_listing.
export function formValuesToSpecs(schema, values) {
  const v = values || {}, out = {};
  for (const c of (schema || [])) {
    const raw = v[c.chiave];
    if (raw == null || raw === "") continue;
    if (c.tipo === "flag") { if (raw) out[c.chiave] = true; continue; }
    if (c.tipo === "numero") out[c.chiave] = Number(raw);
    else if (c.tipo === "intero") out[c.chiave] = parseInt(raw, 10);
    else out[c.chiave] = raw;
  }
  return out;
}

// ── FILTRI (elenco): stesso look, ma numero/intero → intervallo, select →
// valore, flag → checkbox. `value` è lo stato opaco del filtro. ───────────────
export function SpecFilterFields({ schema, value, onChange }) {
  const items = groupSchema(schema);
  if (items.length === 0) return null;
  const v = value || {};
  const setKey = (k, val) => onChange({ ...v, [k]: val });
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {items.map((it) => {
        if (it.kind === "range") {
          const cur = v[it.gruppo] || {};
          return (
            <div key={it.gruppo}>
              <label style={labelInput}>{it.etichetta}{it.unita ? ` (${it.unita})` : ""}</label>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <input type="number" step="any" value={cur.from ?? ""} placeholder="Da" onChange={(e) => setKey(it.gruppo, { ...cur, from:e.target.value })} style={input}/>
                <span style={{ color:C.muted, fontSize:12 }}>–</span>
                <input type="number" step="any" value={cur.to ?? ""} placeholder="A" onChange={(e) => setKey(it.gruppo, { ...cur, to:e.target.value })} style={input}/>
              </div>
            </div>
          );
        }
        const c = it.campo;
        if (c.tipo === "flag") {
          return (
            <label key={c.chiave} style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.text, cursor:"pointer" }}>
              <input type="checkbox" checked={!!v[c.chiave]} onChange={(e) => setKey(c.chiave, e.target.checked)} style={{ width:16, height:16, accentColor:C.blue }}/>
              {c.etichetta}
            </label>
          );
        }
        if (c.tipo === "select") {
          return (
            <label key={c.chiave} style={labelInput}>{c.etichetta}
              <select value={v[c.chiave] ?? ""} onChange={(e) => setKey(c.chiave, e.target.value)} style={{ ...input, marginTop:4 }}>
                <option value="">Tutte</option>
                {(c.opzioni || []).map((o) => <option key={o.valore} value={o.valore}>{o.etichetta}</option>)}
              </select>
            </label>
          );
        }
        // numero/intero → intervallo
        const cur = v[c.chiave] || {};
        return (
          <div key={c.chiave}>
            <label style={labelInput}>{c.etichetta}{c.unita ? ` (${c.unita})` : ""}</label>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <input type="number" step="any" value={cur.from ?? ""} placeholder="Da" onChange={(e) => setKey(c.chiave, { ...cur, from:e.target.value })} style={input}/>
              <span style={{ color:C.muted, fontSize:12 }}>–</span>
              <input type="number" step="any" value={cur.to ?? ""} placeholder="A" onChange={(e) => setKey(c.chiave, { ...cur, to:e.target.value })} style={input}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Converte lo stato dei filtri nell'oggetto "specs" per get_bacheca_listings.
// - select → { chiave: "valore" }
// - flag   → { chiave: "true" } (solo se attivo)
// - numero/intero singolo → { chiave: {min,max} }
// - range (gruppo) → { <base>_min: {min}, <base>_max: {max} }
export function filterToSpecs(schema, value) {
  const v = value || {}, out = {};
  const items = groupSchema(schema);
  for (const it of items) {
    if (it.kind === "range") {
      const cur = v[it.gruppo] || {};
      if (cur.from !== undefined && cur.from !== "") out[it.min.chiave] = { min: Number(cur.from) };
      if (cur.to !== undefined && cur.to !== "") out[it.max.chiave] = { max: Number(cur.to) };
    } else {
      const c = it.campo;
      const raw = v[c.chiave];
      if (c.tipo === "flag") { if (raw) out[c.chiave] = "true"; continue; }
      if (c.tipo === "select") { if (raw) out[c.chiave] = raw; continue; }
      // numero/intero
      const cur = raw || {};
      const range = {};
      if (cur.from !== undefined && cur.from !== "") range.min = Number(cur.from);
      if (cur.to !== undefined && cur.to !== "") range.max = Number(cur.to);
      if (Object.keys(range).length) out[c.chiave] = range;
    }
  }
  return out;
}

export const bachecaInputStyle = input;
export const bachecaLabelStyle = labelInput;
