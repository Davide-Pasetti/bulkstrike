"use client";
// BulkStrikeDisiscrizione — pagina pubblica /disiscrizione?t=<token>.
// La apre chi riceve una richiesta (fornitore, anche non registrato) cliccando
// il link in fondo all'email. Nessun login: il token nell'URL è la credenziale,
// come per /ricezione. La disiscrizione viene registrata subito all'apertura:
// il click sul link È già la volontà espressa, chiedere una seconda conferma
// significa solo che qualcuno resta iscritto per un bottone non premuto.
import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { unsubscribeEmail } from "@/lib/api";

const C = { text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", red:"#DC2626" };

export default function DisiscrizionePage() {
  const [stato, setStato] = useState("carico"); // carico | fatto | errore
  const [email, setEmail] = useState("");
  const [gia, setGia] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("t") || "";
    if (!token) { setStato("errore"); return; }
    unsubscribeEmail(token)
      .then((r) => {
        if (!r?.ok) { setStato("errore"); return; }
        setEmail(r.email || "");
        setGia(!!r.gia_disiscritto);
        setStato("fatto");
      })
      .catch(() => setStato("errore"));
  }, []);

  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif", color:C.text,
                  display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:"#fff", border:`1px solid ${C.border}`, borderRadius:16, padding:"32px 28px",
                    maxWidth:520, width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:20, fontWeight:800, marginBottom:14 }}>BulkStrike</div>

        {stato === "carico" && <div style={{ color:C.muted, fontSize:14 }}>Registro la richiesta…</div>}

        {stato === "fatto" && (<>
          <CheckCircle2 size={40} style={{ color:C.green, marginBottom:10 }} />
          <div style={{ fontSize:17, fontWeight:700, marginBottom:8 }}>
            {gia ? "Eri già disiscritto" : "Disiscrizione registrata"}
          </div>
          <div style={{ fontSize:14, color:C.muted, lineHeight:1.6 }}>
            {email && <>L&apos;indirizzo <b style={{ color:C.text }}>{email}</b> non riceverà </>}
            {!email && <>Questo indirizzo non riceverà </>}
            più richieste dai clienti di BulkStrike.
            <br />Se è stato un errore, scrivi a{" "}
            <a href="mailto:davide@bulkstrike.com" style={{ color:"#0EA5E9" }}>davide@bulkstrike.com</a>.
          </div>
        </>)}

        {stato === "errore" && (<>
          <AlertTriangle size={40} style={{ color:C.red, marginBottom:10 }} />
          <div style={{ fontSize:17, fontWeight:700, marginBottom:8 }}>Link non valido</div>
          <div style={{ fontSize:14, color:C.muted, lineHeight:1.6 }}>
            Questo link di disiscrizione non è più valido. Scrivi a{" "}
            <a href="mailto:davide@bulkstrike.com" style={{ color:"#0EA5E9" }}>davide@bulkstrike.com</a>{" "}
            e provvediamo noi.
          </div>
        </>)}
      </div>
    </div>
  );
}
