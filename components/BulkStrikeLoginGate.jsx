"use client";
// BulkStrikeLoginGate — blocco "contenuto riservato agli utenti registrati".
// Le RPC delle directory (get_suppliers_directory, get_supplier_profile,
// get_supplier_reviews, get_carriers_directory) sono eseguibili solo da
// autenticati: le pagine che le usano mostrano questo blocco agli anonimi
// invece di una pagina vuota. Stesso stile dei blocchi "Accedi per…" già
// presenti (carrello, ordini, preferiti), più il link alla registrazione.
import { Lock } from "lucide-react";

const C = { blue: "#0EA5E9", text: "#0F172A", muted: "#64748B", border: "#E2E8F0" };

export default function LoginGate({ title, subtitle }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 560, margin: "36px auto", background: "#fff" }}>
      <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#EFF6FF", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <Lock size={20} color={C.blue} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 6 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.55, marginBottom: 18, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>{subtitle}</div>}
      <button onClick={() => { window.location.href = "/auth/login"; }} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 9, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>Accedi</button>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 14 }}>
        Non hai ancora un account?{" "}
        <span onClick={() => { window.location.href = "/registrati"; }} style={{ color: C.blue, fontWeight: 700, cursor: "pointer" }}>Registrati</span>
      </div>
    </div>
  );
}
