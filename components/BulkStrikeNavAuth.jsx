"use client";
// NavAuth — controlli auth per la nav, condivisi da tutte le pagine.
// Loggato: avatar (→ /dashboard) + "Esci". Non loggato: "Accedi" + "Registrati".
import { useState, useEffect } from "react";
import { getSession, onAuthChange, signOut } from "@/lib/api";

export default function NavAuth() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsub;
    getSession().then((s) => { setSession(s); setReady(true); }).catch(() => setReady(true));
    try { unsub = onAuthChange((s) => setSession(s)); } catch (e) {}
    return () => { try { unsub && unsub(); } catch (e) {} };
  }, []);

  // niente flash prima di sapere lo stato
  if (!ready) return <div style={{ width: 120 }} />;

  if (!session) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <a href="/auth/login" style={{ fontSize: 14, color: "#64748B", cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap", textDecoration: "none" }}>Accedi</a>
        <a href="/registrati" style={{ fontSize: 14, fontWeight: 700, color: "#fff", background: "#0EA5E9", padding: "9px 18px", borderRadius: 9, textDecoration: "none", whiteSpace: "nowrap" }}>Registrati</a>
      </div>
    );
  }

  const email = session.user?.email || "";
  const initial = (email.trim()[0] || "U").toUpperCase();
  const logout = async () => { try { await signOut(); } catch (e) {} window.location.href = "/"; };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <a href="/dashboard" title={email ? `Dashboard · ${email}` : "Dashboard"} style={{ textDecoration: "none" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#0EA5E9,#22D3EE)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>{initial}</div>
      </a>
      <span onClick={logout} style={{ fontSize: 13, color: "#64748B", cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" }}>Esci</span>
    </div>
  );
}
