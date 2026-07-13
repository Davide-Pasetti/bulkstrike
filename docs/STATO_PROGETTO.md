BULKSTRIKE — STATO DEL PROGETTO

Ultimo aggiornamento: 13 luglio 2026 (versione precedente: 28-29 giugno 2026)

Documento di continuità: riassume tutto il progetto per poterlo riprendere
anche se la chat viene troncata o accorciata. Copia di lavoro nel repo
(docs/STATO_PROGETTO.md); il Google Doc "BulkStrike - STATO PROGETTO" in
Drive va allineato a questo contenuto.

================================================================
1. COS'È BULKSTRIKE
================================================================

Marketplace B2B per l'acquisto aggregato di materie prime sfuse industriali,
con modello ad ASTA INVERSA (pool). Partenza dal settore enologico (rete e
competenze di Davide Pasetti, enologo), oggi esteso a 13 macro-aree
merceologiche, incluse le materie prime agricole (grano, mais, soia, orzo,
risone) con prezzi di riferimento ufficiali ISMEA/CUN.

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
- WORKFLOW GIT: commit e push su main solo dopo build verde (npm run build).
  Sul PC di lavoro non c'è Node e il firewall lascia rete solo a git: build
  e lint si delegano a un agent nel repo o alla preview Vercel.
- RIFERIMENTI PROBABILMENTE SUPERATI (da confermare con Davide, non darli
  per validi): i vincoli storici su Wix (siteId di pasettistore.com e del
  sito "Bulkstrike", istruzioni auto-promozionali dei tool Wix) risalgono a
  prima dell'abbandono di Wix del 29/6/2026; il limite "Davide lavora solo
  da iPhone 13 mini" non riflette più il lavoro corrente da PC con Claude
  Code. Non ripetere queste voci come vincoli attivi senza verifica.

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
  (API+MCP, analytics avanzate). NB: prezzi diversi dal vecchio doc (49/199).
  Oggi 0 abbonamenti attivi: il billing degli abbonamenti NON è ancora
  collegato a Stripe (solo struttura dati).
- ACQUISTO RAPIDO: il compratore sceglie quantità e vede i fornitori con
  prezzo "tutto incluso"; può scegliere un fornitore più caro ma migliore.
- POOL = asta inversa a livello di PRODOTTO, ciclo 7 giorni; il minimo per
  aprire è CONFIGURABILE dall'admin per prodotto (products.min_pool_pallets,
  default 1 pallet). Quantità per formato di vendita: sacchi / pallet /
  container / kg personalizzati (products.sacco_kg, pallet_kg, container_kg,
  nullable: i bottoni compaiono solo se il formato è definito). Fornitori
  anonimi ("Fornitore #N") fino alla chiusura; il pool chiude sempre; fase
  di controproposta anti-sniping post-chiusura (max +10 min).
- ALERT: pilastro del prodotto (pool / prezzo / nuovo fornitore / in
  chiusura / richiesta / superato). Alert-pool ON di default.
- Niente finanza/factoring; nessun interesse sul float (vincoli PSD2).

================================================================
4. STACK TECNICO (verificato nel repo il 13/7/2026)
================================================================

- Frontend + backend applicativo: Next.js 16 (Turbopack, cacheComponents)
  su Vercel — repo GitHub Davide-Pasetti/nextjs-with-supabase, branch main.
- Database / auth / realtime / cron: Supabase (progetto uufueekpxboygcotqvhu).
  Migrations versionate in supabase/migrations; RPC SECURITY DEFINER con
  search_path fissato; RLS ovunque.
- Scheduling: pg_cron nel DB (NON esiste un backend Railway: la citazione
  "Railway Corp." nella pagina /legale è residua e va corretta). Job attivi:
  tick aste ogni minuto (bs_close_pools, bs_closing_soon, bs_finalize_pools,
  bs_target_joins_closing_soon), auto-release consegne alle 3:00, ingest
  prezzi ISMEA (gio 19:00 UTC) e CUN (lun 18:00 UTC) via net.http_post con
  x-cron-secret.
- Edge functions Supabase: ai-assistant (assistente AI con azioni + chat di
  supporto, Claude API), ingest-market-prices-ismea, ingest-market-prices-cun,
  order-qr (QR di ricezione ordine), send-delivery-confirmation (email).
