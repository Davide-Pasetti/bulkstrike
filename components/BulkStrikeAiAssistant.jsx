"use client";

// components/BulkStrikeAiAssistant.jsx
// Assistente BulkStrike AI con azioni reali (tool use).
// Sostituisce il mockup AI_MSGS in Home e Dashboard: <BulkStrikeAiAssistant />
// Prop opzionale onParsedPriceList(kind, payload) per agganciare il flusso
// di import listini gia' esistente.

import { useEffect, useRef, useState } from "react";
import { streamAiChat, fileToBase64 } from "@/lib/aiChat";

const SUGGERIMENTI = [
  "Cerca farina di frumento e dimmi se conviene l'asta a ribasso",
  "Cosa c'è nel mio carrello?",
  "A che punto sono i miei ordini?",
];

export default function BulkStrikeAiAssistant({ onParsedPriceList }) {
  const [messages, setMessages] = useState([]); // {role, text, pending?, action?, status?}
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolNote, setToolNote] = useState(null);
  const [pdf, setPdf] = useState(null); // { name, base64 }
  const conversationRef = useRef(null);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolNote]);

  async function run({ text = "", confirmedAction = null }) {
    setBusy(true);
    setToolNote(null);
    // placeholder risposta in streaming
    setMessages((m) => [...m, { role: "assistant", text: "" }]);

    try {
      await streamAiChat({
        mode: "assistant",
        conversationId: conversationRef.current,
        message: text,
        pdfBase64: pdf?.base64 ?? null,
        confirmedAction,
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
          } else if (ev.type === "tool") {
            setToolNote(nomeTool(ev.name));
          } else if (ev.type === "pending_action") {
            setMessages((m) => [
              ...m.slice(0, -1),
              { role: "action", action: ev.action, status: "pending" },
              m[m.length - 1],
            ]);
          } else if (ev.type === "parsed_price_list") {
            onParsedPriceList?.(ev.kind, ev.payload);
            setMessages((m) => [
              ...m.slice(0, -1),
              {
                role: "info",
                text: `Listino analizzato: ${
                  ev.payload?.products?.length ?? "?"
                } righe pronte per l'import.`,
              },
              m[m.length - 1],
            ]);
          } else if (ev.type === "error") {
            setMessages((m) => [
              ...m,
              { role: "info", text: `Si è verificato un errore: ${ev.message}` },
            ]);
          }
        },
      });
    } catch (e) {
      setMessages((m) => [...m, { role: "info", text: e.message }]);
    } finally {
      setBusy(false);
      setToolNote(null);
      setPdf(null);
    }
  }

  function send(text) {
    const t = (text ?? input).trim();
    if ((!t && !pdf) || busy) return;
    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", text: t + (pdf ? ` 📎 ${pdf.name}` : "") },
    ]);
    run({ text: t });
  }

  function decide(idx, ok) {
    const msg = messages[idx];
    setMessages((m) =>
      m.map((x, i) =>
        i === idx ? { ...x, status: ok ? "confirmed" : "cancelled" } : x
      )
    );
    if (ok) {
      setMessages((m) => [...m, { role: "user", text: "✅ Confermo" }]);
      run({ confirmedAction: { name: msg.action.name, input: msg.action.input } });
    }
  }

  async function onPickPdf(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") return;
    setPdf({ name: file.name, base64: await fileToBase64(file) });
    e.target.value = "";
  }

  return (
    <div className="flex h-[520px] flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          ⚡
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-900">BulkStrike AI</p>
          <p className="text-xs text-gray-500">
            Cerca, confronta e agisci — le azioni richiedono la tua conferma
          </p>
        </div>
      </div>

      {/* Messaggi */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="space-y-2 pt-4">
            <p className="text-sm text-gray-500">Prova a chiedermi:</p>
            {SUGGERIMENTI.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 hover:border-emerald-300 hover:bg-emerald-50"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === "action") {
            return (
              <div
                key={i}
                className="rounded-xl border border-amber-300 bg-amber-50 p-3"
              >
                <p className="text-sm font-medium text-gray-900">
                  {m.action.label}
                </p>
                {m.status === "pending" ? (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => decide(i, true)}
                      disabled={busy}
                      className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      Conferma
                    </button>
                    <button
                      onClick={() => decide(i, false)}
                      disabled={busy}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Annulla
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">
                    {m.status === "confirmed" ? "Confermata" : "Annullata"}
                  </p>
                )}
              </div>
            );
          }
          if (m.role === "info") {
            return (
              <p key={i} className="text-center text-xs text-gray-500">
                {m.text}
              </p>
            );
          }
          const mine = m.role === "user";
          return (
            <div key={i} className={mine ? "flex justify-end" : "flex"}>
              <div
                className={
                  mine
                    ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-emerald-500 px-3 py-2 text-sm text-white"
                    : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 text-sm text-gray-900"
                }
              >
                {m.text || (busy && i === messages.length - 1 ? "…" : "")}
              </div>
            </div>
          );
        })}

        {toolNote && (
          <p className="text-xs italic text-gray-400">{toolNote}…</p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 p-3">
        {pdf && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
            <span>📎 {pdf.name}</span>
            <button onClick={() => setPdf(null)} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            title="Allega listino PDF"
            className="rounded-lg border border-gray-200 px-2.5 py-2 text-gray-500 hover:bg-gray-50"
          >
            📎
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onPickPdf}
          />
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
            placeholder="Chiedi qualcosa o descrivi cosa vuoi fare…"
            className="max-h-28 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
          />
          <button
            onClick={() => send()}
            disabled={busy || (!input.trim() && !pdf)}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            Invia
          </button>
        </div>
      </div>
    </div>
  );
}

function nomeTool(name) {
  const labels = {
    search_products: "Cerco nel catalogo",
    get_price_reference: "Verifico il prezzo di riferimento",
    get_open_pool_for_product: "Controllo le aste a ribasso aperte",
    get_pool_detail: "Leggo il dettaglio dell'asta",
    get_cart: "Controllo il carrello",
    get_my_orders: "Recupero i tuoi ordini",
    get_order_detail: "Leggo il dettaglio dell'ordine",
    get_shipping_quotes: "Calcolo i preventivi di spedizione",
    parse_price_list: "Analizzo il listino PDF",
  };
  return labels[name] ?? "Consulto i dati";
}
