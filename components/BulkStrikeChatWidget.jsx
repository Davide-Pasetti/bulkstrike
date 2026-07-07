"use client";
// ============================================================
// BulkStrike — Widget chat AI flottante (supporto), condiviso.
// Un solo componente usato in tutte le pagine: bottone in basso a destra +
// pannello. Su DESKTOP è un pannello ancorato in basso a destra; su MOBILE
// (≤768px) diventa un overlay a SCHERMO INTERO (robusto rispetto alla tastiera:
// usa 100dvh + visualViewport per tenere input e invio sempre visibili sopra la
// tastiera). Wired su mode="support" (funziona anche per utenti anonimi),
// cronologia effimera lato client. Prop `accent` per il colore del bottone.
// ============================================================
import { useState, useRef, useEffect } from "react";
import { Bot, X } from "lucide-react";
import { streamAiAssistant } from "@/lib/api";

const C = { text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE" };
const GREETING = "Ciao! Sono l'assistente virtuale (AI) di BulkStrike — non una persona. Posso aiutarti a trovare materie prime, confrontare fornitori o unirti a un'asta a ribasso. Per parlare con una persona, scrivi a davide@bulkstrike.com. Come posso aiutarti?";

export default function BulkStrikeChatWidget({ accent = "#0EA5E9" }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ role: "assistant", content: GREETING }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef(null);
  const bottomRef = useRef(null);

  // auto-scroll all'ultimo messaggio
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);

  // Su mobile, quando il pannello è aperto, adatta l'altezza alla visualViewport
  // così l'input resta sopra la tastiera (fallback: 100dvh via CSS).
  useEffect(() => {
    if (!open) return;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const apply = () => {
      const el = panelRef.current;
      if (!el) return;
      if (window.innerWidth <= 768) {
        el.style.height = vv.height + "px";
        el.style.top = (vv.offsetTop || 0) + "px";
      } else {
        el.style.height = "";
        el.style.top = "";
      }
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      if (panelRef.current) { panelRef.current.style.height = ""; panelRef.current.style.top = ""; }
    };
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const history = msgs.map(m => ({ role: m.role, content: m.content }));
    setMsgs(prev => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    let gotText = false;
    try {
      await streamAiAssistant({
        mode: "support",
        message: text,
        clientHistory: history,
        onEvent: (ev) => {
          if (ev.type === "text") {
            gotText = true;
            setMsgs(prev => {
              const c = [...prev];
              c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + ev.delta };
              return c;
            });
          } else if (ev.type === "error") {
            setMsgs(prev => { const c = [...prev]; c[c.length - 1] = { role: "assistant", content: "Si è verificato un errore. Riprova tra poco." }; return c; });
          }
        },
      });
      if (!gotText) {
        setMsgs(prev => {
          const c = [...prev];
          if (c[c.length - 1]?.role === "assistant" && !c[c.length - 1].content) c[c.length - 1] = { role: "assistant", content: "Non ho ricevuto una risposta. Riprova tra poco." };
          return c;
        });
      }
    } catch (e) {
      setMsgs(prev => {
        const c = [...prev];
        if (c[c.length - 1]?.role === "assistant" && !c[c.length - 1].content) c[c.length - 1] = { role: "assistant", content: "Non riesco a rispondere ora. Riprova tra poco." };
        return c;
      });
    } finally { setBusy(false); }
  }

  return (
    <>
      <style>{`
        .bscw-fab { position:fixed; bottom:24px; right:24px; z-index:1000; width:56px; height:56px; border-radius:50%; border:3px solid #fff; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 22px rgba(15,23,42,0.28); transition:transform .2s; }
        .bscw-fab:hover { transform:scale(1.08); }
        .bscw-panel { position:fixed; bottom:96px; right:24px; z-index:1001; width:340px; max-width:calc(100vw - 32px); height:min(460px, calc(100dvh - 130px)); background:#fff; border-radius:16px; border:1px solid ${C.border}; box-shadow:0 20px 60px rgba(0,0,0,0.18); overflow:hidden; display:flex; flex-direction:column; }
        .bscw-scroll { flex:1; padding:12px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; }
        /* Su mobile: bottone più piccolo e più margine; spazio in fondo alla pagina così non copre contenuti */
        @media (max-width:768px) {
          .bscw-fab { bottom:18px; right:16px; width:52px; height:52px; }
          .bscw-fab.bscw-open { display:none; }
          .bscw-panel { top:0; left:0; right:0; bottom:0; width:100%; max-width:none; height:100dvh; border-radius:0; border:none; }
          body { padding-bottom:88px; }
        }
      `}</style>

      {open && (
        <div className="bscw-panel" ref={panelRef}>
          <div style={{ background: accent, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Bot size={18} color="white" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>BulkStrike AI</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>Assistente virtuale AI · ● Online</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Chiudi chat" style={{ background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, flexShrink: 0 }}>
              <X size={18} color="white" />
            </button>
          </div>

          <div className="bscw-scroll">
            {msgs.map((m, i) => (
              m.role === "user" ? (
                <div key={i} style={{ alignSelf: "flex-end", background: accent, color: "white", borderRadius: "12px 12px 4px 12px", padding: "10px 12px", fontSize: 13, maxWidth: "85%", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.content}</div>
              ) : (
                <div key={i} style={{ alignSelf: "flex-start", background: C.bg, color: C.text, borderRadius: "12px 12px 12px 4px", padding: "10px 12px", fontSize: 13, maxWidth: "85%", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.content || (busy ? "…" : "")}</div>
              )
            ))}
            <div ref={bottomRef} />
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ padding: "6px 12px 0", fontSize: 10, color: C.muted, textAlign: "center" }}>Risposte generate da intelligenza artificiale</div>
            <div style={{ padding: 10, display: "flex", gap: 8 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                disabled={busy}
                placeholder="Scrivi un messaggio..."
                style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 16, outline: "none", fontFamily: "Inter,system-ui" }}
              />
              <button onClick={send} disabled={busy || !input.trim()} aria-label="Invia"
                style={{ background: accent, border: "none", borderRadius: 8, width: 40, cursor: (busy || !input.trim()) ? "default" : "pointer", opacity: (busy || !input.trim()) ? 0.5 : 1, color: "white", fontWeight: 700, flexShrink: 0, fontFamily: "Inter,system-ui", fontSize: 18 }}>↑</button>
            </div>
          </div>
        </div>
      )}

      <button className={`bscw-fab${open ? " bscw-open" : ""}`} onClick={() => setOpen(o => !o)} aria-label="Assistente AI" style={{ background: accent }}>
        {open ? <X size={22} color="white" /> : <Bot size={24} color="white" />}
      </button>
    </>
  );
}
