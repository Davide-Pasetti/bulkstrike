"use client";
// BulkStrikeCatalogFilters — pannello "Filtri" condiviso tra /catalogo e
// /andamento-prezzi. Stato controllato dal parent via props: qui c'è solo il
// markup (Preferiti, Aste attive [opzionale], Prezzo disponibile, poi le
// tendine Settore / Famiglia chimica / Tipo di materiale). La pagina che lo usa
// deve fornire le classi CSS .cat-sidebar / .cat-filter-toggle nel proprio
// <style> (con l'interpolazione di showFilters per il pannello mobile).
import { ChevronRight, X, Flame, Star, Tag } from "lucide-react";

const C = { blue: "#0EA5E9", dark: "#0284C7", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", red: "#DC2626", amber: "#D97706", purple: "#7C3AED" };

export default function BulkStrikeCatalogFilters({
  showPool = true,        // "Aste attive": omesso su /andamento-prezzi
  activeCount, clearFilters, setShowFilters,
  favActive, loggedIn, hasFavs, favOnly, setFavOnly,
  poolOnly, setPoolOnly,
  priceOnly, setPriceOnly,
  openAree, setOpenAree,
  macros, activeMacro, setActiveMacro, activeSector, setActiveSector,
  followedSectorIds, toggleSectorFollow,
  chemGroups, openChemGroups, toggleChemGroup,
  activeClasses, toggleClass,
  resultsCount,
}) {
  return (
    <aside className="cat-sidebar">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Filtri</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {activeCount > 0 && <span onClick={clearFilters} style={{ fontSize: 12, color: C.blue, cursor: "pointer", fontWeight: 600 }}>Pulisci</span>}
          <button className="cat-filter-toggle" onClick={() => setShowFilters(false)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}><X size={20} color={C.muted} /></button>
        </div>
      </div>

      {/* solo preferiti — anonimo: click → login; loggato senza preferiti: disabilitato. */}
      <label
        onClick={!loggedIn ? (e) => { e.preventDefault(); window.location.href = "/auth/login"; } : undefined}
        title={!loggedIn ? "Accedi per filtrare i tuoi preferiti" : !hasFavs ? "Aggiungi preferiti con la stella ⭐ sulle card" : favOnly ? "Mostra tutte le materie prime" : "Mostra solo i preferiti"}
        style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", border: `1px solid ${favActive ? "#FDE68A" : C.border}`, borderRadius: 10, cursor: (loggedIn && !hasFavs) ? "not-allowed" : "pointer", background: favActive ? "#FEF3C7" : "#fff", marginBottom: 10, opacity: (loggedIn && !hasFavs) ? 0.55 : 1 }}>
        <input type="checkbox" checked={favActive} disabled={loggedIn && !hasFavs} onChange={(e) => { if (loggedIn && hasFavs) setFavOnly(e.target.checked); }} style={{ accentColor: "#D97706", colorScheme: "light", width: 16, height: 16 }} />
        <Star size={15} fill={favActive ? "#D97706" : "none"} color={favActive ? "#D97706" : C.amber} />
        <span style={{ fontSize: 13, fontWeight: 600, color: favActive ? "#B45309" : C.text }}>Preferiti</span>
      </label>

      {/* pool attivo — opzionale (nascosto su andamento-prezzi) */}
      {showPool && (
        <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", border: `1px solid ${poolOnly ? "#0EA5E9" : C.border}`, borderRadius: 10, cursor: "pointer", background: poolOnly ? "#EFF6FF" : "#fff", marginBottom: 10 }}>
          <input type="checkbox" checked={poolOnly} onChange={(e) => setPoolOnly(e.target.checked)} style={{ accentColor: C.blue, colorScheme: "light", width: 16, height: 16 }} />
          <Flame size={15} color={poolOnly ? C.blue : C.amber} />
          <span style={{ fontSize: 13, fontWeight: 600, color: poolOnly ? "#0369A1" : C.text }}>Aste attive</span>
        </label>
      )}

      {/* prezzo disponibile */}
      <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", border: `1px solid ${priceOnly ? "#0EA5E9" : C.border}`, borderRadius: 10, cursor: "pointer", background: priceOnly ? "#EFF6FF" : "#fff", marginBottom: 18 }}>
        <input type="checkbox" checked={priceOnly} onChange={(e) => setPriceOnly(e.target.checked)} style={{ accentColor: C.blue, colorScheme: "light", width: 16, height: 16 }} />
        <Tag size={15} color={priceOnly ? C.blue : C.muted} />
        <span style={{ fontSize: 13, fontWeight: 600, color: priceOnly ? "#0369A1" : C.text }}>Prezzo disponibile</span>
      </label>

      {/* tendina "Settore" (macro-aree → settori) */}
      <div onClick={() => setOpenAree(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: C.text }}>
        <span style={{ flex: 1 }}>Settore</span>
        <ChevronRight size={14} color={C.muted} style={{ transform: openAree ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
      </div>
      {openAree && (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "2px 0 6px 6px" }}>
        {macros.map(m => {
          const on = activeMacro === m.slug;
          return (
            <div key={m.id}>
              <div onClick={() => { const next = on ? null : m.slug; setActiveMacro(next); setActiveSector(null); }}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: on ? "#EFF6FF" : "transparent", fontSize: 13, fontWeight: on ? 700 : 500, color: on ? "#0369A1" : C.text }}>
                <span style={{ fontSize: 15 }}>{m.icon || "📦"}</span>
                <span style={{ flex: 1 }}>{m.name}</span>
                <ChevronRight size={14} color={C.muted} style={{ transform: on ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
              </div>
              {on && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "4px 0 8px 14px", borderLeft: `2px solid ${C.border}`, marginLeft: 14 }}>
                  {(m.sub_areas || [])
                    .filter(s => (s.product_count || 0) > 0)
                    .sort((a, b) => (followedSectorIds?.has(b.id) ? 1 : 0) - (followedSectorIds?.has(a.id) ? 1 : 0))
                    .map(s => {
                    const son = activeSector === s.slug;
                    const fav = !!(followedSectorIds && followedSectorIds.has(s.id));
                    return (
                      <div key={s.id} onClick={() => setActiveSector(son ? null : s.slug)}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", borderRadius: 7, cursor: "pointer", background: son ? "#DBEAFE" : "transparent", fontSize: 12.5, fontWeight: son ? 700 : 500, color: son ? "#0369A1" : C.muted }}>
                        <span>{s.icon || "•"}</span>
                        <span style={{ flex: 1 }}>{s.name}</span>
                        <span style={{ fontSize: 11, color: C.muted }}>{s.product_count}</span>
                        <button onClick={(e) => toggleSectorFollow(e, s)} aria-pressed={fav}
                          title={fav ? "Rimuovi dai settori preferiti" : "Aggiungi ai settori preferiti"}
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                          <Star size={13} fill={fav ? "#D97706" : "none"} color={fav ? "#D97706" : C.muted} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {/* tassonomia chimica — Famiglia chimica / Tipo di materiale (multi-OR) */}
      {chemGroups.length > 0 && (
        <div>
          {chemGroups.map(g => {
            const gopen = openChemGroups.has(g.slug);
            return (
              <div key={g.slug} style={{ marginBottom: 4 }}>
                <div onClick={() => toggleChemGroup(g.slug)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: C.text }}>
                  <span style={{ flex: 1 }}>{g.name}</span>
                  <ChevronRight size={14} color={C.muted} style={{ transform: gopen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                </div>
                {gopen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "2px 0 6px 6px" }}>
                    {(g.classes || []).map(c => {
                      const con = activeClasses.has(c.slug);
                      return (
                        <label key={c.slug}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, cursor: "pointer", background: con ? "#DBEAFE" : "transparent", fontSize: 12.5, fontWeight: con ? 700 : 500, color: con ? "#0369A1" : C.muted }}>
                          <input type="checkbox" checked={con} onChange={() => toggleClass(c.slug)} style={{ accentColor: C.blue, colorScheme: "light", width: 14, height: 14, flexShrink: 0 }} />
                          <span style={{ flex: 1 }}>{c.name}</span>
                          <span style={{ fontSize: 11, color: C.muted }}>{c.product_count}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button className="cat-filter-toggle" onClick={() => setShowFilters(false)} style={{ marginTop: 18, width: "100%", justifyContent: "center", padding: "12px", borderRadius: 9, border: "none", background: "#0369A1", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
        Mostra {resultsCount} risultati
      </button>
    </aside>
  );
}
