"use client";
// Dropdown "Categoria" riutilizzabile — macro-aree della tassonomia (stessa
// fonte del filtro categoria del Catalogo, get_taxonomy). value = slug macro
// oppure "" (Tutte le categorie); onChange(slug|null). Le card filtrano poi su
// p.macros.includes(slug).
import { useState, useEffect } from "react";
import { getMacroAreas } from "@/lib/api";

export default function CategorySelect({ value, onChange, colors }) {
  const [macros, setMacros] = useState([]);
  useEffect(() => { getMacroAreas().then(m => setMacros(m || [])).catch(() => {}); }, []);
  const C = colors || { border: "#E2E8F0", text: "#0F172A" };
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value || null)}
      style={{ padding: "8px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", fontSize: 13, fontFamily: "Inter,system-ui", color: C.text, cursor: "pointer" }}>
      <option value="">Tutte le categorie</option>
      {macros.map(m => <option key={m.slug} value={m.slug}>{(m.icon ? m.icon + " " : "") + m.name}</option>)}
    </select>
  );
}
