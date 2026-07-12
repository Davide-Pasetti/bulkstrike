"use client";
// BulkStrikeSupplierName — nome fornitore visibile SOLO agli utenti loggati.
// Per gli anonimi il nome è offuscato (blur, non selezionabile) e il click
// porta al login. La logica vive QUI, nel componente condiviso, così ogni
// punto del sito che mostra un nome fornitore legato a un prodotto (pagina
// prodotto, esito asta, …) la eredita automaticamente.
// NB: è offuscamento di interfaccia — i dati arrivano comunque dalla vista
// pubblica suppliers_public; un'eventuale restrizione lato DB è un lavoro a parte.
import { useState, useEffect, useLayoutEffect } from "react";
import { getSession } from "@/lib/api";

// Stato sessione condiviso a livello di modulo: una sola getSession per pagina
// anche con molte occorrenze, e i remount ripartono dal valore già noto.
let _loggedIn = null;   // null = non ancora verificato
let _pending = null;
// (su server useLayoutEffect emette un warning: lì usiamo useEffect, tanto non gira)
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function useLoggedIn() {
  // parte sempre da false (= blur) per combaciare con l'HTML prerenderizzato;
  // il layout-effect applica il valore già noto PRIMA del paint (niente flash).
  const [logged, setLogged] = useState(false);
  useIsoLayoutEffect(() => {
    if (_loggedIn !== null) { setLogged(_loggedIn); return; }
    if (!_pending) _pending = getSession().then((s) => { _loggedIn = !!s; return _loggedIn; }).catch(() => { _loggedIn = false; return false; });
    let alive = true;
    _pending.then((v) => { if (alive) setLogged(v); });
    return () => { alive = false; };
  }, []);
  return logged;
}

export default function SupplierName({ name, companyId = null, className = "", style = {} }) {
  const logged = useLoggedIn();
  if (logged) {
    return (
      <span
        className={companyId ? className : ""}
        onClick={() => { if (companyId) window.location.href = `/fornitore?id=${companyId}`; }}
        style={{ ...style, cursor: companyId ? "pointer" : style.cursor }}
      >
        {name}
      </span>
    );
  }
  return (
    <span
      title="Per visualizzare il fornitore esegui il login"
      aria-label="Fornitore nascosto: accedi per vederlo"
      onClick={() => { window.location.href = "/auth/login"; }}
      style={{ ...style, filter: "blur(5px)", userSelect: "none", cursor: "pointer" }}
    >
      {name}
    </span>
  );
}

// Scritta esplicita da affiancare al nome offuscato dove c'è spazio (es. il
// fornitore "In evidenza" della pagina prodotto). Non rende nulla da loggati.
export function SupplierLoginHint({ style = {} }) {
  const logged = useLoggedIn();
  if (logged) return null;
  return (
    <div style={{ fontSize: 12, color: "#0EA5E9", fontWeight: 600, marginTop: 2, ...style }}>
      Per visualizzare il fornitore{" "}
      <a href="/auth/login" style={{ color: "#0EA5E9", textDecoration: "underline" }}>esegui il login</a>
    </div>
  );
}
