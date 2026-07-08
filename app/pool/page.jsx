"use client";
// /pool → elenco di tutte le aste attive (destinazione di "Aste attive" in nav);
// /pool?id=<uuid> → dettaglio della singola asta. La scelta avviene lato client
// (come fa BulkStrikePool stesso per leggere l'id) per evitare useSearchParams
// nel prerender.
import { useState, useEffect } from "react";
import PoolDetail from "@/components/BulkStrikePool";
import PoolList from "@/components/BulkStrikePoolList";

export default function PoolPage() {
  const [mode, setMode] = useState(null);
  useEffect(() => {
    setMode(new URLSearchParams(window.location.search).get("id") ? "detail" : "list");
  }, []);
  if (mode === "detail") return <PoolDetail />;
  if (mode === "list") return <PoolList />;
  return null;
}