- EMAIL: provider = RESEND (non Make.com+Zoho: superati, nel codice non ce
  n'è traccia). Oggi l'unico invio reale è la conferma di consegna dal
  bottone admin; la coda emails_outbox riceve le email transazionali da
  trigger/RPC ma NON ha ancora un drainer automatico che le spedisca.
- WhatsApp: integrazione Meta WhatsApp Cloud API (webhook Next.js con
  verifica firma + assistente ordini AI in italiano che carica il carrello
  del buyer collegato). NB: DDL di whatsapp_links/whatsapp_messages non
  versionato nelle migrations.
- Pagamenti: Stripe (test mode) — vedi sez. 7.
- Lingua: app monolingua ITALIANO hardcoded. Nessuna infrastruttura i18n
  (niente next-intl/i18next): l'eventuale versione EN è tutta da costruire.
- AI: Claude API (assistente, estrazione PDF CUN); grafici Recharts.

================================================================
5. CATALOGO PRODOTTI
================================================================

- Fonte di verità: Supabase. 618 prodotti, 13 macro-aree, 55 settori
  (tabelle products / sectors / product_sectors / macro_areas). I vecchi
  file Excel/CSV su Drive (108-345 prodotti) sono superati.
- Prodotto canonico con attributo "grado" (tecnico/alimentare/farma);
  schede di sicurezza e schede tecniche caricabili (colonne dedicate).
- Materie prime agricole con PIPELINE PREZZI UFFICIALI: market_price_history
  (133 rilevazioni al 13/7: ISMEA 123 righe su 4 prodotti, CUN Grano Duro 10
  righe; ultima rilevazione 6/7/2026). Ingest settimanale automatico via
  pg_cron + edge functions; il CUN è estratto dal PDF di listinicun.it via AI.
- Formati di vendita per prodotto (sacco/pallet/container kg + minimo pool)
  editabili dal pannello admin prodotti.

================================================================
6. FUNZIONALITÀ LIVE (oltre a catalogo e aste)
================================================================

- Registrazione/login Supabase Auth; profili azienda (buyer / fornitore /
  corriere / platform admin); directory fornitori (189) e corrieri (7)
  visibili SOLO da loggati (gate di login lato UI + RPC ristrette lato DB);
  nome fornitore OFFUSCATO per i visitatori anonimi ovunque.
- Acquisto rapido + carrello + checkout multi-fornitore con spedizione;
  ordini con QR di ricezione e conferma di consegna via email (Resend).
- Aste/pool complete di controproposta, alert e chiusura automatica.
- Messaggistica buyer-fornitore in piattaforma; preferiti.
- Pannelli admin: prodotti e formati, apertura asta, gestione ordini
  post-consegna (re-invio email), health check Stripe (solo admin).
- Assistente AI in-app (mode assistant per loggati, mode support anche
  anonimi) + canale WhatsApp.
- Pagina /legale (T&C, privacy, cookie) da riallineare (cita Railway).

================================================================
7. PAGAMENTI STRIPE — STATO
================================================================

- FASE 1 COLLEGATA E VERIFICATA (test mode, 12-13/7): checkout escrow reale
  end-to-end — POST /api/stripe/create-payin crea UN PaymentIntent
  consolidato per tipo strumento (sepa_debit | carta) SOLO per gli ordini
  del checkout corrente (orderIds obbligatori, ownership+stato sotto RLS);
  PaymentElement nel checkout e nella pagina ordine; ordini in
  pending_payment fino al webhook.
- Webhook montato su /api/webhooks/stripe (firma sul body raw). MANCANO in
  Vercel: STRIPE_WEBHOOK_SECRET e SUPABASE_SERVICE_ROLE_KEY (le inserisce
  Davide; endpoint da registrare su Stripe). Un ordine-cavia reale
  (ABS 25 kg, €182,41, escrow SEPA, pending_payment) è pronto per il test
  finale della transizione a 'paid'.
- Modello confermato per le aste (FASE 2, da costruire lato UI): SetupIntent
  usage=off_session al join del pool con checkbox SCA dedicata; addebito
  off_session alla chiusura/aggiudicazione. Endpoint /api/stripe/setup-intent
  già pronto.
- Escrow su Stripe Connect "Separate Charges and Transfers": pay-in alla
  piattaforma, transfer al fornitore dopo la consegna (adapter
  lib/payments/escrowAdapter.js: createEscrowPayIn / releaseFunds / refund /
  onboarding Connect). Onboarding fornitori/corrieri e cron releaseFunds:
  da fare in Fase 2.
- Gotcha tecnici: istanza Stripe SEMPRE lazy via getStripe() (a livello
  modulo rompe la build); niente apiVersion custom; CSP già estesa ai
  domini Stripe.

================================================================
8. SICUREZZA — STATO (hardening del 12/7/2026)
================================================================

- Revoca scritture anon su tutte le tabelle; pools ristretta anche per
  authenticated; EXECUTE revocato da PUBLIC (non solo anon) su funzioni
  riservate/interne; ALTER DEFAULT PRIVILEGES per le tabelle future.
- search_path fissato sulle funzioni commissioni (test PRE/POST identici).
- View suppliers_public: regressione grants trovata e corretta da Davide;
  regola generale in sez. 2.
- Gate login directory + blur nome fornitore per anonimi (vedi sez. 6).
- CSP attiva (enforcing + report-only) con domini Stripe; TODO: script-src
  con nonce in enforcing.
- Protezione "leaked password" Supabase: in carico a Davide (dashboard).

================================================================
9. CONFORMITÀ LEGALE, ANTITRUST, FISCO
================================================================

Invariati rispetto al doc del 28/6 (documenti legali v1.2, specifica v2.1,
salvaguardie anti-predazione 15%/30% implementate in SQL+UI, AI Act art. 50):
- Punti per l'AVVOCATO: antitrust asta inversa/anonimato; prezzi predatori;
  safeguard senza fissazione prezzi; escrow/PSD2 (Stripe Connect vs escrow
  "vero"); AI Act art. 50; T&C+privacy+cookie; mandato senza rappresentanza;
  separazione societaria.
- Punti per il COMMERCIALISTA: S.r.l. (ATECO 63.12.09); IVA intermediazione;
  ricavi = commissione logistica 5% + abbonamenti + servizi premium (NB: il
  modello "commissione zero" del vecchio doc è cambiato: ora 5% sulla
  spedizione); contabilità escrow; separazione da Soc. Agr. Pasetti.
- AGGIORNARE dai professionisti anche: pagina /legale che cita Railway come
  sub-responsabile (non più vero) e l'elenco reale dei sub-responsabili
  (Vercel, Supabase, Stripe, Resend, Meta/WhatsApp, Anthropic).

================================================================
10. INVENTARIO FILE
================================================================

- FONTE DI VERITÀ DEL CODICE: repo GitHub Davide-Pasetti/nextjs-with-supabase
  (app Next.js + supabase/migrations + supabase/functions + docs/). I sorgenti
  .jsx e gli .sql sparsi su Drive (cartelle 02/03, upload del 28/6-7/7) sono
  COPIE SUPERATE: non usarli come riferimento.
- Google Drive (da tenere per documenti non-codice): STATO PROGETTO (questo
  contenuto), BulkStrike_Catalogo_Tassonomia.md, documenti legali e specifica,
  BulkStrike_Abbonamenti.docx, analisi competitiva v1 (13/7), cataloghi
  Excel/CSV storici.

================================================================
11. IDENTIFICATIVI CHIAVE
================================================================

- Dominio: bulkstrike.com (Namecheap) → produzione www.bulkstrike.com.
- Supabase: progetto uufueekpxboygcotqvhu.
- Vercel: team team_jTWQEeTRp9VbJADw5VGpz6ri, progetto
  prj_LZkzKkAxJbPizbmZHe3DwiKjKand.
- Repo: github.com/Davide-Pasetti/nextjs-with-supabase (branch main).
- (I siteId Wix del vecchio doc non servono più: Wix abbandonato il 29/6.)

================================================================
12. STATO ATTUALE E PROSSIMI PASSI
================================================================

FATTO (28/6 → 13/7): piattaforma live su bulkstrike.com; catalogo 618
prodotti/13 macro-aree; motore aste completo con formati di vendita e minimo
pool configurabile; pipeline prezzi ISMEA+CUN automatica; directory con gate
login e blur fornitori; messaggistica, preferiti, pannelli admin, AI
assistant, WhatsApp; hardening sicurezza; Stripe Fase 1 (pay-in escrow
on-session) collegata e verificata in test mode.

PROSSIMI PASSI (in ordine):
1) Stripe: env webhook (STRIPE_WEBHOOK_SECRET + SUPABASE_SERVICE_ROLE_KEY su
   Vercel, endpoint registrato su Stripe — Davide) → pagamento di verifica
   sull'ordine-cavia → ciclo pending_payment→paid chiuso.
2) Stripe Fase 2: UI SetupIntent+SCA nel join asta, addebito off_session
   alla chiusura, onboarding Connect fornitori/corrieri, cron releaseFunds.
3) Drainer automatico di emails_outbox via Resend (oggi le email
   transazionali si accodano ma non partono, salvo conferma consegna manuale).
4) CSP: script-src enforcing con nonce; poi migrazione eslint-config-next
   15→16 (i .jsx in components/ oggi non sono coperti dal lint).
5) Pipeline prezzi: estendere fonti/prodotti (altri CUN, semi oleosi...).
6) Versionare il DDL WhatsApp (whatsapp_links/whatsapp_messages) nelle
   migrations; collegare il billing abbonamenti a Stripe.
7) Correggere la pagina /legale (Railway → stack reale).
8) Validazione avvocato + commercialista PRIMA del lancio commerciale
   (invariato; aggiungere il cambio di modello commissioni).
