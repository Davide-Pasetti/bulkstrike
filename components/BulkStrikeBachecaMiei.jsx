"use client";
import { useEffect, useState } from "react";
import { getMyListings, getSession, closeListing, getListingSpecSchema, bachecaErrorMessage } from "@/lib/api";
import { C, renderSpecList, prezzoUnitaLabel } from "@/components/BulkStrikeSpecFields";

const STATO = {
  attivo: ["Attivo", "#ECFDF5", "#065F46"],
  chiuso: ["Chiuso", "#F1F5F9", "#475569"],
  ritirato: ["Ritirato", "#F1F5F9", "#475569"],
  scaduto: ["Scaduto", "#FFFBEB", "#92400E"],
};

function badge(stato, giorni) {
  const eff = stato === "attivo" && giorni <= 0 ? "scaduto" : stato;
  const [l, bg, col] = STATO[eff] || [eff, "#F1F5F9", "#475569"];
  return <span style={{ fontSize: 11, fontWeight: 700, background: bg, color: col, borderRadius: 999, padding: "3px 10px" }}>{l}</span>;
}

function dataIt(x) {
  try { return new Date(x).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }); } catch { return ""; }
}

function Risposta({ r }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", background: C.bg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{r.fornitore || "Fornitore"}</span>
          {r.verificato && <span style={{ fontSize: 10, fontWeight: 700, background: "#ECFDF5", color: "#065F46", borderRadius: 6, padding: "2px 7px" }}>Verificato</span>}
        </div>
        <span style={{ fontSize: 12, color: C.muted }}>{dataIt(r.created_at)}</span>
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{[r.regione, r.paese].filter(Boolean).join(", ")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 8 }}>
        {r.quantita_disponibile != null && <span style={kv}><b>Disponibile:</b> {r.quantita_disponibile} {r.unita}</span>}
        {r.prezzo != null && <span style={kv}><b>Prezzo:</b> {r.prezzo} {prezzoUnitaLabel(r.prezzo_unita)}</span>}
        {r.campione_disponibile && <span style={{ ...kv, color: C.green }}>Campione disponibile</span>}
      </div>
      {r.messaggio && <p style={{ margin: "8px 0 0", fontSize: 13, color: C.text, whiteSpace: "pre-wrap" }}>{r.messaggio}</p>}
    </div>
  );
}

export default function BulkStrikeBachecaMiei() {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loggato, setLoggato] = useState(true);
  const [conferma, setConferma] = useState(null); // {id, stato}
  const [errore, setErrore] = useState(null);
  const [schemi, setSchemi] = useState({}); // product_id → schema

  const carica = async () => {
    setLoading(true);
    try {
      const s = await getSession().catch(() => null);
      setLoggato(!!s);
      if (!s) { setLista([]); return; }
      const l = await getMyListings();
      setLista(l);
      const pids = [...new Set(l.map((x) => x.product_id))].filter((p) => p && !(p in schemi));
      if (pids.length) {
        const caricati = await Promise.all(pids.map((p) => getListingSpecSchema(p).then((sc) => [p, sc]).catch(() => [p, []])));
        setSchemi((m) => ({ ...m, ...Object.fromEntries(caricati) }));
      }
    } catch { setLista([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { carica(); }, []);

  const chiudi = async (id, stato) => {
    setErrore(null);
    try { await closeListing(id, stato); setConferma(null); await carica(); }
    catch (e) { setErrore(bachecaErrorMessage(e)); }
  };

  if (loading) return <div style={wrap}><p style={{ color: C.muted }}>Caricamento…</p></div>;
  if (!loggato) return (
    <div style={wrap}>
      <h1 style={h1}>I miei annunci</h1>
      <div style={{ ...card, marginTop: 18 }}>
        <b>Accedi per vedere i tuoi annunci.</b>
        <div style={{ marginTop: 12 }}><a href="/auth/login" style={{ background: "#0369A1", color: "#fff", borderRadius: 9, padding: "10px 18px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>Accedi</a></div>
      </div>
    </div>
  );

  return (
    <div style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={h1}>I miei annunci</h1>
        <a href="/bacheca/nuovo" style={{ background: "#0369A1", color: "#fff", borderRadius: 9, padding: "10px 18px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>+ Nuova richiesta</a>
      </div>

      {errore && <div style={{ marginTop: 14, background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 10, padding: "12px 14px", fontSize: 13.5 }}>{errore}</div>}

      {lista.length === 0 ? (
        <div style={{ ...card, marginTop: 18, textAlign: "center", color: C.muted, borderStyle: "dashed" }}>
          Non hai ancora pubblicato annunci. <a href="/bacheca/nuovo" style={{ color: C.dark, fontWeight: 600 }}>Pubblica la prima richiesta →</a>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
          {lista.map((a) => {
            const specs = renderSpecList(schemi[a.product_id] || null, a.specs).slice(0, 5);
            const attivo = a.status === "attivo" && a.giorni_rimanenti > 0;
            return (
              <div key={a.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{a.prodotto}</span>
                      {badge(a.status, a.giorni_rimanenti)}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {a.settore} · {a.quantita} {a.unita}{a.prezzo_max != null ? ` · max ${a.prezzo_max} ${prezzoUnitaLabel(a.prezzo_unita)}` : ""}
                      {attivo ? ` · ${a.giorni_rimanenti} g rimasti` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <a href={`/bacheca/${a.id}`} style={{ fontSize: 13, color: C.dark, fontWeight: 600, textDecoration: "none" }}>Vedi</a>
                    {attivo && conferma?.id !== a.id && (
                      <>
                        <button onClick={() => setConferma({ id: a.id, stato: "chiuso" })} style={btnMini}>Chiudi</button>
                        <button onClick={() => setConferma({ id: a.id, stato: "ritirato" })} style={btnMini}>Ritira</button>
                      </>
                    )}
                  </div>
                </div>

                {conferma?.id === a.id && (
                  <div style={{ marginTop: 12, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, color: "#92400E" }}>
                      {conferma.stato === "chiuso" ? "Chiudere l’annuncio? Non riceverà più risposte." : "Ritirare l’annuncio? Verrà rimosso dalla bacheca."}
                    </span>
                    <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                      <button onClick={() => chiudi(a.id, conferma.stato)} style={{ ...btnMini, background: "#0369A1", color: "#fff", border: "none" }}>Conferma</button>
                      <button onClick={() => setConferma(null)} style={btnMini}>Annulla</button>
                    </div>
                  </div>
                )}

                {specs.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                    {specs.map((s, i) => (
                      <span key={i} style={{ fontSize: 11, color: C.text, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 8px" }}>
                        <b style={{ color: C.muted, fontWeight: 600 }}>{s.etichetta}:</b> {s.testo}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                    Risposte ricevute ({a.risposte?.length || 0})
                  </div>
                  {(!a.risposte || a.risposte.length === 0) ? (
                    <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Ancora nessuna risposta.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {a.risposte.map((r) => <Risposta key={r.id} r={r} />)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const wrap = { maxWidth: 860, margin: "0 auto", padding: "26px 18px 60px", fontFamily: "Inter,system-ui,sans-serif" };
const h1 = { fontSize: 26, fontWeight: 900, color: C.text, margin: 0 };
const card = { background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 };
const kv = { fontSize: 13, color: C.text };
const btnMini = { background: "#fff", color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontWeight: 600, fontSize: 13, cursor: "pointer" };
