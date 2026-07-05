// lib/aiChat.js
// Client per la edge function `ai-assistant`: invia un messaggio e legge lo
// stream SSE, richiamando onEvent per ogni evento ricevuto.
// Eventi: {type:"conversation",id} {type:"text",delta} {type:"tool",name}
//         {type:"pending_action",action} {type:"parsed_price_list",kind,payload}
//         {type:"error",message} {type:"done"}

import { createClient } from "@/lib/supabase/client";

const FN_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-assistant`;

export async function streamAiChat({
  mode, // "assistant" | "support"
  conversationId = null,
  message = "",
  pdfBase64 = null,
  confirmedAction = null, // { name, input } dopo la conferma dell'utente
  clientHistory = null, // solo supporto anonimo: [{role, content}]
  onEvent,
  signal,
}) {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token =
    data?.session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const resp = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      mode,
      conversation_id: conversationId,
      message,
      pdf_base64: pdfBase64,
      confirmed_action: confirmedAction,
      client_history: clientHistory,
    }),
    signal,
  });

  if (!resp.ok) {
    let err = {};
    try {
      err = await resp.json();
    } catch {
      /* corpo non JSON */
    }
    throw new Error(err.detail || err.error || `Errore ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        /* riga malformata, ignora */
      }
    }
  }
}

// Converte un File (input type=file) in base64 puro, senza prefisso data:
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Lettura file fallita"));
    r.readAsDataURL(file);
  });
}
