"use client";
// NavAuth — controlli auth per la nav, condivisi da tutte le pagine.
// Loggato: icona carrello (badge = righe nel carrello) + menu account a
// dropdown (BulkStrikeAccountMenu: profilo, aste, ordini, messaggi, preferiti,
// fatturazione, esci…). "Esci" vive dentro il menu, non più come link sparso.
// Non loggato: solo "Accedi" + "Registrati" (il carrello richiede login).
import { useState, useEffect } from "react";
import { ShoppingCart } from "lucide-react";
import { getSession, onAuthChange, getCart } from "@/lib/api";
import AccountMenu from "@/components/BulkStrikeAccountMenu";

export default function NavAuth() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    let unsub;
    getSession().then((s) => { setSession(s); setReady(true); }).catch(() => setReady(true));
    try { unsub = onAuthChange((s) => setSession(s)); } catch (e) {}
    return () => { try { unsub && unsub(); } catch (e) {} };
  }, []);

  useEffect(() => {
    if (!session) { setCartCount(0); return; }
    let cancelled = false;
    getCart().then((items) => { if (!cancelled) setCartCount((items || []).length); }).catch(() => {});
    return () => { cancelled = true; };
  }, [session]);

  // niente flash prima di sapere lo stato
  if (!ready) return <div style={{ width: 120 }} />;

  if (!session) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <a href="/auth/login" style={{ fontSize: 14, color: "#64748B", cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap", textDecoration: "none" }}>Accedi</a>
        <a href="/registrati" style={{ fontSize: 14, fontWeight: 700, color: "#fff", background: "#0369A1", padding: "9px 18px", borderRadius: 9, textDecoration: "none", whiteSpace: "nowrap" }}>Registrati</a>
      </div>
    );
  }

  const email = session.user?.email || "";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <a href="/carrello" title="Carrello" style={{ position: "relative", display: "flex", alignItems: "center", textDecoration: "none", color: "#64748B" }}>
        <ShoppingCart size={21} />
        {cartCount > 0 && (
          <span style={{ position: "absolute", top: -7, right: -9, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 100, background: "#0369A1", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
            {cartCount > 9 ? "9+" : cartCount}
          </span>
        )}
      </a>
      <AccountMenu email={email} cartCount={cartCount} />
    </div>
  );
}
