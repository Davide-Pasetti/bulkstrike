"use client";
import { useEffect, useState } from "react";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import { getBachecaListing, getSession, getMyCompany, respondToListing, bachecaErrorMessage } from "@/lib/api";
import { C, renderSpecList, prezzoUnitaLabel, PREZZO_UNITA, bachecaLabelStyle, bachecaInputStyle } from "@/components/BulkStrikeSpecFields";

const UNITA = ["hl", "l", "kg", "t"];

function Shell({ children }) {
  return (
    <div style={{ background: "#fff", color: C.text, minHeight: "100vh", colorScheme: "light", fontFamily: "Inter,system-ui,sans-serif" }}>
      <BulkStrikeNav />
      {children}
    </div>
  );
}

function Box({ tono = "info", children }) {
  const col = { info: [C.bg, C.border, C.text], warn: ["#FFFBEB", "#FDE68A", "#92400E"], ok: ["#ECFDF5", "#A7F3D0", "#065F46"] }[tono];
  return <div style={{ background: col[0], border: `1px solid ${col[1]}`, color: col[2], borderRadius: 12, padding: "16px 18px", fontSize: 14 }}>{children}</div>;
}

export default function BulkStrikeBachecaDettaglio({ id }) {
  const [a, setA] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loggato, setLoggato] = useState(false);
  const [company, setCompany] = useState(null);
  const [form, setForm] = useState({ quantita_disponibile: "", unita: "", prezzo: "", prezzo_unita: "", campione_disponibile: false, messaggio: "" });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState(null);

  const carica = async () => {
    setLoading(true);
    try {
      const [ann, sess] = await Promise.all([getBachecaListing(id), getSession().catch(() => null)]);
      setA(ann);
      setLoggato(!!sess);
      if (sess) { const c = await getMyCompany().catch(() => null); setCompany(c); }
      if (ann) {
        const r = ann.mia_risposta;
        setForm({
          quantita_disponibile: r?.quantita_disponibile ?? "",
          unita: r?.unita ?? ann.unita ?? "hl",
          prezzo: r?.prezzo ?? "",
          prezzo_unita: r?.prezzo_unita ?? "",
          campione_disponibile: r?.campione_disponibile ?? false,
          messaggio: r?.messaggio ?? "",
        });
      }
    } catch {
      setA(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { carica(); /* eslint-disable-next-line */ }, [id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const invia = async () => {
    setSalvando(true); setMsg(null);
    try {
      const payload = { listing_id: id, campione_disponibile: !!form.campione_disponibile };
      if (form.quantita_disponibile !== "") payload.quantita_disponibile = Number(form.quantita_disponibile);
      if (form.unita) payload.unita = form.unita;
      if (form.prezzo !== "") payload.prezzo = Number(form.prezzo);
      if (form.prezzo_unita) payload.prezzo_unita = form.prezzo_unita;
      if (form.messaggio.trim()) payload.messaggio = form.messaggio.trim();
      const res = await respondToListing(payload);
      setMsg({ tono: "ok", testo: res?.aggiornata ? "Risposta aggiornata e inviata al compratore." : "Risposta inviata al compratore." });
      await carica();
    } catch (e) {
      setMsg({ tono: "warn", testo: bachecaErrorMessage(e, a?.schema) });
    } finally {
      setSalvando(false);
    }
  };

  if (loading) return <Shell><div style={wrap}><p style={{ color: C.muted }}>Caricamento…</p></div></Shell>;
  if (!a) return (
    <Shell>
      <div style={wrap}>
        <Box tono="warn">Questo annuncio non esiste, è scaduto o non è più disponibile.</Box>
        <p style={{ marginTop: 16 }}><a href="/bacheca" style={link}>← Torna alla bacheca</a></p>
      </div>
    </Shell>
  );

  const specs = renderSpecList(a.schema, a.specs);
  const luogo = [a.compratore_regione, a.compratore_paese].filter(Boolean).join(", ");
  const isFornitore = !!company?.is_supplier;
  const attivo = a.status === "attivo" && a.giorni_rimanenti > 0;

  return (
    <Shell>
    <div style={wrap}>
      <p style={{ marginBottom: 14 }}><a href="/bacheca" style={link}>← Bacheca</a></p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 22 }} className="bcd-layout">
        {/* DETTAGLIO */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: C.text, margin: 0 }}>{a.prodotto}</h1>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{a.settore}</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: a.giorni_rimanenti <= 5 ? C.red : C.muted }}>
              {attivo ? `${a.giorni_rimanenti} giorni rimasti` : "Non più attivo"}
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginTop: 18 }}>
            <Kv label="Quantità richiesta" value={`${a.quantita} ${a.unita}`} />
            {a.prezzo_max != null && <Kv label="Prezzo massimo" value={`${a.prezzo_max} ${prezzoUnitaLabel(a.prezzo_unita)}`} colore={C.green} />}
            <Kv label="Località del compratore" value={luogo || "Non indicata"} />
            <Kv label="Risposte ricevute" value={String(a.risposte || 0)} />
          </div>

          {(a.paesi?.length > 0 || a.regioni?.length > 0) && (
            <div style={{ marginTop: 18 }}>
              <div style={sect}>Aree di provenienza cercate</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[...(a.regioni || []), ...(a.paesi || [])].map((x, i) => (
                  <span key={i} style={{ fontSize: 12, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 9px", color: C.text }}>{x}</span>
                ))}
              </div>
            </div>
          )}

          {specs.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={sect}>Specifiche richieste</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
                {specs.map((s, i) => (
                  <div key={i} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{s.etichetta}</div>
                    <div style={{ fontSize: 14, color: C.text, fontWeight: 600, marginTop: 2 }}>{s.testo}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {a.note && (
            <div style={{ marginTop: 20 }}>
              <div style={sect}>Note del compratore</div>
              <p style={{ fontSize: 14, color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap", margin: 0 }}>{a.note}</p>
            </div>
          )}
        </div>

        {/* COLONNA AZIONE */}
        <aside>
          <div style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {a.sono_il_proprietario ? (
              <Box tono="info">
                <b>Questo è un tuo annuncio.</b>
                <div style={{ marginTop: 8 }}><a href="/bacheca/miei" style={link}>Vai a “I miei annunci” →</a></div>
              </Box>
            ) : !loggato ? (
              <Box tono="info">
                <b>Accedi per rispondere.</b>
                <p style={{ margin: "8px 0 0", color: C.muted }}>Per proporti come fornitore devi accedere con un profilo fornitore.</p>
                <a href="/auth/login" style={{ display: "inline-block", marginTop: 12, background: "#0369A1", color: "#fff", borderRadius: 9, padding: "10px 18px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>Accedi</a>
              </Box>
            ) : !isFornitore ? (
              <Box tono="warn">
                <b>Serve un profilo fornitore.</b>
                <p style={{ margin: "8px 0 0" }}>Solo le aziende registrate come fornitori possono rispondere agli annunci. Completa il tuo profilo fornitore per proporti.</p>
                <a href="/dashboard?section=account" style={{ display: "inline-block", marginTop: 12, color: "#92400E", fontWeight: 700, textDecoration: "underline" }}>Gestisci il profilo →</a>
              </Box>
            ) : !attivo ? (
              <Box tono="warn">Questo annuncio non è più attivo: non è possibile inviare una risposta.</Box>
            ) : (
              <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>
                  {a.mia_risposta ? "La tua risposta" : "Rispondi all’annuncio"}
                </div>
                <p style={{ fontSize: 12, color: C.muted, margin: "0 0 14px" }}>
                  Il compratore vedrà il nome della tua azienda. Compila almeno un campo.
                </p>

                <label style={bachecaLabelStyle}>Quantità disponibile
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <input type="number" min="0" step="any" value={form.quantita_disponibile} onChange={(e) => set("quantita_disponibile", e.target.value)} style={{ ...bachecaInputStyle, flex: 2 }} placeholder="es. 500" />
                    <select value={form.unita} onChange={(e) => set("unita", e.target.value)} style={{ ...bachecaInputStyle, flex: 1 }}>
                      {UNITA.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </label>

                <label style={{ ...bachecaLabelStyle, marginTop: 12 }}>Prezzo proposto
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <input type="number" min="0" step="any" value={form.prezzo} onChange={(e) => set("prezzo", e.target.value)} style={{ ...bachecaInputStyle, flex: 2 }} placeholder="es. 42" />
                    <select value={form.prezzo_unita} onChange={(e) => set("prezzo_unita", e.target.value)} style={{ ...bachecaInputStyle, flex: 1 }}>
                      <option value="">—</option>
                      {PREZZO_UNITA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13, color: C.text, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.campione_disponibile} onChange={(e) => set("campione_disponibile", e.target.checked)} style={{ width: 16, height: 16, accentColor: C.blue }} />
                  Posso inviare un campione
                </label>

                <label style={{ ...bachecaLabelStyle, marginTop: 12 }}>Messaggio
                  <textarea value={form.messaggio} onChange={(e) => set("messaggio", e.target.value)} maxLength={2000} rows={4} style={{ ...bachecaInputStyle, marginTop: 4, resize: "vertical" }} placeholder="Dettagli sulla disponibilità, tempi di consegna…" />
                </label>

                {msg && <div style={{ marginTop: 12 }}><Box tono={msg.tono}>{msg.testo}</Box></div>}

                <button onClick={invia} disabled={salvando} style={{ width: "100%", marginTop: 14, background: "#0369A1", color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontWeight: 700, fontSize: 14, cursor: salvando ? "default" : "pointer", opacity: salvando ? .6 : 1 }}>
                  {salvando ? "Invio…" : a.mia_risposta ? "Aggiorna la risposta" : "Invia la risposta"}
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
      <style>{`@media(max-width:780px){.bcd-layout{grid-template-columns:1fr!important}}`}</style>
    </div>
    </Shell>
  );
}

function Kv({ label, value, colore }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: .3 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: colore || C.text, marginTop: 2, fontFamily: "'JetBrains Mono',ui-monospace,monospace" }}>{value}</div>
    </div>
  );
}

const wrap = { maxWidth: 1000, margin: "0 auto", padding: "26px 18px 60px", fontFamily: "Inter,system-ui,sans-serif" };
const link = { color: C.dark, fontWeight: 600, textDecoration: "none", fontSize: 13 };
const sect = { fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4, marginBottom: 8 };
