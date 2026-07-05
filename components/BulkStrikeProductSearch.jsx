"use client";
// BulkStrikeProductSearch — barra di ricerca prodotti condivisa, con menu a
// tendina (autocomplete) mentre digiti. Cerca su nome + CAS + E-number +
// sinonimi via RPC search_products_suggest (max 8 suggerimenti, ranking:
// prefisso nome > prefisso sinonimo > contiene).
//
// Comportamento lente / Invio, in ordine di priorità:
//   1) c'è una voce evidenziata (frecce ↑/↓ o hover) → pagina prodotto
//   2) il testo è un match ESATTO di nome/sinonimo/CAS/E-number → pagina prodotto
//   3) è rimasto UN solo risultato → pagina prodotto
//   4) altrimenti → /catalogo?q=<testo> (o il callback onSubmitQuery della pagina)
//
// Usa il client supabase direttamente (non lib/api) per restare autonomo:
// così si monta su qualsiasi pagina senza toccare altri file.
import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabase";

const C = { blue: "#0EA5E9", text: "#0F172A", muted: "#64748B", border: "#E2E8F0" };
const norm = (s) => (s || "").trim().toLowerCase();

export default function ProductSearch({
  value = null,          // opzionale: testo controllato da fuori (es. Catalogo che legge ?q= dall'URL)
  placeholder = "Cerca materie prime, CAS, E-number...",
  height = 46,
  maxWidth = null,
  onQueryChange = null,  // opzionale: chiamato a ogni tasto (il Catalogo lo usa per filtrare live la griglia)
  onSubmitQuery = null,  // opzionale: cosa fare col testo quando NON c'è un prodotto preciso (default: vai a /catalogo?q=)
}) {
  const [q, setQ] = useState(value ?? "");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef(null);

  // sync dall'esterno (es. il Catalogo imposta q dall'URL dopo il mount)
  useEffect(() => {
    if (value != null && value !== q) setQ(value);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // debounce 250ms → suggerimenti dal DB
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setResults([]); setOpen(false); setHighlight(-1); return; }
    const timer = setTimeout(() => {
      supabase.rpc("search_products_suggest", { p_q: t })
        .then(({ data, error }) => {
          if (!error) { setResults(data || []); setOpen(true); setHighlight(-1); }
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  // chiudi il menu cliccando/toccando fuori
  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, []);

  const change = (text) => { setQ(text); if (onQueryChange) onQueryChange(text); };
  const pick = (p) => { window.location.href = `/prodotto?id=${p.id}`; };
  const goCatalog = (text) => {
    setOpen(false);
    if (onSubmitQuery) { onSubmitQuery(text); return; }
    window.location.href = `/catalogo?q=${encodeURIComponent(text)}`;
  };

  function submit() {
    const t = q.trim();
    if (!t) return;
    // 1) voce evidenziata → prodotto
    if (open && highlight >= 0 && results[highlight]) { pick(results[highlight]); return; }
    // 2) match esatto su nome, sinonimo, CAS o E-number → prodotto
    const exact = results.find((p) =>
      [p.canonical_name, p.matched_synonym, p.cas_number, p.e_number].some((v) => norm(v) !== "" && norm(v) === norm(t))
    );
    if (exact) { pick(exact); return; }
    // 3) un solo risultato → prodotto
    if (results.length === 1) { pick(results[0]); return; }
    // 4) catalogo con filtro attivo
    goCatalog(t);
  }

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (results.length) { setOpen(true); setHighlight((h) => (h + 1) % results.length); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (results.length) { setOpen(true); setHighlight((h) => (h <= 0 ? results.length - 1 : h - 1)); } }
    else if (e.key === "Enter") { submit(); }
    else if (e.key === "Escape") { setOpen(false); setHighlight(-1); }
  };

  return (
    <div ref={boxRef} style={{ position: "relative", flex: 1, ...(maxWidth ? { maxWidth } : {}) }}>
      <div style={{ display: "flex", border: `2px solid ${C.blue}`, borderRadius: 10, overflow: "hidden", height, background: "#fff" }}>
        <input
          value={q}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => { if (results.length && q.trim().length >= 2) setOpen(true); }}
          placeholder={placeholder}
          style={{ flex: 1, border: "none", padding: "0 14px", fontSize: 14, outline: "none", color: C.text, fontFamily: "'Inter',system-ui", minWidth: 0, background: "#fff" }}
        />
        <button onClick={submit} aria-label="Cerca" style={{ background: C.blue, border: "none", padding: "0 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Search size={18} color="#fff" />
        </button>
      </div>

      {open && (
        <div style={{ position: "absolute", top: height + 4, left: 0, right: 0, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 12px 30px rgba(0,0,0,0.12)", zIndex: 120, maxHeight: 340, overflowY: "auto" }}>
          {results.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: C.muted }}>
              Nessun prodotto trovato per &ldquo;{q.trim()}&rdquo;.{" "}
              <span onClick={() => goCatalog(q.trim())} style={{ color: C.blue, fontWeight: 600, cursor: "pointer" }}>Cerca nel catalogo</span>
            </div>
          ) : (
            <>
              {results.map((p, i) => (
                <div
                  key={p.id}
                  onClick={() => pick(p)}
                  onMouseEnter={() => setHighlight(i)}
                  style={{ padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: highlight === i ? "#EFF6FF" : "#fff" }}
                >
                  <span style={{ fontSize: 14, color: C.text, minWidth: 0 }}>
                    {p.canonical_name}
                    {p.matched_synonym && norm(p.matched_synonym) !== norm(p.canonical_name) && (
                      <span style={{ fontSize: 12, color: C.muted }}> · anche &ldquo;{p.matched_synonym}&rdquo;</span>
                    )}
                  </span>
                  <span style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", flexShrink: 0 }}>{p.e_number || p.cas_number || ""}</span>
                </div>
              ))}
              <div onClick={() => goCatalog(q.trim())} style={{ padding: "10px 14px", cursor: "pointer", fontSize: 13, color: C.blue, fontWeight: 600 }}>
                Vedi tutti i risultati nel catalogo →
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
