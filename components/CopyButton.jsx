"use client";
// CopyButton — piccolo bottone riutilizzabile che copia `value` negli appunti e
// mostra una conferma "Copiato" per ~1,5s. Usato per IBAN/BIC nella pagina ordine.
import { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function CopyButton({ value, label = "Copia" }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!navigator?.clipboard) return;
    try {
      await navigator.clipboard.writeText(String(value ?? ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      /* clipboard non disponibile o permesso negato: nessun feedback distruttivo */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: copied ? "#ECFDF5" : "#fff",
        color: copied ? "#059669" : "#0284C7",
        border: `1.5px solid ${copied ? "#A7F3D0" : "#E2E8F0"}`,
        borderRadius: 8, padding: "5px 10px", fontSize: 12.5, fontWeight: 600,
        cursor: "pointer", fontFamily: "Inter,system-ui", whiteSpace: "nowrap",
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copiato" : label}
    </button>
  );
}
