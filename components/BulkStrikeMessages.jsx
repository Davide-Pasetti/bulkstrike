"use client";
// BulkStrikeMessages — casella messaggi buyer↔fornitore (/messaggi).
// Lista conversazioni a sinistra, thread aperto a destra; su mobile (≤760px)
// vista a pannello singolo con bottone indietro. Punti d'ingresso:
//   /messaggi                     → casella
//   /messaggi?thread=<id>         → apre quel thread (es. da notifica)
//   /messaggi?to=<companyId>      → crea/recupera il thread con quell'azienda
//   /messaggi?to=<id>&order=<id>  → idem, con contesto ordine (dal dettaglio ordine)
// I parametri si leggono da window.location in useEffect (niente
// useSearchParams: la pagina resta prerenderizzabile senza Suspense dedicato).
import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Send, ArrowLeft, ChevronRight, Package } from "lucide-react";
import {
  getSession, poolErrorMessage,
  getMyMessageThreads, getThreadMessages, startOrGetThread, sendThreadMessage, markThreadRead,
} from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";

const C = { blue: "#0EA5E9", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", dark: "#0D2137", red: "#DC2626", green: "#059669" };

const fmtTime = (d) => {
  const dt = new Date(d);
  const today = new Date();
  const sameDay = dt.toDateString() === today.toDateString();
  return sameDay
    ? dt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : dt.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
};

export default function MessagesPage({ inShell = false }) {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [err, setErr] = useState("");
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState(null); // null = caricamento
  const [contactsMasked, setContactsMasked] = useState(false); // contatti nascosti (nessun ordine confermato)
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const active = threads.find((t) => t.id === activeId) || null;

  const loadThreads = useCallback(async () => {
    const list = await getMyMessageThreads();
    setThreads(list);
    return list;
  }, []);

  // Bootstrap: sessione + parametri URL (?thread= / ?to=&order=)
  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      try {
        const params = new URLSearchParams(window.location.search);
        const to = params.get("to");
        const order = params.get("order");
        let openId = params.get("thread");
        if (to || order) {
          openId = await startOrGetThread(to || null, order || null);
        }
        const list = await loadThreads();
        if (openId && list.some((t) => t.id === openId)) setActiveId(openId);
        else if (openId) setErr("Conversazione non trovata o accesso non consentito.");
      } catch (e) { setErr(poolErrorMessage(e)); }
      setLoading(false);
    })();
  }, [loadThreads]);

  // Apertura thread: carica messaggi, segna come letti, azzera il badge locale.
  useEffect(() => {
    if (!activeId) { setMessages(null); return; }
    let cancelled = false;
    setMessages(null);
    (async () => {
      try {
        const { messages: msgs, contacts_masked } = await getThreadMessages(activeId);
        if (cancelled) return;
        setMessages(msgs);
        setContactsMasked(contacts_masked);
        await markThreadRead(activeId).catch(() => {});
        setThreads((prev) => prev.map((t) => (t.id === activeId ? { ...t, unread: 0 } : t)));
      } catch (e) { if (!cancelled) setErr(poolErrorMessage(e)); }
    })();
    return () => { cancelled = true; };
  }, [activeId]);

  // Aggiornamento leggero del thread aperto ogni 20s (niente realtime per ora).
  useEffect(() => {
    if (!activeId) return;
    const iv = setInterval(async () => {
      try {
        const { messages: msgs, contacts_masked } = await getThreadMessages(activeId);
        setContactsMasked(contacts_masked);
        setMessages((prev) => (prev && msgs.length !== prev.length ? msgs : prev ?? msgs));
        if (msgs.some((m) => !m.mine && !m.read_at)) await markThreadRead(activeId).catch(() => {});
      } catch { /* transiente */ }
    }, 20000);
    return () => clearInterval(iv);
  }, [activeId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setSending(true); setErr("");
    try {
      await sendThreadMessage(activeId, body);
      setDraft("");
      const { messages: msgs, contacts_masked } = await getThreadMessages(activeId);
      setMessages(msgs);
      setContactsMasked(contacts_masked);
      await loadThreads();
    } catch (e) { setErr(poolErrorMessage(e)); }
    finally { setSending(false); }
  }

  return (
    <div style={{ background: "#fff", color: C.text, fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh", colorScheme: "light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing:border-box; }
        .msg-input { width:100%; padding:11px 13px; border:1.5px solid ${C.border}; border-radius:10px; font-size:14px; outline:none; font-family:'Inter',system-ui; background:#fff; resize:none; }
        .msg-input:focus { border-color:${C.blue}; }
        .msg-thread-item:hover { background:${C.bg}; }
        .msg-thread-item:focus-visible { outline:2px solid ${C.blue}; outline-offset:-2px; }
        .msg-grid { display:grid; grid-template-columns:320px 1fr; gap:0; border:1px solid ${C.border}; border-radius:16px; overflow:hidden; min-height:520px; max-height:calc(100vh - 200px); }
        .msg-list { border-right:1px solid ${C.border}; overflow-y:auto; }
        .msg-pane { display:flex; flex-direction:column; min-width:0; }
        @media (max-width:760px) {
          .msg-grid { display:block; min-height:0; max-height:none; border:none; }
          .msg-list { border:1px solid ${C.border}; border-radius:14px; }
          .msg-pane { border:1px solid ${C.border}; border-radius:14px; min-height:70vh; }
          .msg-hide-mobile { display:none !important; }
        }
      `}</style>

      {!inShell && <BulkStrikeNav />}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginBottom: 16 }}>
          <span onClick={() => { window.location.href = "/"; }} style={{ cursor: "pointer" }}>Home</span><ChevronRight size={13} />
          <span style={{ color: C.text, fontWeight: 600 }}>Messaggi</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
          <MessageSquare size={24} color={C.blue} /> Messaggi
        </h1>

        {err && <div style={{ marginBottom: 14, padding: "11px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13, color: C.red }}>{err}</div>}

        {loading ? (
          <div style={{ padding: "50px 0", textAlign: "center", color: C.muted }}>Caricamento…</div>
        ) : needLogin ? (
          <div style={{ padding: "40px 20px", textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Accedi per vedere i tuoi messaggi</div>
            <button onClick={() => { window.location.href = "/auth/login"; }} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 9, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>Accedi</button>
          </div>
        ) : threads.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <MessageSquare size={30} color={C.border} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Nessuna conversazione</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Contatta un fornitore dal suo profilo nella directory per iniziare.</div>
            <button onClick={() => { window.location.href = "/fornitori"; }} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 9, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>Vai ai fornitori</button>
          </div>
        ) : (
          <div className="msg-grid">
            {/* Lista conversazioni */}
            <div className={`msg-list ${activeId ? "msg-hide-mobile" : ""}`}>
              {threads.map((t) => {
                const initials = (t.other_name || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
                const on = t.id === activeId;
                return (
                  <button
                    key={t.id}
                    className="msg-thread-item"
                    onClick={() => setActiveId(t.id)}
                    style={{ display: "flex", gap: 11, alignItems: "flex-start", width: "100%", textAlign: "left", padding: "13px 14px", background: on ? "#EFF6FF" : "transparent", border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer", fontFamily: "Inter,system-ui" }}
                  >
                    <span style={{ width: 40, height: 40, borderRadius: 10, background: "#EFF6FF", border: "1px solid #BFDBFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                      {t.other_logo
                        ? <img src={t.other_logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        : <span style={{ fontSize: 14, fontWeight: 900, color: C.blue }}>{initials}</span>}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                        <span style={{ fontSize: 13.5, fontWeight: t.unread > 0 ? 800 : 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.other_name}</span>
                        <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>{fmtTime(t.last_message_at)}</span>
                      </span>
                      <span style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
                        <span style={{ fontSize: 12, color: t.unread > 0 ? C.text : C.muted, fontWeight: t.unread > 0 ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {t.last_message_mine ? "Tu: " : ""}{t.last_message || "…"}
                        </span>
                        {t.unread > 0 && (
                          <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 100, background: C.blue, color: "#fff", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{t.unread > 99 ? "99+" : t.unread}</span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Thread aperto */}
            <div className={`msg-pane ${!activeId ? "msg-hide-mobile" : ""}`}>
              {!active ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 13.5, padding: 30, textAlign: "center" }}>
                  Seleziona una conversazione a sinistra.
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                    <button onClick={() => setActiveId(null)} aria-label="Torna alla lista" style={{ display: "flex", background: "none", border: "none", cursor: "pointer", padding: 4, color: C.muted }}>
                      <ArrowLeft size={17} />
                    </button>
                    <span
                      onClick={() => { if (active.my_role === "buyer") window.location.href = `/fornitore?id=${active.other_company_id}`; }}
                      style={{ fontSize: 14.5, fontWeight: 800, cursor: active.my_role === "buyer" ? "pointer" : "default" }}
                    >
                      {active.other_name}
                    </span>
                    <span style={{ fontSize: 11, color: C.muted }}>{active.my_role === "buyer" ? "fornitore" : "cliente"}</span>
                    {active.order_id && (
                      <a href={`/ordine?id=${active.order_id}`} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: C.blue, textDecoration: "none" }}>
                        <Package size={13} /> Vai all&apos;ordine
                      </a>
                    )}
                  </div>

                  {contactsMasked && messages !== null && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 14px", background: "#FFF7ED", borderBottom: `1px solid #FDE68A`, fontSize: 12, color: "#92400E", lineHeight: 1.45 }}>
                      <span style={{ flexShrink: 0 }}>🔒</span>
                      <span>Per sicurezza i contatti diretti (email e telefono) restano <b>nascosti</b> finché non c&apos;è un <b>ordine confermato</b> tra le due aziende: diventano visibili automaticamente dopo il primo ordine.</span>
                    </div>
                  )}

                  <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 8, background: "#fff" }}>
                    {messages === null ? (
                      <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 20 }}>Caricamento…</div>
                    ) : messages.length === 0 ? (
                      <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 20 }}>Scrivi il primo messaggio qui sotto.</div>
                    ) : (
                      messages.map((m) => (
                        <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "78%" }}>
                          <div style={{ padding: "9px 13px", borderRadius: m.mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: m.mine ? "linear-gradient(135deg,#0D2137,#0C4A6E)" : C.bg, color: m.mine ? "#fff" : C.text, fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", border: m.mine ? "none" : `1px solid ${C.border}` }}>
                            {m.body}
                          </div>
                          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3, textAlign: m.mine ? "right" : "left" }}>
                            {fmtTime(m.created_at)}{m.mine && m.read_at ? " · letto" : ""}
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={bottomRef} />
                  </div>

                  <div style={{ display: "flex", gap: 8, padding: "12px 14px", borderTop: `1px solid ${C.border}`, alignItems: "flex-end" }}>
                    <textarea
                      className="msg-input"
                      rows={2}
                      value={draft}
                      maxLength={4000}
                      placeholder="Scrivi un messaggio… (Invio per inviare, Maiusc+Invio per andare a capo)"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={sending || !draft.trim()}
                      aria-label="Invia messaggio"
                      style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 10, width: 46, height: 46, display: "flex", alignItems: "center", justifyContent: "center", cursor: sending || !draft.trim() ? "default" : "pointer", opacity: sending || !draft.trim() ? 0.5 : 1, flexShrink: 0 }}
                    >
                      <Send size={17} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
