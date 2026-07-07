// app/legale/page.jsx
// Documenti Legali BulkStrike — Termini e Condizioni · Privacy Policy · Cookie Policy
// Versione 1.2 — 28 giugno 2026. Ancore: #termini, #privacy, #cookie.
// Pagina statica pubblica: ricordati di rendere "legale" una rotta pubblica nel middleware.

export const metadata = {
  title: "Documenti Legali | BulkStrike",
  description:
    "Termini e Condizioni, Privacy Policy e Cookie Policy della piattaforma BulkStrike.",
};

const C = {
  blue: "#0EA5E9",
  text: "#0F172A",
  muted: "#475569",
  soft: "#64748B",
  border: "#E2E8F0",
  bg: "#F8FAFE",
  amber: "#D97706",
  green: "#059669",
};

function H({ id, n, children }) {
  return (
    <h2 id={id} style={{ scrollMarginTop: 90, fontSize: 22, fontWeight: 800, color: C.text, margin: "40px 0 6px" }}>
      <span style={{ color: C.blue }}>{n}</span> {children}
    </h2>
  );
}
function Art({ n, children }) {
  return (
    <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "22px 0 6px" }}>
      {n} {children}
    </h3>
  );
}
function P({ children }) {
  return <p style={{ fontSize: 15, lineHeight: 1.7, color: C.muted, margin: "8px 0" }}>{children}</p>;
}
function UL({ items }) {
  return (
    <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
      {items.map((it, i) => (
        <li key={i} style={{ fontSize: 15, lineHeight: 1.7, color: C.muted, margin: "4px 0" }}>{it}</li>
      ))}
    </ul>
  );
}
function Note({ tone = "amber", title, children }) {
  const map = {
    amber: { bg: "#FFFBEB", bd: "#FDE68A", fg: "#92400E" },
    green: { bg: "#ECFDF5", bd: "#A7F3D0", fg: "#065F46" },
    blue: { bg: "#EFF6FF", bd: "#BFDBFE", fg: "#1E40AF" },
  };
  const t = map[tone];
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 10, padding: "12px 14px", margin: "12px 0" }}>
      {title && <div style={{ fontWeight: 700, color: t.fg, fontSize: 14, marginBottom: 4 }}>{title}</div>}
      <div style={{ fontSize: 14, lineHeight: 1.6, color: t.fg }}>{children}</div>
    </div>
  );
}
function Table({ head, rows }) {
  return (
    <div style={{ overflowX: "auto", margin: "12px 0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} style={{ textAlign: "left", padding: "8px 10px", borderBottom: `2px solid ${C.border}`, color: C.text, fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, color: C.muted, verticalAlign: "top" }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LegalePage() {
  return (
    <div style={{ background: "#fff", color: C.text, fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.96)", position: "sticky", top: 0, zIndex: 20, backdropFilter: "blur(8px)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <a href="/" style={{ display: "flex", alignItems: "baseline", textDecoration: "none", fontWeight: 900, fontSize: 20, letterSpacing: "-0.03em" }}>
            <span style={{ color: C.text }}>Bulk</span>
            <span style={{ color: C.blue }}>Strike</span>
          </a>
          <nav style={{ display: "flex", gap: 18 }}>
            <a href="#termini" style={{ fontSize: 14, color: C.soft, textDecoration: "none", fontWeight: 600 }}>Termini</a>
            <a href="#privacy" style={{ fontSize: 14, color: C.soft, textDecoration: "none", fontWeight: 600 }}>Privacy</a>
            <a href="#cookie" style={{ fontSize: 14, color: C.soft, textDecoration: "none", fontWeight: 600 }}>Cookie</a>
          </nav>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.blue }}>Documenti Legali</div>
          <h1 style={{ fontSize: 30, fontWeight: 900, margin: "6px 0" }}>Termini · Privacy · Cookie</h1>
          <P>Versione 1.2 — 28 giugno 2026 · BulkStrike S.r.l. — legal@bulkstrike.com</P>
        </div>

        {/* ===================== TERMINI ===================== */}
        <H id="termini" n="Documento 1 —">Termini e Condizioni</H>
        <P>Condizioni Generali di Utilizzo della Piattaforma BulkStrike — BulkStrike S.r.l., Versione 1.2 — 28 giugno 2026.</P>

        <Art n="1.">Definizioni</Art>
        <P>Ai fini del presente documento si intende per: «Piattaforma» il sito web e i servizi accessibili su bulkstrike.com e relative applicazioni mobili, gestiti da BulkStrike S.r.l.; «BulkStrike» BulkStrike S.r.l., gestore della Piattaforma; «Utente» qualsiasi persona giuridica o soggetto giuridicamente equiparato registrato; «Acquirente» l'Utente che pubblica richieste, partecipa a Pool o acquista tramite Acquisto Rapido; «Fornitore» l'Utente che pubblica listini, partecipa ad aste o risponde a richieste; «Pool» l'aggregazione di domanda tra più Acquirenti per la stessa materia prima, scaglione e Fornitore; «Acquisto Rapido» l'acquisto immediato da listino a scaglioni; «Asta» la procedura competitiva a ribasso tra Fornitori; «WantedBoard» la bacheca pubblica di richieste aperte; «AI Assistant» l'agente intelligente integrato, basato su modelli di terze parti (Anthropic, Inc.); «TPIA» l'agenzia di ispezione terza indipendente in caso di dispute di qualità; «Escrow» il conto di garanzia gestito tramite Stripe; «Contratto di Fornitura» l'accordo generato automaticamente tra Acquirente e Fornitore al termine di ogni transazione.</P>

        <Art n="2.">Natura della Piattaforma</Art>
        <P>BulkStrike è una piattaforma di intermediazione tecnologica. Non è parte dei contratti di fornitura conclusi tra Acquirenti e Fornitori, non acquista né vende merci in proprio nome e non è responsabile della qualità, conformità o sicurezza dei prodotti scambiati. BulkStrike fornisce: (i) infrastruttura tecnologica per ricerca, aggregazione e negoziazione; (ii) servizio di escrow tramite partner certificati; (iii) facilitazione della procedura TPIA; (iv) l'AI Assistant come strumento operativo di ausilio.</P>
        <Note tone="amber" title="⚠ Nota">La Piattaforma non garantisce che ogni Pool raggiunga la soglia di attivazione, che ogni asta produca offerte idonee o che i Fornitori rispettino i termini concordati. Gli Utenti accettano tali rischi connaturati al mercato.</Note>

        <Art n="3.">Requisiti di Accesso e Registrazione</Art>
        <P>La Piattaforma è riservata esclusivamente a persone giuridiche (società, enti, cooperative, ditte individuali con P.IVA attiva). L'accesso di consumatori privati è espressamente escluso. Il rappresentante che completa la registrazione deve avere i poteri per vincolare giuridicamente l'ente rappresentato. La registrazione richiede: (i) P.IVA verificata tramite VIES UE o equivalente registro nazionale; (ii) visura camerale aggiornata (non anteriore a 6 mesi); (iii) accettazione firmata dei presenti Termini; (iv) per i Fornitori, upload delle certificazioni dichiarate.</P>

        <Art n="4.">Paesi Ammessi e Restrizioni Geografiche</Art>
        <P><b>4.1 Paesi Ammessi.</b> La Piattaforma è accessibile alle aziende regolarmente registrate in: tutti i 27 Stati Membri UE, Regno Unito, Svizzera, Norvegia, Islanda, Liechtenstein, Albania, Bosnia, Serbia, Montenegro, Kosovo, Macedonia del Nord, Moldova, Ucraina; Cina (RPC), Giappone, Corea del Sud, India, Taiwan, Hong Kong, Singapore, Malesia, Thailandia, Vietnam, Indonesia, Filippine, Australia, Nuova Zelanda, USA, Canada, Messico, Brasile, Argentina, Cile, Colombia, Perù, UAE, Arabia Saudita, Qatar, Kuwait, Israele, Turchia, Giordania, Marocco, Egitto, Tunisia, Sud Africa, Kenya, Senegal — fatti salvi i controlli individuali di cui all'art. 4.3.</P>
        <P><b>4.2 Paesi Esclusi — Embargo e Sanzioni EU/ONU.</b> Le seguenti nazioni sono escluse in applicazione delle misure restrittive UE e ONU o per incompatibilità con il quadro finanziario e logistico della Piattaforma:</P>
        <Table
          head={["Paese", "Base normativa", "Tipo di restrizione"]}
          rows={[
            ["Federazione Russa", "Sanzioni EU pacchetti 1–19 (2022–2026)", "Embargo commerciale settoriale esteso, restrizioni finanziarie"],
            ["Repubblica di Belarus", "Sanzioni EU — aggressione ucraina", "Embargo beni dual-use, misure finanziarie"],
            ["Corea del Nord (DPRK)", "Risoluzioni ONU + Sanzioni EU", "Embargo totale — proliferazione nucleare"],
            ["Iran", "Sanzioni EU + ONU", "Restrizioni commerciali e finanziarie settoriali"],
            ["Siria", "Sanzioni EU + ONU", "Embargo commerciale, conflitto armato in corso"],
            ["Myanmar", "Parziale — Embargo armi EU", "Accesso limitato — verifica individuale obbligatoria"],
          ]}
        />
        <P><b>4.3 Controllo Individuale.</b> Indipendentemente dal paese di registrazione, ogni Utente è soggetto a verifica rispetto alle liste di soggetti sanzionati EU (Consolidated Financial Sanctions List), ONU (UN Consolidated List) e OFAC-SDN USA. La registrazione da un paese ammesso non garantisce l'accesso se il soggetto o i suoi beneficiari effettivi figurano in tali liste. La verifica è condotta all'iscrizione e periodicamente durante il rapporto.</P>

        <Art n="5.">Prodotti Ammessi e Vietati</Art>
        <P><b>5.1 Ammessi.</b> Materie prime industriali sfuse legalmente commerciabili nell'UE: chimici industriali conformi a REACH, ingredienti alimentari food grade, polimeri e plastiche, materie prime minerali e metalliche, prodotti agroalimentari sfusi, principi attivi farmaceutici (API) con adeguata documentazione, additivi, solventi, coloranti industriali certificati.</P>
        <Note tone="amber" title="⚠ Divieto assoluto">La pubblicazione dei seguenti prodotti comporta sospensione immediata dell'account e segnalazione alle autorità competenti.</Note>
        <UL items={[
          "Armi, munizioni, esplosivi e componenti militari",
          "Sostanze stupefacenti, precursori di droghe e sostanze psicotrope",
          "Beni dual-use soggetti al Reg. (UE) 2021/821 senza autorizzazione governativa",
          "Agenti chimici da guerra (Convenzione CWC) e loro precursori",
          "Rifiuti pericolosi (Convenzione di Basilea) senza adeguate autorizzazioni",
          "Sostanze PFAS soggette a restrizioni REACH",
          "Prodotti contraffatti o privi di documentazione di origine autentica",
          "OGM non autorizzati nell'UE",
          "Materiali radioattivi senza licenza governativa",
          "Qualsiasi prodotto la cui compravendita violi sanzioni o embargo internazionali",
        ]} />

        <Art n="6.">Processo di Acquisto e Obblighi delle Parti</Art>
        <P><b>6.1 Acquisto Rapido.</b> Il Fornitore pubblica un listino a scaglioni con range min-max. Il prezzo mostrato è finale (prodotto + spedizione stimata per la destinazione + IVA) ed è garantito 30 minuti. La conferma genera un Contratto di Fornitura vincolante.</P>
        <P><b>6.2 Pool.</b> L'adesione a un Pool è un impegno condizionato all'attivazione: l'Acquirente si impegna ad acquistare se il Pool raggiunge la soglia entro il termine. Recesso gratuito prima dell'attivazione; dopo l'attivazione penale del 5% sull'importo individuale.</P>
        <P><b>6.3 Asta e Controfferta.</b> La partecipazione all'asta costituisce offerta irrevocabile per tutta la finestra. Il vincitore è obbligato a onorare l'offerta. L'Acquirente può proporre una controfferta entro 2 ore dalla chiusura; senza accordo si applicano le condizioni originali.</P>
        <P><b>6.4 Obblighi del Fornitore:</b> veridicità delle informazioni tecniche e disponibilità delle certificazioni; consegna conforme con documentazione completa (CMR, DDT, SDS, CoA); rispetto delle normative di export incluse le autorizzazioni dual-use; verifica che la destinazione non sia soggetta a sanzioni; listino e disponibilità aggiornati.</P>
        <P><b>6.5 Obblighi dell'Acquirente:</b> destinare la merce a usi leciti; verificare la conformità alle normative locali (REACH, autorizzazioni settoriali); pagare nei termini tramite escrow; segnalare non conformità entro 72 ore; non usare i Pool per finalità diverse dall'acquisto collettivo (cfr. art. 11).</P>

        <Art n="7.">Pagamenti ed Escrow</Art>
        <P><b>7.1 Soglia e metodi di pagamento.</b> I metodi di pagamento disponibili sono determinati per singolo sub-ordine, inteso come l'insieme dei prodotti di un medesimo Fornitore all'interno dello stesso ordine. Per i sub-ordini di importo pari o inferiore a €10.000 (IVA esclusa) il pagamento avviene tramite escrow standard secondo l'art. 7.2. Per i sub-ordini di importo superiore a €10.000 (IVA esclusa) l'Acquirente sceglie al momento del checkout tra escrow premium (art. 7.2), bonifico bancario anticipato (art. 7.3) o pagamento dilazionato (art. 7.4), ove quest'ultimo abilitato dal Fornitore.</P>
        <P><b>7.2 Escrow.</b> Il servizio di escrow è erogato tramite Stripe Payments Europe Ltd. L'Acquirente versa il corrispettivo alla conferma dell'ordine; i fondi sono trattenuti in garanzia e rilasciati al Fornitore entro 5 giorni lavorativi dalla conferma di consegna. In caso di contestazione i fondi restano bloccati fino alla risoluzione secondo la procedura di cui all'art. 8. Per i sub-ordini fino a €10.000 l'addebito avviene tramite SEPA Direct Debit; oltre tale soglia tramite carta (escrow premium).</P>
        <P><b>7.3 Bonifico bancario anticipato.</b> Scegliendo il bonifico anticipato, l'Acquirente versa il corrispettivo della merce direttamente sul conto corrente del Fornitore, il cui IBAN è visualizzato esclusivamente all'interno della Piattaforma. BulkStrike non comunica mai coordinate bancarie tramite email, messaggistica o altri canali esterni; l'Acquirente è invitato a diffidare di qualunque comunicazione di coordinate bancarie ricevuta al di fuori della Piattaforma. Scegliendo questo metodo, l'Acquirente prende atto che: (i) l'identità del Fornitore gli viene resa nota; (ii) il pagamento avviene al di fuori di qualunque circuito di garanzia, senza alcuna protezione in caso di mancata o difforme consegna; (iii) BulkStrike non riceve, detiene né trasferisce tali fondi e non risponde del buon esito del pagamento.</P>
        <P><b>7.4 Pagamento dilazionato.</b> Il Fornitore può abilitare singoli Acquirenti al pagamento dilazionato a 30 o 60 giorni, in modo personale e revocabile in ogni momento. L'Acquirente non abilitato può inoltrare una richiesta tramite la Piattaforma, che il Fornitore è libero di accogliere o rifiutare. Abilitando questo metodo, il Fornitore accetta che il rischio di credito derivante da mancato o ritardato pagamento è integralmente a proprio carico, che BulkStrike non presta alcuna garanzia in merito, e che i corrispettivi dovuti al vettore, comprensivi della commissione di piattaforma di cui all'art. 7.5, restano dovuti alle scadenze pattuite indipendentemente dall'avvenuto incasso da parte del Fornitore.</P>
        <P><b>7.5 Commissione di piattaforma.</b> Il corrispettivo per i servizi di intermediazione di BulkStrike è pari al 5% del costo del trasporto di ciascun sub-ordine, indipendentemente dalla soglia o dal metodo di pagamento scelto. Per i sub-ordini in escrow, la commissione è trattenuta all'atto del rilascio dei fondi al vettore. Per i sub-ordini pagati con bonifico anticipato o pagamento dilazionato, il vettore fattura al Fornitore il corrispettivo del trasporto comprensivo della commissione di piattaforma; BulkStrike richiede al vettore la propria quota con documento riepilogativo mensile.</P>
        <P><b>7.6 Costi del fornitore di pagamento.</b> Per il servizio di escrow standard (SEPA Direct Debit), l'Acquirente sostiene un costo di transazione fisso di €0,35, applicato dall'istituto di pagamento ed esposto come voce separata prima della conferma dell'ordine. Tale importo non costituisce una commissione di BulkStrike. Per l'escrow premium (carta), l'eventuale costo di transazione è comunicato prima della conferma dell'ordine.</P>

        <Art n="8.">Dispute di Qualità — Procedura TPIA</Art>
        <P>L'Acquirente che riceve merce non conforme deve: (i) aprire una contestazione entro 72 ore allegando documentazione (foto, analisi di laboratorio); (ii) attendere 48 ore per una risoluzione amichevole. In assenza di accordo, BulkStrike nomina una TPIA certificata: il suo giudizio è definitivo e vincolante. Il costo dell'ispezione è a carico della parte la cui tesi si riveli infondata. I fondi in escrow sono sbloccati in base all'esito TPIA.</P>

        <Art n="9.">AI Assistant — Condizioni Specifiche</Art>
        <UL items={[
          "È uno strumento di ausilio con valore indicativo: non è un consulente legale, finanziario o tecnico.",
          "Non esegue mai transazioni economiche senza conferma esplicita dell'Utente.",
          "Non garantisce l'accuratezza di analisi, trend o previsioni di prezzo.",
          "Non deve essere usato per prodotti vietati (art. 5.2) o per aggirare restrizioni geografiche (art. 4).",
          "BulkStrike non è responsabile per decisioni prese sulla base dei suoi suggerimenti.",
        ]} />
        <P><b>Trasparenza (Reg. UE 2024/1689 — AI Act, art. 50).</b> L'AI Assistant e gli agenti automatici di comunicazione dichiarano sempre, in modo chiaro, che l'Utente sta interagendo con un sistema di intelligenza artificiale. L'obbligo si applica dal 2 agosto 2026. In fase di registrazione l'Utente prende atto dell'uso dell'AI e acconsente al trattamento dei relativi input secondo la Privacy Policy; può comunque richiedere assistenza umana.</P>

        <Art n="10.">Proprietà Intellettuale</Art>
        <P>Marchi, algoritmi, strutture dati, tassonomia prodotti e contenuti originali sono di proprietà esclusiva di BulkStrike S.r.l. I dati immessi dagli Utenti restano di loro proprietà; gli Utenti concedono a BulkStrike una licenza non esclusiva e gratuita per l'uso in forma aggregata e anonimizzata (indici di prezzo, miglioramento dei servizi).</P>

        <Art n="11.">Clausola Antitrust</Art>
        <Note tone="amber" title="⚖ Impegno Obbligatorio — Art. 101 TFUE">La partecipazione ai Pool è limitata al coordinamento delle condizioni di approvvigionamento. È vietato discutere con altri partecipanti i propri prezzi di vendita, quote di produzione, strategie, clienti o mercati. Qualsiasi condivisione di informazioni commerciali sensibili tra concorrenti in un Pool viola il diritto della concorrenza UE. BulkStrike può segnalare alle autorità competenti i comportamenti anticoncorrenziali rilevati.</Note>
        <P><b>Libertà di prezzo.</b> Il Fornitore stabilisce in piena autonomia i propri prezzi; BulkStrike non impone, suggerisce o coordina prezzi minimi, massimi o consigliati. <b>Divieto di prezzi predatori:</b> il Fornitore non pratica prezzi sotto costo con finalità escludente (possibile abuso ex art. 102 TFUE e art. 3 L. 287/1990); un prezzo basso di per sé è legittima concorrenza. <b>Avvisi informativi:</b> quando un'offerta è sensibilmente inferiore a un riferimento di mercato aggregato, la Piattaforma può mostrare un avviso, che non impedisce di confermare l'offerta. <b>Monitoraggio:</b> in presenza di condotta continuativa potenzialmente predatoria, BulkStrike può richiedere chiarimenti, limitare l'account e segnalare all'AGCM. <b>Neutralità:</b> tali misure tutelano la concorrenza leale senza intervenire sulla determinazione dei prezzi.</P>

        <Art n="12.">Limitazione di Responsabilità</Art>
        <P>Nella misura massima consentita dalla legge, BulkStrike non è responsabile per danni indiretti o consequenziali, inadempimenti dei Fornitori, danni durante il trasporto o decisioni basate sui dati della Piattaforma o sui suggerimenti dell'AI. La responsabilità complessiva non può superare le commissioni pagate dall'Utente nei 12 mesi precedenti l'evento.</P>

        <Art n="13.">Riservatezza Commerciale</Art>
        <P>Gli Utenti mantengono riservate le informazioni commerciali apprese nelle negoziazioni (offerte, controfferte, prezzi negoziati, identità delle controparti). La divulgazione a terzi è vietata salvo consenso scritto o obbligo di legge.</P>

        <Art n="14.">Modifiche e Legge Applicabile</Art>
        <P>BulkStrike può modificare i Termini con preavviso di 30 giorni; l'uso continuato dopo il termine costituisce accettazione. Si applicano la legge italiana e il diritto UE. Foro competente per Utenti UE: Tribunale di [●]; per Utenti extra-UE, arbitrato internazionale secondo il Regolamento della Camera Arbitrale di Milano.</P>

        {/* ===================== PRIVACY ===================== */}
        <H id="privacy" n="Documento 2 —">Privacy Policy</H>
        <P>Informativa sul trattamento dei dati personali ai sensi del Reg. (UE) 2016/679 (GDPR) — Versione 1.2 — 28 giugno 2026.</P>

        <Art n="1.">Titolare del Trattamento e DPO</Art>
        <P>Titolare: BulkStrike S.r.l., Via [●], [CAP] [Città] (IT) — P.IVA [●] — privacy@bulkstrike.com. Responsabile della Protezione dei Dati (DPO): dpo@bulkstrike.com.</P>

        <Art n="2.">Ambito di Applicazione</Art>
        <P>Il GDPR si applica anche ai dati di contatto professionali (nome, email aziendale) quando identificano una persona fisica. I dati riferiti esclusivamente a persone giuridiche (ragione sociale, P.IVA, indirizzo legale) non sono dati personali ai sensi del GDPR, ma sono trattati con le medesime misure di sicurezza.</P>

        <Art n="3.">Categorie di Dati, Finalità e Basi Giuridiche</Art>
        <Table
          head={["Categoria", "Dati", "Finalità", "Base giuridica", "Conservazione"]}
          rows={[
            ["Registrazione", "Ragione sociale, P.IVA, rappresentante, email, telefono, visura, certificazioni", "Verifica identità, contratto, KYC/AML", "Art. 6(1)(b) + 6(1)(c)", "Rapporto + 5 anni"],
            ["Transazionali", "Storico ordini, Pool, aste, prezzi, volumi, documenti, fatture", "Esecuzione transazioni, escrow, fiscalità", "Art. 6(1)(b) + 6(1)(c)", "10 anni"],
            ["Utilizzo", "IP, browser, dispositivo, pagine, log API, sessioni", "Sicurezza, antifrode, miglioramento", "Art. 6(1)(f)", "12 mesi"],
            ["AI Assistant", "Log conversazioni anonimizzati", "Debug, miglioramento AI, supporto", "Art. 6(1)(b) + (f)", "30 gg completi, 12 mesi aggregati"],
            ["Verifica rischio", "Registri pubblici, liste sanzionati, banche dati creditizie", "Antifrode, AML/KYC", "Obbligo legale + legittimo interesse", "Rapporto + 5 anni"],
          ]}
        />

        <Art n="4.">Trasferimenti Internazionali</Art>
        <P>Per i trasferimenti verso paesi privi di decisione di adeguatezza UE sono adottate Standard Contractual Clauses (Dec. UE 2021/914).</P>
        <Table
          head={["Fornitore", "Paese", "Servizio", "Garanzia GDPR"]}
          rows={[
            ["Anthropic, Inc.", "USA", "AI Assistant (Claude API)", "SCC"],
            ["Stripe Payments Europe", "Irlanda (UE)", "Pagamenti ed Escrow", "Adeguatezza UE"],
            ["Supabase, Inc.", "USA", "Database e Autenticazione", "SCC + DPA"],
            ["Railway Corp.", "USA", "Backend / logica", "SCC"],
            ["Vercel Inc.", "USA", "Frontend / CDN / Hosting", "SCC"],
            ["Twilio SendGrid", "USA", "Email transazionali", "SCC"],
            ["DHL / GLS / BRT", "EU + extra-EU", "Track & trace spedizioni", "Adeguatezza UE / SCC"],
          ]}
        />
        <P>Per transazioni con controparti in Cina, India, Brasile, UAE e altri paesi non adeguati, i dati necessari all'esecuzione del contratto (ragione sociale, indirizzo di consegna, dati ordine) sono trasferiti ai sensi dell'Art. 49(1)(b) GDPR.</P>

        <Art n="5.">Diritti degli Interessati</Art>
        <P>Ogni persona fisica ha diritto di: accedere ai dati (Art. 15), rettificarli (16), cancellarli nei casi previsti (17), limitarne il trattamento (18), riceverli in formato portabile (20), opporsi al trattamento per legittimo interesse (21), non essere sottoposto a decisioni automatizzate con effetti giuridici significativi (22). Richieste a privacy@bulkstrike.com, risposta entro 30 giorni. Il diritto di cancellazione non è esercitabile durante i periodi di conservazione obbligatoria o in presenza di controversie attive. È possibile reclamare al Garante Privacy (garanteprivacy.it) o all'autorità del proprio paese.</P>

        <Art n="6.">Sicurezza dei Dati</Art>
        <UL items={[
          "Cifratura in transito (TLS 1.3) e a riposo (AES-256)",
          "Autenticazione a due fattori obbligatoria per tutti gli account",
          "Segregazione dati tramite Row Level Security (Supabase)",
          "Log di accesso e audit trail completo",
          "Test di penetrazione periodici (almeno annuali)",
          "Notifica data breach entro 72 ore all'autorità e agli interessati senza ritardo",
        ]} />

        <Art n="7.">Profilazione e Decisioni Automatizzate</Art>
        <P>BulkStrike usa processi automatizzati per: (i) suggerire Pool e Fornitori compatibili; (ii) calcolare il rating basato sullo storico; (iii) verificare la corrispondenza con liste sanzionati. Nessuna esclusione definitiva avviene senza revisione umana. L'AI Assistant non genera raccomandazioni di prezzo basate su dati aggregati dei concorrenti, in conformità con la normativa antitrust UE sul pricing algoritmico.</P>

        {/* ===================== COOKIE ===================== */}
        <H id="cookie" n="Documento 3 —">Cookie Policy</H>
        <P>Informativa sull'uso di cookie e tecnologie di tracciamento ai sensi della Direttiva ePrivacy 2002/58/CE e del GDPR — Versione 1.2 — 28 giugno 2026.</P>

        <Art n="1.">Cosa Sono i Cookie</Art>
        <P>I cookie sono piccoli file di testo memorizzati sul dispositivo durante la navigazione. BulkStrike usa cookie e tecnologie analoghe (localStorage, sessionStorage) per garantire il funzionamento della Piattaforma, ricordare le preferenze e migliorare l'esperienza.</P>

        <Art n="2.">Cookie Tecnici Essenziali — Sempre Attivi</Art>
        <Note tone="green" title="✓ Nessun consenso richiesto">Necessari al funzionamento della Piattaforma, non disabilitabili. Non raccolgono dati per finalità di marketing.</Note>
        <Table
          head={["Cookie", "Provider", "Durata", "Finalità"]}
          rows={[
            ["bs_session", "BulkStrike", "Sessione", "Autenticazione — mantiene attiva la sessione"],
            ["bs_csrf_token", "BulkStrike", "Sessione", "Protezione CSRF"],
            ["bs_auth_token", "BulkStrike", "7 giorni", "Token JWT persistente («ricordami»)"],
            ["sb-[hash]-auth-token", "Supabase", "7 giorni", "Autenticazione Supabase"],
            ["bs_cookie_consent", "BulkStrike", "12 mesi", "Memorizza le preferenze cookie"],
            ["bs_locale", "BulkStrike", "12 mesi", "Lingua e formato preferiti"],
          ]}
        />

        <Art n="3.">Cookie Funzionali — Consenso Richiesto</Art>
        <Table
          head={["Cookie", "Provider", "Durata", "Finalità"]}
          rows={[
            ["bs_dashboard_layout", "BulkStrike", "30 giorni", "Configurazione dashboard"],
            ["bs_notifications_prefs", "BulkStrike", "90 giorni", "Preferenze di notifica"],
            ["bs_ai_history", "BulkStrike", "30 giorni", "Storico recente AI (solo locale)"],
            ["bs_chart_timeframe", "BulkStrike", "30 giorni", "Timeframe preferito dei grafici"],
            ["bs_watchlist", "BulkStrike", "90 giorni", "Prodotti nella watchlist"],
          ]}
        />

        <Art n="4.">Cookie Analitici — Consenso Richiesto</Art>
        <Note tone="blue" title="Analisi aggregate e anonimizzate">Statistiche di utilizzo in forma anonima per migliorare la Piattaforma. Non profilano singoli utenti né servono pubblicità.</Note>
        <Table
          head={["Cookie", "Provider", "Durata", "Finalità"]}
          rows={[
            ["_bs_analytics_id", "Vercel Analytics", "12 mesi", "ID anonimo per analisi aggregate"],
            ["_bs_page_view", "Vercel Analytics", "Sessione", "Pagine visitate (anonime)"],
            ["_stripe_mid", "Stripe", "12 mesi", "Analisi anonima antifrode"],
            ["_stripe_sid", "Stripe", "30 minuti", "Sessione di pagamento"],
          ]}
        />

        <Art n="5.">Cookie di Marketing</Art>
        <Note tone="green" title="✓ BulkStrike non utilizza cookie di marketing">Piattaforma B2B professionale: nessuna pubblicità comportamentale, nessuna cessione a inserzionisti, nessun pixel di retargeting.</Note>

        <Art n="6.">Gestione del Consenso</Art>
        <P>Al primo accesso viene mostrato un banner conforme alla normativa ePrivacy e al GDPR: l'Utente può accettare, rifiutare o personalizzare le preferenze. La scelta è memorizzata nel cookie bs_cookie_consent (12 mesi) ed è modificabile in qualsiasi momento dal footer o dalle impostazioni dell'account. Il consenso ai cookie facoltativi non è condizione per l'uso della Piattaforma.</P>

        <Art n="7.">localStorage e sessionStorage</Art>
        <P>Usati per bozze non salvate, preferenze di visualizzazione grafici e cache locale delle ultime ricerche. Questi dati non sono trasmessi a terzi e restano sul dispositivo; possono essere cancellati dalle impostazioni del browser.</P>

        <Art n="8.">Gestione dai Browser</Art>
        <UL items={[
          "Chrome: Impostazioni → Privacy e sicurezza → Cookie e altri dati dei siti",
          "Firefox: Impostazioni → Privacy e sicurezza → Cookie e dati dei siti",
          "Safari: Preferenze → Privacy → Gestisci dati dei siti web",
          "Edge: Impostazioni → Cookie e autorizzazioni sito",
        ]} />
        <P>La disabilitazione dei cookie essenziali dal browser comprometterà l'autenticazione e il funzionamento della Piattaforma.</P>

        <Art n="9.">Aggiornamenti</Art>
        <P>La Cookie Policy è aggiornata all'aggiunta di nuove tecnologie di tracciamento; in caso di modifiche sostanziali il banner di consenso viene mostrato nuovamente.</P>

        <div style={{ marginTop: 48, paddingTop: 20, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
          <P>BulkStrike S.r.l. — Documenti Legali v1.2 — 28 giugno 2026. Tutti i diritti riservati.</P>
          <a href="/" style={{ color: C.blue, fontWeight: 600, textDecoration: "none", fontSize: 14 }}>← Torna alla home</a>
        </div>
      </div>
    </div>
  );
}
