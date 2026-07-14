BULKSTRIKE — STATO DEL PROGETTO

Ultimo aggiornamento: 14 luglio 2026 (versione precedente: 13 luglio 2026)

Documento di continuità: riassume tutto il progetto per poterlo riprendere
anche se la chat viene troncata o accorciata. Copia di lavoro nel repo
(docs/STATO_PROGETTO.md); il Google Doc "BulkStrike - STATO PROGETTO" in
Drive va allineato a questo contenuto.

================================================================
1. COS'È BULKSTRIKE
================================================================

Marketplace B2B per l'acquisto aggregato di materie prime sfuse industriali,
con modello ad ASTA A RIBASSO (aggregazione della domanda). Partenza dal
settore enologico (rete e competenze di Davide Pasetti, enologo), oggi esteso
a 13 macro-aree merceologiche, incluse le materie prime agricole (grano tenero
e duro, mais, orzo, risone) con prezzi di riferimento ufficiali ISMEA/CUN.

La piattaforma è LIVE in produzione: www.bulkstrike.com (dominio Namecheap,
deploy su Vercel). Visione "API-first / headless": usabile da umani e, in
prospettiva, da AI/ERP (server MCP e API OpenAPI restano obiettivi futuri).

================================================================
2. VINCOLI CRITICI (DA NON DIMENTICARE MAI)
================================================================

- SEPARAZIONE SOCIETARIA: BulkStrike sarà una S.r.l. autonoma, con P.IVA,
  conti e contabilità SEPARATI da Soc. Agr. Pasetti S.S. (la cantina di
  famiglia).
- STRIPE: BulkStrike usa un account Stripe NUOVO e dedicato (oggi in TEST
  mode, chiavi su Vercel come variabili Sensitive). MAI l'account Stripe
  della cantina collegato a pasettistore.com.
- STATO 'PAID' SOLO DAL WEBHOOK: gli ordini escrow diventano 'paid'
  esclusivamente via webhook Stripe payment_intent.succeeded. Nessun
  percorso "demo" deve marcare pagato un ordine reale.
- MIGRATION E PERMESSI: ogni CREATE OR REPLACE di view/funzioni resetta i
  grant ai default Supabase (scritture ad anon, EXECUTE a PUBLIC). Ogni
  migration che tocca oggetti già ristretti DEVE riapplicare i permessi
  corretti nella stessa migration (revoke da PUBLIC, non solo da anon).
