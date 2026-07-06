"use client";

// components/BulkStrikeSupportChat.jsx
// Widget di supporto fisso in basso a destra, per utenti loggati e anonimi.
// Sostituisce il mockup statico: <BulkStrikeSupportChat />
// - Loggati: risposte specifiche (ordini, carrello, aste) in sola lettura
// - Anonimi: risposte generiche sulla piattaforma (10 msg/giorno per IP)
// Storico effimero: si azzera alla chiusura della pagina.

import { useEffect, useRef, useState } from "react";
import { streamAiChat } from "@/lib/aiChat";

const BENVENUTO =
  "Ciao! Sono l'assistente di supporto BulkStrike. Posso spiegarti come funzionano acquisti rapidi, aste a ribasso, spedizioni e ordini. Come posso aiutarti?";

export default function BulkStrikeSupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: BENVENUTO },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationRef = useRef(null); // sessione corrente (solo loggati)
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next = [...messages, { role: "user", text }];
    setMessages([...next, { role: "assistant", text: "" }]);
    setBusy(true);

    try {
      await streamAiChat({
        mode: "support",
        conversationId: conversationRef.current,
        message: text,
        // storico effimero inviato dal client per gli anonimi
        // (per i loggati il server usa conversation_id)
        clientHistory: next
          .slice(1) // esclude il benvenuto
          .map((m) => ({ role: m.role, content: m.text })),
        onEvent: (ev) => {
          if (ev.type === "conversation") conversationRef.current = ev.id;
          else if (ev.type === "text") {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = {
                ...copy[copy.length - 1],
                text: copy[copy.length - 1].text + ev.delta,
              };
              return copy;
            });
          } else if (ev.type === "error") {
            setMessages((m) => [
              ...m,
              { role: "assistant", text: `Ops, qualcosa è andato storto: ${ev.message}` },
            ]);
          }
        },
      });
    } catch (e) {
      setMessages((m) => [
        ...m.slice(0, -1),
        { role: "assistant", text: e.message },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 flex h-[440px] w-[340px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between bg-emerald-500 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Supporto BulkStrike</p>
              <p className="text-xs text-emerald-100">
                Rispondiamo subito, 24/7
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 hover:bg-emerald-600"
              aria-label="Chiudi chat"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-emerald-500 px-3 py-2 text-sm text-white"
                      : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 text-sm text-gray-900"
                  }
                >
                  {m.text ||
                    (busy && i === messages.length - 1 ? "…" : "")}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="flex items-end gap-2 border-t border-gray-100 p-2.5">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Scrivi un messaggio…"
              className="max-h-24 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              ➤
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-2xl text-white shadow-lg hover:bg-emerald-600"
        aria-label="Apri chat di supporto"
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
