"use client";
// BulkStrikePromozioni — pagina pubblica "Bacheca Promozioni" (/promozioni):
// elenco completo degli sconti fissi a tempo attivi (DAV-76). Riusa la card
// autonoma BulkStrikePromoCard. NON è un'asta.
import { useState, useEffect } from "react";
import { Tag } from "lucide-react";
import { getActivePromotions } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import BulkStrikePromoCard from "@/components/BulkStrikePromoCard";

const C = { text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", amber:"#D97706" };

export default function PromozioniPage() {
  const [promos, setPromos] = useState(undefined);

  useEffect(() => {
    let alive = true;
    getActivePromotions().then((p) => { if (alive) setPromos(p || []); }).catch(() => { if (alive) setPromos([]); });
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif", color:C.text }}>
      <BulkStrikeNav />
      <div style={{ maxWidth:1180, margin:"0 auto", padding:"32px 20px 64px" }}>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.amber, marginBottom:8 }}>Bacheca Promozioni</div>
          <h1 style={{ fontSize:30, fontWeight:800, letterSpacing:"-0.02em", margin:0 }}>Offerte a tempo dai fornitori</h1>
          <p style={{ fontSize:15, color:C.muted, marginTop:8, maxWidth:640 }}>Sconti fissi a tempo limitato pubblicati dai fornitori. Prezzo bloccato, niente asta: acquisti subito alla quantità che vuoi.</p>
        </div>

        {promos === undefined ? (
          <div style={{ color:C.muted, fontSize:14 }}>Carico…</div>
        ) : promos.length === 0 ? (
          <div style={{ border:`1px dashed ${C.border}`, borderRadius:16, padding:"48px 24px", textAlign:"center", color:C.muted }}>
            <Tag size={28} style={{ color:C.amber }} />
            <div style={{ fontSize:17, fontWeight:700, color:C.text, margin:"12px 0 4px" }}>Nessuna promozione attiva</div>
            <div style={{ fontSize:14 }}>Torna a trovarci: i fornitori pubblicano nuovi sconti a tempo di continuo.</div>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:20 }}>
            {promos.map((p) => <BulkStrikePromoCard key={p.id} promo={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
