"use client";
// BulkStrikeMyProducts — LISTINO del fornitore (/i-miei-prodotti).
// Qui il fornitore gestisce i prodotti che vende, con scaglioni di prezzo,
// formati di vendita (unità) e varianti (granulometria, purezza, colore...).
// Ogni riga supplier_products è una VARIANTE: uno stesso prodotto può avere
// più righe (es. fine vs grossa). Gli attributi di variante non sono visibili
// ai clienti finché un admin non li verifica (variant_status).
//
// Novità di questa versione:
// - Import listino da PDF con AI: la edge function parse-supplier-price-list
//   (gemella di parse-carrier-price-list) interpreta qualsiasi formato di
//   listino e propone le righe; qui vengono abbinate ai prodotti del catalogo
//   e riviste prima del salvataggio. Nessun salvataggio automatico.
// - Duplicazione one-click di una variante (con scaglioni inclusi).
import { useState, useEffect, useMemo } from "react";
import { Plus, X, Check, Trash2, Pencil, AlertTriangle, Layers, Search, ChevronRight, Clock, Package, ShieldCheck, Copy, FileUp } from "lucide-react";
import {
  getSession, getMyCompany, poolErrorMessage, searchProducts,
  getMySupplierListings, addSupplierProductVariant, updateSupplierProductVariant,
  deleteSupplierProductVariant, setSupplierProductTiers,
} from "@/lib/api";
import { supabase } from "@/lib/supabase"; // per invocare la edge function del PDF senza toccare lib/api
import BulkStrikeNav from "@/components/BulkStrikeNav";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626", amber:"#D97706", purple:"#7C3AED" };
const eurKg = (n) => n == null ? "—" : "€" + Number(n).toLocaleString("it-IT", { minimumFractionDigits:2, maximumFractionDigits:2 });

function StatusBadge({ status, note }) {
  if (status === "approved") return <span className="mp-chip" style={{ background:"#ECFDF5", color:C.green }}><Check size={11}/> Verificata</span>;
  if (status === "rejected") return <span className="mp-chip" title={note || ""} style={{ background:"#FEF2F2", color:C.red }}><AlertTriangle size={11}/> Non approvata</span>;
  return <span className="mp-chip" style={{ background:"#FFFBEB", color:C.amber }}><Clock size={11}/> In verifica</span>;
}

const emptyFormat = () => ({ label:"sacco", size_kg:25 });
const emptyAttr = () => ({ key:"", value:"" });
const emptyTier = () => ({ min_kg:"", max_kg:"", price_per_kg:"" });