- DATI PRODOTTO NEL DB, NON NEL REPO: prezzi, schede SDS/TDS, indici, flag
  ecc. vivono nella tabella products su Supabase. Aggiornarli = migration/UPDATE
  sul DB di produzione (non c'è un file da committare). Va sempre chiesta
  conferma prima di scrivere in produzione.
- WORKFLOW GIT: commit e push su main solo dopo build verde (npm run build).
  Sul PC di lavoro git non è nel PATH (si usa il git.exe di GitHub Desktop);
  sessioni parallele possono spingere su main → fare sempre fetch/rebase
  prima del push.
- RIFERIMENTI PROBABILMENTE SUPERATI (da confermare con Davide, non darli
  per validi): i vincoli storici su Wix (siteId di pasettistore.com e del
  sito "Bulkstrike") risalgono a prima dell'abbandono di Wix del 29/6/2026;
  il limite "Davide lavora solo da iPhone 13 mini" non riflette più il lavoro
  corrente da PC con Claude Code. Non ripetere queste voci come vincoli attivi.
- TERMINOLOGIA UTENTE: italiano ovunque, colori brand; nell'interfaccia mai le
  parole "pool" o "lead time" (si usa "asta a ribasso" / "tempi di consegna").

================================================================
3. MODELLO DI BUSINESS E MONETIZZAZIONE
================================================================

- Commissione sulla MERCE: ZERO (0%). Verificato nei trigger di produzione.
- Commissione piattaforma: 5% FLAT sulla SPEDIZIONE, in entrambi i flussi di
  pagamento (tradizionale ed escrow), registrata in commission_ledger da
  trigger già in produzione. Al buyer si applicano inoltre costi di servizio
  da trigger (inclusa la fee di elaborazione pagamento sull'escrow).
- Abbonamenti fornitori (tabella subscription_plans, seed in DB): Free 0€ /
  Pro 29€ mese - 299€ anno (trial 14 gg) / Enterprise 99€ mese - 999€ anno
  (API+MCP, analytics avanzate). Oggi 0 abbonamenti attivi: il billing degli
  abbonamenti NON è ancora collegato a Stripe (solo struttura dati).
- ACQUISTO RAPIDO: il compratore sceglie quantità e vede i fornitori con
  prezzo "tutto incluso"; può scegliere un fornitore più caro ma migliore.
- ASTA A RIBASSO a livello di PRODOTTO, ciclo 7 giorni; minimo per aprire
  CONFIGURABILE dall'admin per prodotto (products.min_pool_pallets, default
  1 pallet). Quantità per formato di vendita: sacchi / pallet / container / kg
  personalizzati (products.sacco_kg, pallet_kg, container_kg, nullable).
  Fornitori anonimi ("Fornitore #N") fino alla chiusura; l'asta chiude sempre;
  fase di controproposta anti-sniping post-chiusura (max +10 min).
- DUE MECCANISMI DISTINTI IN BASE AL N° DI FORNITORI (dal 14/7):
  * 2+ fornitori → "Asta a ribasso" completa (competizione, offerte live).
  * ESATTAMENTE 1 fornitore → "Acquisto di gruppo": si aggrega solo la domanda
    per sbloccare gli scaglioni di volume al prezzo fisso dell'unico fornitore
    (niente competizione né "offerte live"/"vince il più economico"). La UI
    cambia in base a get_pool_detail.available_suppliers.
- DIVIETO DI LEGGE SUGLI AGRICOLI GREZZI (dal 13-14/7): i 5 cereali grezzi
  (Grano tenero/duro, Granoturco, Orzo, Risone) NON possono essere oggetto di
  asta a doppio ribasso (Dir. UE 2019/633; D.Lgs. 198/2021 art. 5 c.1 lett. a):
  flag products.auction_restricted_by_law, blocco lato server su open_pool/
  join_pool/join_pool_at_target, avviso legale in UI, resta solo Acquisto Rapido.
- ALERT: pilastro del prodotto (asta / prezzo / nuovo fornitore / in chiusura /
  richiesta / superato). Alert-asta ON di default.
- Niente finanza/factoring; nessun interesse sul float (vincoli PSD2).

================================================================
4. STACK TECNICO (verificato nel repo/DB il 14/7/2026)
================================================================

- Frontend + backend applicativo: Next.js 16 (Turbopack, cacheComponents)
  su Vercel — repo GitHub Davide-Pasetti/nextjs-with-supabase, branch main.
- Database / auth / realtime / cron: Supabase (progetto uufueekpxboygcotqvhu).
  Migrations versionate in supabase/migrations; RPC SECURITY DEFINER con
  search_path fissato; RLS ovunque.
- Scheduling: pg_cron nel DB. Job attivi: tick aste ogni minuto (bs_close_pools,
  bs_closing_soon, bs_finalize_pools, bs_target_joins_closing_soon), auto-release
  consegne alle 3:00; ingest prezzi ISMEA (gio 19:00 UTC), CUN (lun 18:00 UTC)
  e indici Eurostat (giorno 8 del mese, 06:00 UTC) via net.http_post con
  x-cron-secret.
- Edge functions Supabase: ai-assistant (assistente AI con azioni + chat di
  supporto, Claude API), ingest-market-prices-ismea, ingest-market-prices-cun,
  ingest-market-prices-eurostat (indici PPI, JSON-stat, mensile), order-qr,
  send-delivery-confirmation (email).
- Supabase Storage: bucket pubblico "marketing" (video di presentazione della
  home). CSP estesa con media-src per il dominio Supabase.
- EMAIL: provider = RESEND. Oggi l'unico invio reale è la conferma di consegna
  dal bottone admin; la coda emails_outbox riceve le email transazionali da
  trigger/RPC ma NON ha ancora un drainer automatico che le spedisca.
- WhatsApp: integrazione Meta WhatsApp Cloud API (webhook Next.js + assistente
  ordini AI). NB: DDL di whatsapp_links/whatsapp_messages non versionato.
- Pagamenti: Stripe (test mode) — vedi sez. 7.
- Lingua: app monolingua ITALIANO hardcoded. Nessuna infrastruttura i18n.
- AI: Claude API (assistente, estrazione PDF CUN); grafici Recharts.

================================================================
5. CATALOGO E DATI DI MERCATO
================================================================

- Fonte di verità: Supabase. 618 prodotti, 13 macro-aree, 55 settori
  (products / sectors / product_sectors / macro_areas). I vecchi file Excel/CSV
  su Drive sono superati. Le 13 macro-aree sono ora ordinate per prossimità di
  filiera (agricoltura → chimica → materiali pesanti), ordine unico letto da
  get_taxonomy e usato ovunque (menu, catalogo, filtri).
- Prodotto canonico con attributo "grado" (tecnico/alimentare/farma).
- SCHEDE SDS/TDS: campi products.scheda_sicurezza_url / scheda_tecnica_url.
  Import del 14/7 dal CSV BulkStrike (match per CAS): 358 prodotti coperti,
  357 con SDS e 294 con TDS (i campi vuoti nel CSV lasciati null). Migrazioni
  import_sds_tds_batch_1..5.
- MATERIE PRIME AGRICOLE — prezzi €/kg reali per prodotto: market_price_history
  (147 righe: ISMEA su 4 prodotti + CUN Grano Duro; 5 prodotti agricoli).
  Ingest settimanale via pg_cron + edge functions; CUN estratto dal PDF di
  listinicun.it via AI.
- INDICI DI TENDENZA SETTORIALE (dal 13-14/7) — Eurostat PPI mercato domestico
  Italia, per settore NACE: market_index_history (212 righe, 4 serie: C241
  siderurgici, C244 metalli non ferrosi, C2016 plastiche/resine grezze, C20
  chimica). Mappatura via flag products.market_index_nace (119 prodotti).
  Sono INDICI di tendenza (base 2021=100), NON prezzi €/kg per prodotto: vanno
  sempre etichettati come "indice di settore — fonte Eurostat" con la dicitura
  informativa. Ingest mensile via edge function ingest-market-prices-eurostat.
- Formati di vendita per prodotto (sacco/pallet/container kg + minimo pool)
  editabili dal pannello admin prodotti.

================================================================
6. FUNZIONALITÀ LIVE (oltre a catalogo e aste)
================================================================

- Registrazione/login Supabase Auth; profili azienda (buyer / fornitore /
  corriere / platform admin); directory fornitori (189) e corrieri (7) e catalogo
  pubblici (le pagine di listing sono navigabili senza login), ma i CONTATTI e i
  dati sensibili del fornitore sono protetti.
- MASCHERAMENTO CONTATTI (sweep del 13/7): email/telefono del fornitore restano
  nascosti finché non c'è un ordine confermato tra le due aziende. Vale sia nella
  messaggistica sia nella scheda profilo fornitore (RPC get_supplier_profile:
  phone/email di supporto/nome referente sotto gating dell'ordine; P.IVA/PEC/SDI
  mai; IBAN/dati amministrativi mai). Logica condivisa has_confirmed_order_between
  (stati confermati: paid/shipped/delivered/accepted/completed; retroattiva). UI:
  invito a usare la messaggistica interna.
- Nome fornitore comunque OFFUSCATO per i visitatori anonimi ovunque.
- BANDIERE PAESE: componente condiviso CountryFlag (SVG inline, self-contained)
  al posto delle emoji bandiera Unicode (che su Windows si vedevano come le due
  lettere ISO). Con aria-label = nome paese esteso.
- Acquisto rapido + carrello + checkout multi-fornitore con spedizione; ordini
  con QR di ricezione e conferma di consegna via email (Resend).
- Aste/pool complete di controproposta, alert e chiusura automatica; distinzione
  "Asta a ribasso" (2+ fornitori) vs "Acquisto di gruppo" (1 fornitore); divieto
  d'asta sugli agricoli grezzi con avviso legale.
- ANDAMENTO PREZZI (nuova pagina pubblica /andamento-prezzi, 14/7): screener
  stile terminale di mercato con filtro per le 13 macro-aree; per ogni prodotto
  prezzo attuale BulkStrike + variazione "da gennaio". Espandendo un prodotto,
  grafico a DUE linee: A = prezzo storico proprietario BulkStrike (transazioni
  confermate: aste + Acquisto Rapido, RPC get_product_price_history); B =
  riferimento esterno (ISMEA/CUN €/kg del prodotto, oppure indice di settore
  Eurostat etichettato esplicitamente, su asse separato). Se manca una linea si
  mostra l'altra; se mancano entrambe, messaggio "storico non disponibile", mai
  grafico vuoto. Dicitura fonte solo sotto il dato esterno. Copertura oggi
  sparsa (cresce nel tempo). RPC get_price_screener.
- HOME rinnovata con DATI REALI: statistiche e claim reali (niente numeri finti);
  hero "asta più vicina" e griglia "Aste attive" da dati reali; box AI che apre
  l'assistente vero; widget "Market Intelligence" con prodotti agricoli reali
  (€/kg ISMEA/CUN) + 4 indici settoriali Eurostat, variazione "da gennaio" reale
  e dicitura fonte; video di presentazione (muto, verticale, su Supabase Storage)
  nella sezione "Come funziona" accanto ai 3 passaggi testuali.
- NAVIGAZIONE riorganizzata: voci nav = Aste attive · Prodotti · Andamento prezzi
  · Fornitori · Corrieri.
- Messaggistica buyer-fornitore in piattaforma; preferiti.
- Pannelli admin: prodotti e formati, apertura asta, gestione ordini
  post-consegna (re-invio email), health check Stripe (solo admin).
- Assistente AI in-app (mode assistant per loggati, mode support anche anonimi)
  + canale WhatsApp.
- Pagina /legale (T&C, privacy, cookie) da riallineare (cita ancora Railway).

================================================================
7. PAGAMENTI STRIPE — STATO
================================================================

- FASE 1 COLLEGATA E FUNZIONANTE IN TEST MODE: checkout escrow reale end-to-end
  — POST /api/stripe/create-payin crea UN PaymentIntent consolidato per tipo
  strumento (sepa_debit | carta) SOLO per gli ordini del checkout corrente
  (orderIds obbligatori, ownership+stato sotto RLS); PaymentElement nel checkout
  e nella pagina ordine; ordini in pending_payment fino al webhook
  payment_intent.succeeded (/api/webhooks/stripe, firma sul body raw). Ogni
  azienda ha già un customer Stripe persistente (companies.stripe_customer_id).
- PRECOMPILAZIONE DATI DI FATTURAZIONE (14/7): il PaymentElement riceve
  defaultValues.billingDetails dalla sede legale già nota (ragione sociale,
  email, indirizzo con paese convertito in ISO) → nome/indirizzo non si
  reinseriscono a ogni ordine. NON ancora fatto (Fase 2 dedicata, ~mezza
  giornata): salvare il metodo/IBAN con setup_future_usage + consenso mandato
  SCA — da riusare lo stesso meccanismo già costruito per l'asta, non crearne
  uno nuovo.
- Env webhook su Vercel (STRIPE_WEBHOOK_SECRET + SUPABASE_SERVICE_ROLE_KEY):
  le inserisce Davide; l'health check admin ne riporta ora la presenza.
- Modello confermato per le aste (FASE 2, da costruire lato UI): SetupIntent
  usage=off_session al join dell'asta con checkbox SCA dedicata; addebito
  off_session alla chiusura/aggiudicazione. Endpoint /api/stripe/setup-intent
  già pronto.
- Escrow su Stripe Connect "Separate Charges and Transfers": pay-in alla
  piattaforma, transfer al fornitore dopo la consegna (adapter
  lib/payments/escrowAdapter.js). Onboarding fornitori/corrieri e cron
  releaseFunds: da fare in Fase 2.
- Gotcha tecnici: istanza Stripe SEMPRE lazy via getStripe(); niente apiVersion
  custom; CSP già estesa ai domini Stripe.

================================================================
8. SICUREZZA — STATO
================================================================

- Hardening del 12/7: revoca scritture anon su tutte le tabelle; pools ristretta
  anche per authenticated; EXECUTE revocato da PUBLIC (non solo anon) su funzioni
  riservate; ALTER DEFAULT PRIVILEGES per le tabelle future; search_path fissato
  sulle funzioni commissioni.
- Sweep contatti del 13/7: mascheramento email/telefono in messaggistica e nel
  profilo fornitore, gating sull'ordine confermato (vedi sez. 6). Whitelist di
  campi business nel profilo; mai IBAN/dati fiscali amministrativi.
- Fix routing: catalogo/aste pubblici; alias /prodotti /categorie /aste; la
  nuova /andamento-prezzi è pubblica (esclusa dal gate del middleware).
- Divieto asta agricoli applicato ANCHE lato server (RPC), non solo in UI.
- CSP attiva (enforcing + report-only) con domini Stripe e media-src Supabase;
  TODO: script-src con nonce in enforcing.
- Protezione "leaked password" Supabase: in carico a Davide (dashboard).

================================================================
9. CONFORMITÀ LEGALE, ANTITRUST, FISCO
================================================================

- Novità 13-14/7: divieto d'asta a doppio ribasso sui prodotti agricoli/
  alimentari grezzi (Dir. UE 2019/633; D.Lgs. 198/2021) — implementato in DB+UI.
  Dicitura informativa obbligatoria ovunque compaia un dato di mercato ESTERNO
  (ISMEA/CUN/Eurostat), con fonte e link; non richiesta per il dato proprietario.
- Punti per l'AVVOCATO: antitrust asta inversa/anonimato; prezzi predatori;
  safeguard senza fissazione prezzi; escrow/PSD2 (Stripe Connect vs escrow
  "vero"); AI Act art. 50; T&C+privacy+cookie; mandato senza rappresentanza;
  separazione societaria; conformità D.Lgs. 198/2021 sul divieto d'asta agricoli.
- Punti per il COMMERCIALISTA: S.r.l. (ATECO 63.12.09); IVA intermediazione;
  ricavi = commissione logistica 5% + abbonamenti + servizi premium; contabilità
  escrow; separazione da Soc. Agr. Pasetti.
- AGGIORNARE dai professionisti anche: pagina /legale che cita Railway come
  sub-responsabile (non più vero) e l'elenco reale dei sub-responsabili (Vercel,
  Supabase, Stripe, Resend, Meta/WhatsApp, Anthropic, Eurostat come fonte dati).

