"use client";
// BulkStrikeProductDocs — gestore "Documenti & certificati" per un PRODOTTO canonico.
// Usato nel listino fornitore (BulkStrikeMyProducts) come pannello espandibile per prodotto.
// - SDS + Scheda tecnica: un file input ciascuno → uploadProductDoc(file, productId, 'sds'|'tds')
//   poi setProductDocuments(productId, sdsUrl, tdsUrl) mantenendo l'altro valore corrente.
// - Certificati: elenco con eliminazione + form di aggiunta (tipo, etichetta, scadenza, file).
// Gli upload finiscono in un bucket pubblico già configurato; l'URL restituito è pubblico.
import { useState, useEffect } from "react";
import { FileText, Upload, Trash2, Plus, Check, X, ExternalLink } from "lucide-react";
import {
  poolErrorMessage, uploadProductDoc, setProductDocuments,
  getProductCertificates, addProductCertificate, deleteProductCertificate,
} from "@/lib/api";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706", purple:"#7C3AED" };

const CERT_TYPES = [
  { value:"alimentare", label:"Alimentare" },
  { value:"iso", label:"ISO" },
  { value:"bio", label:"Bio" },
  { value:"kosher", label:"Kosher" },
  { value:"halal", label:"Halal" },
  { value:"altro", label:"Altro" },
];
const certTypeLabel = (t) => CERT_TYPES.find(c => c.value === t)?.label || t;