export default function MyProductsPage({ inShell = false }) {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [notSupplier, setNotSupplier] = useState(false);
  const [listings, setListings] = useState([]);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = nuova variante
  const [formProduct, setFormProduct] = useState(null); // { id, canonical_name } — solo per una nuova variante
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [grade, setGrade] = useState("");
  const [origin, setOrigin] = useState("");
  const [minOrderKg, setMinOrderKg] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [certifications, setCertifications] = useState("");
  const [formats, setFormats] = useState([emptyFormat()]);
  const [attributes, setAttributes] = useState([]);
  const [tiers, setTiers] = useState([emptyTier()]);
  const [saving, setSaving] = useState(false);

  // ---- Import da PDF (AI) ----
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfRows, setPdfRows] = useState([]); // righe proposte da rivedere prima dell'import
  const [importing, setImporting] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const session = await getSession().catch(() => null);
    if (!session) { setNeedLogin(true); setLoading(false); return; }
    try {
      const company = await getMyCompany();
      if (!company?.is_supplier) { setNotSupplier(true); setLoading(false); return; }
      const rows = await getMySupplierListings();
      setListings(rows);
    } catch (e) { setErr(poolErrorMessage(e)); }
    setLoading(false);
  }

  const grouped = useMemo(() => {
    const map = new Map();
    for (const l of listings) {
      const pid = l.product?.id || "?";
      if (!map.has(pid)) map.set(pid, { product: l.product, variants: [] });
      map.get(pid).variants.push(l);
    }
    return [...map.values()];
  }, [listings]);

  useEffect(() => {
    const q = productQuery.trim();
    if (q.length < 2) { setProductResults([]); return; }
    const t = setTimeout(() => { searchProducts(q).then(setProductResults).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [productQuery]);

  function resetForm() {
    setFormProduct(null); setProductQuery(""); setProductResults([]);
    setGrade(""); setOrigin(""); setMinOrderKg(""); setLeadTimeDays(""); setCertifications("");
    setFormats([emptyFormat()]);
    setAttributes([]);
    setTiers([emptyTier()]);
    setEditingId(null);
  }

  function openAddForm(presetProduct = null) {
    resetForm();
    if (presetProduct) { setFormProduct(presetProduct); setProductQuery(presetProduct.canonical_name || presetProduct.name || ""); }
    setShowForm(true);
    setErr(""); setOkMsg("");
  }

  function openEditForm(v) {
    setEditingId(v.id);
    setFormProduct(v.product);
    setGrade(v.grade || "");
    setOrigin(v.origin || "");
    setMinOrderKg(v.min_order_kg ?? "");
    setLeadTimeDays(v.lead_time_days ?? "");
    setCertifications((v.certifications || []).join(", "));
    setFormats(v.available_formats?.length ? v.available_formats.map(f => ({ label:f.label, size_kg:f.size_kg })) : [emptyFormat()]);
    setAttributes(Object.entries(v.variant_attributes || {}).map(([key,value]) => ({ key, value })));
    setTiers(v.price_tiers?.length ? v.price_tiers.map(t => ({ min_kg:t.min_kg, max_kg:t.max_kg ?? "", price_per_kg:t.price_per_kg })) : [emptyTier()]);
    setShowForm(true);
    setErr(""); setOkMsg("");
  }

  async function handleSave() {
    setErr(""); setOkMsg("");
    if (!editingId && !formProduct) { setErr("Seleziona un prodotto dal catalogo."); return; }
    const validTiers = tiers.filter(t => t.min_kg !== "" && t.price_per_kg !== "").map(t => ({
      min_kg: Number(t.min_kg), max_kg: t.max_kg === "" ? null : Number(t.max_kg), price_per_kg: Number(t.price_per_kg),
    }));
    if (validTiers.length === 0) { setErr("Inserisci almeno uno scaglione di prezzo (kg minimo e prezzo)."); return; }
    const validFormats = formats.filter(f => f.label && f.size_kg).map(f => ({ label:f.label, size_kg:Number(f.size_kg) }));
    const attrObj = Object.fromEntries(attributes.filter(a => a.key && a.value).map(a => [a.key.trim(), a.value.trim()]));

    const payload = {
      grade: grade || null,
      origin: origin || null,
      min_order_kg: minOrderKg === "" ? null : Number(minOrderKg),
      lead_time_days: leadTimeDays === "" ? null : Number(leadTimeDays),
      certifications: certifications.split(",").map(s => s.trim()).filter(Boolean),
      available_formats: validFormats.length ? validFormats : [emptyFormat()],
      variant_attributes: attrObj,
    };

    setSaving(true);
    try {
      let spId = editingId;
      if (editingId) {
        await updateSupplierProductVariant(editingId, payload);
      } else {
        const row = await addSupplierProductVariant(formProduct.id, payload);
        spId = row.id;
      }
      await setSupplierProductTiers(spId, validTiers);
      await load();
      setShowForm(false);
      resetForm();
      setOkMsg(Object.keys(attrObj).length > 0
        ? "Salvato. Gli attributi di variante saranno visibili ai clienti dopo la verifica."
        : "Salvato.");
    } catch (e) { setErr(poolErrorMessage(e)); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!window.confirm("Eliminare questa variante? L'azione non si può annullare.")) return;
    setErr(""); setOkMsg("");
    try { await deleteSupplierProductVariant(id); await load(); setOkMsg("Eliminata."); }
    catch (e) { setErr(poolErrorMessage(e)); }
  }

  // ---- DUPLICAZIONE one-click: copia variante + scaglioni, pronta da modificare ----
  async function handleDuplicate(v) {
    setErr(""); setOkMsg("");
    if (!v.product?.id) { setErr("Prodotto della variante non riconosciuto."); return; }
    try {
      const payload = {
        grade: v.grade ? `${v.grade} (copia)` : "Copia",
        origin: v.origin || null,
        min_order_kg: v.min_order_kg ?? null,
        lead_time_days: v.lead_time_days ?? null,
        certifications: v.certifications || [],
        available_formats: v.available_formats?.length ? v.available_formats.map(f => ({ label:f.label, size_kg:Number(f.size_kg) })) : [emptyFormat()],
        variant_attributes: v.variant_attributes || {},
      };
      const row = await addSupplierProductVariant(v.product.id, payload);
      const dupTiers = (v.price_tiers || []).map(t => ({ min_kg:Number(t.min_kg), max_kg:t.max_kg == null ? null : Number(t.max_kg), price_per_kg:Number(t.price_per_kg) }));
      if (dupTiers.length) await setSupplierProductTiers(row.id, dupTiers);
      await load();
      setOkMsg("Variante duplicata (con scaglioni): aprila con la matita per modificarla.");
    } catch (e) { setErr(poolErrorMessage(e)); }
  }

  // ---- IMPORT DA PDF (AI) ----

  // Abbina il nome letto dal PDF a un prodotto del catalogo: prova il nome
  // completo, poi le prime 2 parole, poi la prima. Match esatto se possibile.
  async function findProductFor(name) {
    const clean = (name || "").trim();
    if (!clean) return null;
    const words = clean.split(/\s+/);
    const tries = [clean, words.slice(0, 2).join(" "), words[0]];
    for (const t of tries) {
      if (!t || t.length < 2) continue;
      const res = await searchProducts(t).catch(() => []);
      if (res.length) {
        const exact = res.find(r => (r.canonical_name || "").trim().toLowerCase() === clean.toLowerCase());
        return exact || res[0];
      }
    }
    return null;
  }

  async function handlePdfFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(""); setOkMsg(""); setPdfParsing(true); setPdfRows([]);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1]);
        r.onerror = () => rej(new Error("Lettura file non riuscita"));
        r.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("parse-supplier-price-list", { body: { pdfBase64: base64 } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const parsed = data?.products || [];
      if (!parsed.length) { setErr("Nessun prodotto riconosciuto nel PDF."); setPdfParsing(false); return; }
      const rows = [];
      for (const p of parsed) {
        const matched = await findProductFor(p.product_name);
        rows.push({
          include: true,
          source_name: p.product_name || "?",
          product: matched, // { id, canonical_name } | null → da abbinare a mano
          q: "", qResults: [],
          grade: p.grade || "",
          origin: p.origin || "",
          min_order_kg: p.min_order_kg ?? "",
          lead_time_days: p.lead_time_days ?? "",
          format_label: p.format_label || "sacco",
          format_size_kg: p.format_size_kg ?? 25,
          tiers: (p.tiers?.length ? p.tiers : [{ min_kg:0, max_kg:null, price_per_kg:"" }]).map(t => ({
            min_kg: t.min_kg ?? 0, max_kg: t.max_kg ?? "", price_per_kg: t.price_per_kg ?? "",
          })),
        });
      }
      setPdfRows(rows);
    } catch (e2) { setErr("Lettura PDF non riuscita: " + (e2?.message || e2)); }
    setPdfParsing(false);
  }

  const updatePdfRow = (i, patch) => setPdfRows(p => p.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const updatePdfTier = (i, j, patch) => setPdfRows(p => p.map((r, idx) => idx === i ? { ...r, tiers: r.tiers.map((t, tj) => tj === j ? { ...t, ...patch } : t) } : r));
  const addPdfTier = (i) => setPdfRows(p => p.map((r, idx) => idx === i ? { ...r, tiers: [...r.tiers, emptyTier()] } : r));
  const removePdfTier = (i, j) => setPdfRows(p => p.map((r, idx) => idx === i ? { ...r, tiers: r.tiers.filter((_, tj) => tj !== j) } : r));

  const setRowQuery = (i, q) => {
    updatePdfRow(i, { q });
    if (q.trim().length >= 2) searchProducts(q).then(res => updatePdfRow(i, { qResults: res })).catch(() => {});
    else updatePdfRow(i, { qResults: [] });
  };

  async function handleImportRows() {
    setErr(""); setOkMsg("");
    const selected = pdfRows.filter(r => r.include);
    if (!selected.length) { setErr("Nessuna riga selezionata."); return; }
    const unmatched = selected.filter(r => !r.product);
    if (unmatched.length) { setErr(`${unmatched.length} righe selezionate non hanno un prodotto abbinato: abbinale o deselezionale.`); return; }
    setImporting(true);
    let ok = 0, ko = 0;
    for (const r of selected) {
      try {
        const validTiers = (r.tiers || []).filter(t => t.min_kg !== "" && t.price_per_kg !== "" && t.price_per_kg != null).map(t => ({
          min_kg: Number(t.min_kg), max_kg: t.max_kg === "" || t.max_kg == null ? null : Number(t.max_kg), price_per_kg: Number(t.price_per_kg),
        }));
        if (!validTiers.length) { ko++; continue; }
        const payload = {
          grade: r.grade || null,
          origin: r.origin || null,
          min_order_kg: r.min_order_kg === "" || r.min_order_kg == null ? null : Number(r.min_order_kg),
          lead_time_days: r.lead_time_days === "" || r.lead_time_days == null ? null : Number(r.lead_time_days),
          certifications: [],
          available_formats: [{ label: r.format_label || "sacco", size_kg: Number(r.format_size_kg) || 25 }],
          variant_attributes: {},
        };
        const row = await addSupplierProductVariant(r.product.id, payload);
        await setSupplierProductTiers(row.id, validTiers);
        ok++;
      } catch (e) { ko++; }
    }
    setImporting(false);
    setPdfRows([]);
    await load();
    setOkMsg(`Import completato: ${ok} ${ok === 1 ? "listino creato" : "listini creati"}${ko ? `, ${ko} scartati (prezzi mancanti o errore)` : ""}.`);
  }

  const addFormatRow = () => setFormats(p => [...p, emptyFormat()]);
  const removeFormatRow = (i) => setFormats(p => p.filter((_,idx) => idx !== i));
  const updateFormatRow = (i, patch) => setFormats(p => p.map((f,idx) => idx === i ? { ...f, ...patch } : f));

  const addAttrRow = () => setAttributes(p => [...p, emptyAttr()]);
  const removeAttrRow = (i) => setAttributes(p => p.filter((_,idx) => idx !== i));
  const updateAttrRow = (i, patch) => setAttributes(p => p.map((a,idx) => idx === i ? { ...a, ...patch } : a));

  const addTierRow = () => setTiers(p => [...p, emptyTier()]);
  const removeTierRow = (i) => setTiers(p => p.filter((_,idx) => idx !== i));
  const updateTierRow = (i, patch) => setTiers(p => p.map((t,idx) => idx === i ? { ...t, ...patch } : t));

  return (
    <div style={{ background:"#fff", color:C.text, fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", colorScheme:"light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .mp-num { font-family:'JetBrains Mono',monospace; }
        .mp-card { border:1px solid ${C.border}; border-radius:14px; padding:18px; background:#fff; }
        .mp-chip { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; border-radius:100px; padding:3px 9px; }
        .mp-input { width:100%; border:1px solid ${C.border}; border-radius:8px; padding:9px 11px; font-size:13.5px; outline:none; font-family:'Inter',system-ui; background:#fff; color:${C.text}; }
        .mp-input:focus { border-color:${C.blue}; }
        .mp-label { display:block; font-size:11.5px; font-weight:600; color:${C.muted}; margin-bottom:5px; }
        .mp-btn { background:${C.blue}; color:#fff; border:none; border-radius:9px; padding:11px 20px; font-size:14px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:7px; font-family:'Inter',system-ui; }
        .mp-btn:disabled { opacity:0.5; cursor:default; }
        .mp-btn-out { background:transparent; color:${C.muted}; border:1px solid ${C.border}; border-radius:9px; padding:11px 18px; font-size:14px; font-weight:600; cursor:pointer; font-family:'Inter',system-ui; display:inline-flex; align-items:center; gap:7px; }
        .mp-row-grid { display:grid; grid-template-columns:1fr 1fr 1fr auto; gap:8px; align-items:end; margin-bottom:8px; }
        @media (max-width:700px) { .mp-row-grid { grid-template-columns:1fr 1fr !important; } .mp-nav-links { display:none !important; } }
      `}</style>

      {!inShell && <BulkStrikeNav />}

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"22px 20px 60px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:C.muted, marginBottom:18 }}>
          <span onClick={() => { window.location.href = "/dashboard"; }} style={{ cursor:"pointer" }}>Dashboard</span><ChevronRight size={13}/>
          <span style={{ color:C.text, fontWeight:600 }}>Listino</span>
        </div>

        {loading ? (
          <div style={{ padding:"60px 0", textAlign:"center", color:C.muted }}>Caricamento…</div>
        ) : needLogin ? (
          <div style={{ padding:"50px 20px", textAlign:"center", border:`1px solid ${C.border}`, borderRadius:14 }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Accedi per gestire il tuo listino</div>
            <button onClick={() => { window.location.href = "/login"; }} className="mp-btn">Accedi</button>
          </div>
        ) : notSupplier ? (
          <div style={{ padding:"50px 20px", textAlign:"center", border:`1px solid ${C.border}`, borderRadius:14 }}>
            <ShieldCheck size={30} color={C.border} style={{ marginBottom:10 }}/>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>Sezione riservata ai fornitori</div>
            <div style={{ fontSize:14, color:C.muted }}>Il tuo account non è registrato come fornitore su BulkStrike.</div>
          </div>
        ) : (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, flexWrap:"wrap", gap:10 }}>
              <h1 style={{ fontSize:26, fontWeight:800, letterSpacing:"-0.02em" }}>Listino</h1>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <label className="mp-btn-out" style={{ color:C.purple, borderColor:"#DDD6FE", cursor: pdfParsing ? "default" : "pointer", opacity: pdfParsing ? 0.6 : 1 }}>
                  <FileUp size={15}/> {pdfParsing ? "Lettura PDF in corso…" : "Importa da PDF (AI)"}
                  <input type="file" accept="application/pdf" onChange={handlePdfFile} disabled={pdfParsing} style={{ display:"none" }} />
                </label>
                {!showForm && <button onClick={() => openAddForm()} className="mp-btn"><Plus size={16}/> Aggiungi prodotto</button>}
              </div>
            </div>
            <p style={{ fontSize:13.5, color:C.muted, marginBottom:20, maxWidth:680 }}>
              Ogni prodotto può avere più varianti (es. granulometria, purezza, colore diversi), ognuna con il proprio prezzo e formato di vendita. Puoi anche caricare il tuo listino in PDF: l'AI lo interpreta e ti propone le righe da confermare. Gli attributi di variante compaiono ai clienti solo dopo una verifica.
            </p>

            {err && <div style={{ marginBottom:16, padding:"10px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:9, fontSize:13, color:C.red }}>{err}</div>}
            {okMsg && <div style={{ marginBottom:16, padding:"10px 14px", background:"#ECFDF5", border:"1px solid #A7F3D0", borderRadius:9, fontSize:13, color:C.green }}>{okMsg}</div>}

            {/* ── REVISIONE IMPORT PDF ── */}
            {pdfRows.length > 0 && (
              <div className="mp-card" style={{ marginBottom:24, borderColor:"#DDD6FE" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, flexWrap:"wrap", gap:8 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:C.purple }}>Listino letto dal PDF — {pdfRows.length} prodotti da rivedere</div>
                  <button onClick={() => setPdfRows([])} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted }}><X size={18}/></button>
                </div>
                <p style={{ fontSize:12.5, color:C.muted, margin:"0 0 14px" }}>
                  Controlla l'abbinamento al catalogo e i prezzi, deseleziona quello che non vuoi importare, poi conferma. Nulla viene salvato prima della conferma.
                </p>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {pdfRows.map((r, i) => (
                    <div key={i} style={{ border:`1px solid ${r.include ? C.border : "#F1F5F9"}`, borderRadius:10, padding:"12px 14px", opacity: r.include ? 1 : 0.55 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:10 }}>
                        <input type="checkbox" checked={r.include} onChange={e => updatePdfRow(i, { include: e.target.checked })} style={{ accentColor:C.purple, width:16, height:16, flexShrink:0 }} />
                        <span style={{ fontSize:13.5, fontWeight:700 }}>{r.source_name}</span>
                        <span style={{ fontSize:11.5, color:C.muted }}>dal PDF</span>
                        {r.product ? (
                          <span className="mp-chip" style={{ background:"#ECFDF5", color:C.green }}>
                            <Check size={11}/> {r.product.canonical_name}
                            <X size={11} style={{ cursor:"pointer", marginLeft:2 }} onClick={() => updatePdfRow(i, { product:null })} />
                          </span>
                        ) : (
                          <span className="mp-chip" style={{ background:"#FEF2F2", color:C.red }}><AlertTriangle size={11}/> Da abbinare al catalogo</span>
                        )}
                      </div>

                      {!r.product && (
                        <div style={{ marginBottom:10, position:"relative", maxWidth:420 }}>
                          <Search size={14} color={C.muted} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)" }}/>
                          <input className="mp-input" style={{ paddingLeft:32 }} value={r.q} onChange={e => setRowQuery(i, e.target.value)} placeholder="Cerca il prodotto nel catalogo…" />
                          {r.qResults.length > 0 && (
                            <div style={{ border:`1px solid ${C.border}`, borderRadius:8, marginTop:5, maxHeight:170, overflowY:"auto", background:"#fff" }}>
                              {r.qResults.map(p => (
                                <div key={p.id} onClick={() => updatePdfRow(i, { product:p, qResults:[], q:"" })} style={{ padding:"8px 11px", cursor:"pointer", borderBottom:`1px solid ${C.border}`, fontSize:13 }}>
                                  {p.canonical_name} {p.e_number && <span style={{ color:C.muted }}>· {p.e_number}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:8, marginBottom:10 }}>
                        <div><label className="mp-label">Grade</label><input className="mp-input" value={r.grade} onChange={e => updatePdfRow(i, { grade:e.target.value })} placeholder="Es. Food Grade" /></div>
                        <div><label className="mp-label">Origine</label><input className="mp-input" value={r.origin} onChange={e => updatePdfRow(i, { origin:e.target.value })} placeholder="Es. Italia" /></div>
                        <div><label className="mp-label">Ordine min (kg)</label><input className="mp-input" type="number" value={r.min_order_kg} onChange={e => updatePdfRow(i, { min_order_kg:e.target.value })} /></div>
                        <div><label className="mp-label">Preparazione (gg)</label><input className="mp-input" type="number" value={r.lead_time_days} onChange={e => updatePdfRow(i, { lead_time_days:e.target.value })} /></div>
                        <div><label className="mp-label">Formato</label><input className="mp-input" value={r.format_label} onChange={e => updatePdfRow(i, { format_label:e.target.value })} placeholder="sacco" /></div>
                        <div><label className="mp-label">kg per unità</label><input className="mp-input" type="number" value={r.format_size_kg} onChange={e => updatePdfRow(i, { format_size_kg:e.target.value })} /></div>
                      </div>

                      <label className="mp-label">Scaglioni (kg min · kg max · €/kg)</label>
                      {r.tiers.map((t, j) => (
                        <div key={j} className="mp-row-grid">
                          <input className="mp-input" type="number" value={t.min_kg} onChange={e => updatePdfTier(i, j, { min_kg:e.target.value })} placeholder="kg min" />
                          <input className="mp-input" type="number" value={t.max_kg} onChange={e => updatePdfTier(i, j, { max_kg:e.target.value })} placeholder="kg max (vuoto = ∞)" />
                          <input className="mp-input" type="number" step="0.01" value={t.price_per_kg} onChange={e => updatePdfTier(i, j, { price_per_kg:e.target.value })} placeholder="€/kg" />
                          <button onClick={() => removePdfTier(i, j)} disabled={r.tiers.length===1} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:36, height:36, cursor:r.tiers.length===1?"default":"pointer", color:C.muted, opacity:r.tiers.length===1?0.4:1 }}><Trash2 size={14}/></button>
                        </div>
                      ))}
                      <button onClick={() => addPdfTier(i)} style={{ background:"none", border:"none", color:C.blue, fontSize:12.5, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:5, padding:0 }}><Plus size={13}/> Aggiungi scaglione</button>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:10, marginTop:16, flexWrap:"wrap" }}>
                  <button onClick={handleImportRows} disabled={importing} className="mp-btn" style={{ background:C.purple }}>
                    <Check size={16}/> {importing ? "Import in corso…" : `Importa ${pdfRows.filter(r => r.include).length} selezionati`}
                  </button>
                  <button onClick={() => setPdfRows([])} className="mp-btn-out">Annulla</button>
                </div>
              </div>
            )}

            {/* FORM aggiungi/modifica */}
            {showForm && (
              <div className="mp-card" style={{ marginBottom:24, borderColor:C.blue }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <div style={{ fontSize:15, fontWeight:700 }}>{editingId ? "Modifica variante" : "Nuova variante"}</div>
                  <button onClick={() => { setShowForm(false); resetForm(); }} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted }}><X size={18}/></button>
                </div>

                {/* PRODOTTO */}
                {editingId ? (
                  <div style={{ marginBottom:16 }}>
                    <label className="mp-label">Prodotto</label>
                    <div style={{ fontSize:14, fontWeight:700 }}>{formProduct?.canonical_name}</div>
                  </div>
                ) : (
                  <div style={{ marginBottom:16, position:"relative" }}>
                    <label className="mp-label">Prodotto dal catalogo *</label>
                    {formProduct ? (
                      <div style={{ display:"flex", alignItems:"center", gap:8, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 11px" }}>
                        <Package size={15} color={C.blue}/>
                        <span style={{ fontSize:13.5, fontWeight:700, flex:1 }}>{formProduct.canonical_name}</span>
                        <button onClick={() => { setFormProduct(null); setProductQuery(""); }} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted }}><X size={15}/></button>
                      </div>
                    ) : (
                      <>
                        <div style={{ position:"relative" }}>
                          <Search size={15} color={C.muted} style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)" }}/>
                          <input className="mp-input" style={{ paddingLeft:34 }} value={productQuery} onChange={e => setProductQuery(e.target.value)} placeholder="Cerca un prodotto per nome, CAS o numero E…" />
                        </div>
                        {productResults.length > 0 && (
                          <div style={{ border:`1px solid ${C.border}`, borderRadius:8, marginTop:6, maxHeight:220, overflowY:"auto" }}>
                            {productResults.map(p => (
                              <div key={p.id} onClick={() => { setFormProduct(p); setProductResults([]); }} style={{ padding:"9px 12px", cursor:"pointer", borderBottom:`1px solid ${C.border}`, fontSize:13.5 }}>
                                {p.canonical_name} {p.e_number && <span style={{ color:C.muted }}>· {p.e_number}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* CAMPI BASE */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                  <div>
                    <label className="mp-label">Grade / qualità (testo libero)</label>
                    <input className="mp-input" value={grade} onChange={e => setGrade(e.target.value)} placeholder="Es. Food Grade, Tecnico 98,9%" />
                  </div>
                  <div>
                    <label className="mp-label">Origine</label>
                    <input className="mp-input" value={origin} onChange={e => setOrigin(e.target.value)} placeholder="Es. Italia" />
                  </div>
                  <div>
                    <label className="mp-label">Ordine minimo (kg) — vuoto = 1 unità</label>
                    <input className="mp-input" type="number" value={minOrderKg} onChange={e => setMinOrderKg(e.target.value)} placeholder="Es. 500" />
                  </div>
                  <div>
                    <label className="mp-label">Giorni di preparazione ordine</label>
                    <input className="mp-input" type="number" value={leadTimeDays} onChange={e => setLeadTimeDays(e.target.value)} placeholder="Es. 7" />
                  </div>
                  <div style={{ gridColumn:"1 / -1" }}>
                    <label className="mp-label">Certificazioni (separate da virgola)</label>
                    <input className="mp-input" value={certifications} onChange={e => setCertifications(e.target.value)} placeholder="Es. ISO 9001, Food Grade, Kosher" />
                  </div>
                </div>

                {/* FORMATI */}
                <div style={{ marginBottom:16 }}>
                  <label className="mp-label">Formati di vendita — a quante unità corrisponde 1 pezzo</label>
                  {formats.map((f,i) => (
                    <div key={i} className="mp-row-grid" style={{ gridTemplateColumns:"1fr 1fr auto" }}>
                      <input className="mp-input" value={f.label} onChange={e => updateFormatRow(i, { label:e.target.value })} placeholder="Es. sacco, tanica, big bag" />
                      <input className="mp-input" type="number" value={f.size_kg} onChange={e => updateFormatRow(i, { size_kg:e.target.value })} placeholder="kg/L per unità" />
                      <button onClick={() => removeFormatRow(i)} disabled={formats.length===1} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:36, height:36, cursor:formats.length===1?"default":"pointer", color:C.muted, opacity:formats.length===1?0.4:1 }}><Trash2 size={14}/></button>
                    </div>
                  ))}
                  <button onClick={addFormatRow} style={{ background:"none", border:"none", color:C.blue, fontSize:12.5, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:5, padding:0 }}><Plus size={13}/> Aggiungi formato</button>
                </div>

                {/* VARIANTE: attributi liberi */}
                <div style={{ marginBottom:16 }}>
                  <label className="mp-label">Attributi di variante (granulometria, purezza, colore…) — facoltativi, verificati prima di comparire ai clienti</label>
                  {attributes.map((a,i) => (
                    <div key={i} className="mp-row-grid" style={{ gridTemplateColumns:"1fr 1fr auto" }}>
                      <input className="mp-input" value={a.key} onChange={e => updateAttrRow(i, { key:e.target.value })} placeholder="Es. granulometria" />
                      <input className="mp-input" value={a.value} onChange={e => updateAttrRow(i, { value:e.target.value })} placeholder="Es. fine" />
                      <button onClick={() => removeAttrRow(i)} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:36, height:36, cursor:"pointer", color:C.muted }}><Trash2 size={14}/></button>
                    </div>
                  ))}
                  <button onClick={addAttrRow} style={{ background:"none", border:"none", color:C.blue, fontSize:12.5, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:5, padding:0 }}><Plus size={13}/> Aggiungi attributo</button>
                  {attributes.length > 0 && (
                    <div style={{ display:"flex", gap:7, marginTop:10, background:"#FFFBEB", border:`1px solid ${C.amber}44`, borderRadius:8, padding:"9px 11px" }}>
                      <AlertTriangle size={15} color={C.amber} style={{ flexShrink:0, marginTop:1 }}/>
                      <span style={{ fontSize:12, color:"#92400E", lineHeight:1.5 }}>Gli attributi di variante non sono visibili ai clienti finché un verificatore non li approva — evitiamo così varianti irrilevanti o confuse.</span>
                    </div>
                  )}
                </div>

                {/* SCAGLIONI PREZZO */}
                <div style={{ marginBottom:20 }}>
                  <label className="mp-label">Scaglioni di prezzo (kg minimo, kg massimo facoltativo, €/kg) *</label>
                  {tiers.map((t,i) => (
                    <div key={i} className="mp-row-grid">
                      <input className="mp-input" type="number" value={t.min_kg} onChange={e => updateTierRow(i, { min_kg:e.target.value })} placeholder="kg min" />
                      <input className="mp-input" type="number" value={t.max_kg} onChange={e => updateTierRow(i, { max_kg:e.target.value })} placeholder="kg max (vuoto = illimitato)" />
                      <input className="mp-input" type="number" step="0.01" value={t.price_per_kg} onChange={e => updateTierRow(i, { price_per_kg:e.target.value })} placeholder="€/kg" />
                      <button onClick={() => removeTierRow(i)} disabled={tiers.length===1} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:36, height:36, cursor:tiers.length===1?"default":"pointer", color:C.muted, opacity:tiers.length===1?0.4:1 }}><Trash2 size={14}/></button>
                    </div>
                  ))}
                  <button onClick={addTierRow} style={{ background:"none", border:"none", color:C.blue, fontSize:12.5, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:5, padding:0 }}><Plus size={13}/> Aggiungi scaglione</button>
                </div>

                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={handleSave} disabled={saving} className="mp-btn"><Check size={16}/> {saving ? "Salvataggio…" : "Salva"}</button>
                  <button onClick={() => { setShowForm(false); resetForm(); }} className="mp-btn-out">Annulla</button>
                </div>
              </div>
            )}

            {/* ELENCO PRODOTTI/VARIANTI */}
            {grouped.length === 0 && !showForm && pdfRows.length === 0 ? (
              <div style={{ padding:"40px 20px", textAlign:"center", border:`1px solid ${C.border}`, borderRadius:14, color:C.muted }}>
                <Package size={26} color={C.border} style={{ marginBottom:8 }}/>
                <div style={{ fontSize:14 }}>Non hai ancora nessun prodotto a listino.</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                {grouped.map(({ product, variants }) => (
                  <div key={product?.id || Math.random()} className="mp-card">
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                      <Layers size={16} color={C.blue}/>
                      <span style={{ fontSize:15, fontWeight:700 }}>{product?.canonical_name || "Prodotto"}</span>
                      <span style={{ fontSize:12, color:C.muted }}>{variants.length} {variants.length===1?"variante":"varianti"}</span>
                      <button onClick={() => openAddForm(product)} style={{ marginLeft:"auto", background:"none", border:"none", color:C.blue, fontSize:12.5, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}><Plus size={13}/> Nuova variante per questo prodotto</button>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {variants.map(v => {
                        const hasAttrs = Object.keys(v.variant_attributes || {}).length > 0;
                        const bestTier = (v.price_tiers || []).slice().sort((a,b) => a.price_per_kg - b.price_per_kg)[0];
                        return (
                          <div key={v.id} style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, flexWrap:"wrap" }}>
                              <div style={{ flex:1, minWidth:200 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                                  <span style={{ fontSize:13.5, fontWeight:700 }}>{v.grade || "Standard"}</span>
                                  {v.origin && <span style={{ fontSize:12, color:C.muted }}>· {v.origin}</span>}
                                  {hasAttrs && <StatusBadge status={v.variant_status} note={v.variant_review_note} />}
                                  {!v.active && <span className="mp-chip" style={{ background:"#F1F5F9", color:C.muted }}>Disattivata</span>}
                                </div>
                                <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>
                                  Formati: {(v.available_formats || []).map(f => `${f.size_kg} ${product?.default_unit === "L" ? "L" : "kg"}/${f.label}`).join(" · ")}
                                </div>
                                {hasAttrs && (
                                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:6 }}>
                                    {Object.entries(v.variant_attributes).map(([k,val]) => (
                                      <span key={k} className="mp-chip" style={{ background:"#F1F5F9", color:C.text }}>{k}: <b>{val}</b></span>
                                    ))}
                                  </div>
                                )}
                                {v.variant_status === "rejected" && v.variant_review_note && (
                                  <div style={{ fontSize:11.5, color:C.red, marginBottom:4 }}>Motivo: {v.variant_review_note}</div>
                                )}
                                <div className="mp-num" style={{ fontSize:13, fontWeight:700, color:C.blue }}>
                                  da {eurKg(bestTier?.price_per_kg)}/kg {(v.price_tiers || []).length > 1 && <span style={{ color:C.muted, fontWeight:400 }}>({v.price_tiers.length} scaglioni)</span>}
                                </div>
                              </div>
                              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                                <button onClick={() => handleDuplicate(v)} title="Duplica variante (con scaglioni)" style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:34, height:34, cursor:"pointer", color:C.blue, display:"flex", alignItems:"center", justifyContent:"center" }}><Copy size={14}/></button>
                                <button onClick={() => openEditForm(v)} title="Modifica" style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:34, height:34, cursor:"pointer", color:C.muted, display:"flex", alignItems:"center", justifyContent:"center" }}><Pencil size={14}/></button>
                                <button onClick={() => handleDelete(v.id)} title="Elimina" style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, width:34, height:34, cursor:"pointer", color:C.red, display:"flex", alignItems:"center", justifyContent:"center" }}><Trash2 size={14}/></button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