================================================================
10. INVENTARIO FILE
================================================================

- FONTE DI VERITÀ DEL CODICE: repo GitHub Davide-Pasetti/nextjs-with-supabase
  (app Next.js + supabase/migrations + supabase/functions + docs/). I sorgenti
  sparsi su Drive sono COPIE SUPERATE.
- FONTE DI VERITÀ DEI DATI: DB Supabase (products, market_price_history,
  market_index_history, ecc.). CSV/Excel storici su Drive = superati.
- Google Drive (documenti non-codice): STATO PROGETTO (questo contenuto),
  BulkStrike_Catalogo_Tassonomia.md, documenti legali e specifica,
  BulkStrike_Abbonamenti.docx, analisi competitiva, CSV import SDS/TDS.

================================================================
11. IDENTIFICATIVI CHIAVE
================================================================

- Dominio: bulkstrike.com (Namecheap) → produzione www.bulkstrike.com.
- Supabase: progetto uufueekpxboygcotqvhu.
- Vercel: team team_jTWQEeTRp9VbJADw5VGpz6ri, progetto
  prj_LZkzKkAxJbPizbmZHe3DwiKjKand.
- Repo: github.com/Davide-Pasetti/nextjs-with-supabase (branch main).

================================================================
12. STATO ATTUALE E PROSSIMI PASSI
================================================================