export default function BulkStrikeProductDocs({ productId, productName }) {
  const [sdsUrl, setSdsUrl] = useState(null);
  const [tdsUrl, setTdsUrl] = useState(null);
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(""); // 'sds' | 'tds' | 'cert' | ''

  // Form nuovo certificato.
  const [certType, setCertType] = useState("alimentare");
  const [certLabel, setCertLabel] = useState("");
  const [certExpiry, setCertExpiry] = useState("");
  const [certFile, setCertFile] = useState(null);

  useEffect(() => { loadCerts(); }, [productId]);

  async function loadCerts() {
    setLoading(true);
    try {
      const rows = await getProductCertificates(productId);
      setCerts(rows);
    } catch (e) { setErr(poolErrorMessage(e)); }
    setLoading(false);
  }

  // Carica SDS o Scheda tecnica: sostituisce solo il valore modificato, mantenendo l'altro.
  async function handleDoc(e, kind) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return; // annullato / nessun file
    setErr(""); setOkMsg(""); setBusy(kind);
    try {
      const url = await uploadProductDoc(file, productId, kind);
      const nextSds = kind === "sds" ? url : sdsUrl;
      const nextTds = kind === "tds" ? url : tdsUrl;
      await setProductDocuments(productId, nextSds, nextTds);
      setSdsUrl(nextSds); setTdsUrl(nextTds);
      setOkMsg(kind === "sds" ? "Scheda di sicurezza caricata." : "Scheda tecnica caricata.");
    } catch (e2) { setErr(poolErrorMessage(e2)); }
    finally { setBusy(""); }
  }

  async function handleAddCert() {
    if (!certFile) { setErr("Seleziona un file per il certificato."); return; }
    setErr(""); setOkMsg(""); setBusy("cert");
    try {
      const url = await uploadProductDoc(certFile, productId, "cert");
      await addProductCertificate(productId, certType, certLabel || null, url, certExpiry || null);
      setCertType("alimentare"); setCertLabel(""); setCertExpiry(""); setCertFile(null);
      await loadCerts();
      setOkMsg("Certificato aggiunto.");
    } catch (e) { setErr(poolErrorMessage(e)); }
    finally { setBusy(""); }
  }

  async function handleDeleteCert(id) {
    if (!window.confirm("Eliminare questo certificato?")) return;
    setErr(""); setOkMsg("");
    try { await deleteProductCertificate(id); await loadCerts(); }
    catch (e) { setErr(poolErrorMessage(e)); }
  }

  const linkStyle = { display:"inline-flex", alignItems:"center", gap:6, fontSize:12.5, color:C.blue, fontWeight:600, textDecoration:"none" };
  const btnStyle = { background:"transparent", color:C.muted, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 13px", fontSize:12.5, fontWeight:600, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6, fontFamily:"'Inter',system-ui" };

  return (
    <div style={{ border:`1px dashed ${C.border}`, borderRadius:10, padding:"14px 16px", background:C.bg, marginTop:4 }}>
      <div style={{ fontSize:13, fontWeight:700, marginBottom:12, display:"flex", alignItems:"center", gap:7 }}>
        <FileText size={15} color={C.blue}/> Documenti & certificati {productName ? <span style={{ color:C.muted, fontWeight:500 }}>· {productName}</span> : null}
      </div>

      {err && <div style={{ marginBottom:12, padding:"9px 12px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8, fontSize:12.5, color:C.red }}>{err}</div>}
      {okMsg && <div style={{ marginBottom:12, padding:"9px 12px", background:"#ECFDF5", border:"1px solid #A7F3D0", borderRadius:8, fontSize:12.5, color:C.green }}>{okMsg}</div>}

      {/* SDS + Scheda tecnica */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:12, marginBottom:16 }}>
        <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:9, padding:"11px 13px" }}>
          <div style={{ fontSize:12, fontWeight:700, marginBottom:6 }}>Scheda di sicurezza (SDS)</div>
          {sdsUrl && <a href={sdsUrl} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, marginBottom:8 }}><ExternalLink size={13}/> File corrente</a>}
          <label style={{ ...btnStyle, cursor: busy === "sds" ? "default" : "pointer", opacity: busy === "sds" ? 0.6 : 1, marginTop: sdsUrl ? 4 : 0 }}>
            <Upload size={13}/> {busy === "sds" ? "Caricamento…" : (sdsUrl ? "Sostituisci" : "Carica SDS")}
            <input type="file" onChange={e => handleDoc(e, "sds")} disabled={busy === "sds"} style={{ display:"none" }} />
          </label>
        </div>
        <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:9, padding:"11px 13px" }}>
          <div style={{ fontSize:12, fontWeight:700, marginBottom:6 }}>Scheda tecnica</div>
          {tdsUrl && <a href={tdsUrl} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, marginBottom:8 }}><ExternalLink size={13}/> File corrente</a>}
          <label style={{ ...btnStyle, cursor: busy === "tds" ? "default" : "pointer", opacity: busy === "tds" ? 0.6 : 1, marginTop: tdsUrl ? 4 : 0 }}>
            <Upload size={13}/> {busy === "tds" ? "Caricamento…" : (tdsUrl ? "Sostituisci" : "Carica scheda tecnica")}
            <input type="file" onChange={e => handleDoc(e, "tds")} disabled={busy === "tds"} style={{ display:"none" }} />
          </label>
        </div>
      </div>

      {/* Elenco certificati */}
      <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Certificati</div>
      {loading ? (
        <div style={{ fontSize:12.5, color:C.muted, marginBottom:12 }}>Caricamento…</div>
      ) : certs.length === 0 ? (
        <div style={{ fontSize:12.5, color:C.muted, marginBottom:12 }}>Nessun certificato caricato.</div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:12 }}>
          {certs.map(c => (
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", background:"#fff", border:`1px solid ${C.border}`, borderRadius:9, padding:"9px 12px" }}>
              <div style={{ flex:1, minWidth:160 }}>
                <div style={{ fontSize:12.5, fontWeight:700 }}>
                  {certTypeLabel(c.cert_type)}{c.label ? <span style={{ color:C.muted, fontWeight:500 }}> · {c.label}</span> : null}
                </div>
                <div style={{ fontSize:11.5, color:C.muted }}>
                  {c.expiry_date ? <>Scad. {new Date(c.expiry_date).toLocaleDateString("it-IT")}</> : "Senza scadenza"}
                </div>
              </div>
              {c.file_url && <a href={c.file_url} target="_blank" rel="noopener noreferrer" style={linkStyle}><ExternalLink size={13}/> Apri</a>}
              <button onClick={() => handleDeleteCert(c.id)} title="Elimina" style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:32, height:32, cursor:"pointer", color:C.red, display:"flex", alignItems:"center", justifyContent:"center" }}><Trash2 size={13}/></button>
            </div>
          ))}
        </div>
      )}

      {/* Form aggiungi certificato */}
      <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:9, padding:"12px 13px" }}>
        <div style={{ fontSize:12, fontWeight:700, marginBottom:10 }}>Aggiungi certificato</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:10, marginBottom:10 }}>
          <div>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, marginBottom:4 }}>Tipo</label>
            <select value={certType} onChange={e => setCertType(e.target.value)} style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 10px", fontSize:13, background:"#fff", color:C.text, fontFamily:"'Inter',system-ui" }}>
              {CERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, marginBottom:4 }}>Etichetta {certType === "altro" ? "(consigliata)" : "(facoltativa)"}</label>
            <input value={certLabel} onChange={e => setCertLabel(e.target.value)} placeholder={certType === "altro" ? "Es. GMP+" : ""} style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 10px", fontSize:13, outline:"none", fontFamily:"'Inter',system-ui" }} />
          </div>
          <div>
            <label style={{ display:"block", fontSize:11, fontWeight:600, color:C.muted, marginBottom:4 }}>Scadenza (facoltativa)</label>
            <input type="date" value={certExpiry} onChange={e => setCertExpiry(e.target.value)} style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 10px", fontSize:13, outline:"none", fontFamily:"'Inter',system-ui" }} />
          </div>
        </div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <label style={{ background:"transparent", color: certFile ? C.green : C.muted, border:`1px solid ${certFile ? "#A7F3D0" : C.border}`, borderRadius:8, padding:"9px 13px", fontSize:12.5, fontWeight:600, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6, fontFamily:"'Inter',system-ui" }}>
            <Upload size={13}/> {certFile ? certFile.name : "Scegli file"}
            <input type="file" onChange={e => setCertFile(e.target.files?.[0] || null)} style={{ display:"none" }} />
          </label>
          {certFile && <button onClick={() => setCertFile(null)} title="Rimuovi file scelto" style={{ background:"none", border:"none", cursor:"pointer", color:C.muted, display:"inline-flex" }}><X size={15}/></button>}
          <button onClick={handleAddCert} disabled={busy === "cert" || !certFile}
                  style={{ background:"#0369A1", color:"#fff", border:"none", borderRadius:8, padding:"9px 16px", fontSize:12.5, fontWeight:700, cursor:(busy === "cert" || !certFile) ? "default" : "pointer", opacity:(busy === "cert" || !certFile) ? 0.5 : 1, display:"inline-flex", alignItems:"center", gap:6, fontFamily:"'Inter',system-ui" }}>
            {busy === "cert" ? "Aggiunta…" : <><Plus size={14}/> Aggiungi certificato</>}
          </button>
        </div>
      </div>
    </div>
  );
}