FATTO (fino al 14/7): piattaforma live su bulkstrike.com; catalogo 618
prodotti/13 macro-aree (riordinate) con schede SDS/TDS importate; motore aste
completo con formati e minimo configurabile; distinzione Asta a ribasso /
Acquisto di gruppo; divieto asta agricoli (DB+UI+server); pipeline prezzi
ISMEA/CUN (€/kg agri) + indici settoriali Eurostat (metalli/plastica/chimica);
pagina Andamento prezzi (screener + grafico a due linee); home con dati reali,
Market Intelligence e video di presentazione; mascheramento contatti in
messaggistica e profilo fornitore; bandiere paese SVG; Stripe Fase 1 (pay-in
escrow on-session) funzionante in test mode + precompilazione fatturazione.

PROSSIMI PASSI (in ordine):
1) Stripe: verificare in test il ciclo pending_payment→paid sull'ordine-cavia
   (env webhook su Vercel a cura di Davide, endpoint registrato su Stripe).
2) Stripe Fase 2: salvataggio metodo/IBAN (setup_future_usage + consenso SCA,
   riusando il meccanismo dell'asta); UI SetupIntent al join asta; addebito
   off_session alla chiusura; onboarding Connect fornitori/corrieri; cron
   releaseFunds.
3) Drainer automatico di emails_outbox via Resend (oggi le email transazionali
   si accodano ma non partono, salvo conferma consegna manuale).
4) Pipeline prezzi: estendere copertura (altre fonti CUN, semi oleosi;
   ampliare la mappatura NACE oltre i 119 prodotti attuali).
5) CSP: script-src enforcing con nonce; migrazione eslint-config-next 15→16.
6) Versionare il DDL WhatsApp; collegare il billing abbonamenti a Stripe.
7) Correggere la pagina /legale (Railway → stack reale + sub-responsabili).
8) Validazione avvocato + commercialista PRIMA del lancio commerciale (incluso
   il modello commissioni 5% e la conformità D.Lgs. 198/2021).
