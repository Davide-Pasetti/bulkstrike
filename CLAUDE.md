## Workflow Git
- Al termine di ogni modifica o task completato, fai sempre git add, git commit (con un messaggio conventional commit, es. "fix:", "feat:") e git push su main automaticamente, senza chiedere conferma.
- Fai questo solo dopo aver verificato che la build (npm run build) sia verde.
- Se la build fallisce, non fare commit/push: correggi prima l'errore.
- Sessioni parallele possono spingere su main: fai sempre fetch/rebase prima del push.

## Terminologia interfaccia (vincolante)
- Tutta l'interfaccia utente è in ITALIANO.
- Mai le parole "pool" o "lead time" visibili all'utente: si dice "asta a ribasso" e "tempi di consegna" / "tempi di preparazione".

## Blocco legale prodotti agricoli (D.Lgs. 198/2021 — NON toccare senza verifica)
- Le aste elettroniche a doppio ribasso sono VIETATE sui prodotti agricoli/alimentari grezzi.
- I prodotti con products.auction_restricted_by_law = true (grano tenero, grano duro, granoturco, orzo, risone, + soia/farina di soia) hanno SOLO Acquisto Rapido quando esistono 2+ fornitori in competizione; l'"acquisto di gruppo" (1 solo fornitore, prezzo fisso) è consentito.
- Il blocco è applicato lato server in open_pool, join_pool, join_pool_at_target, place_bid, submit_counter_offer: qualunque modifica a queste RPC va verificata PRIMA e DOPO contro questo vincolo.

## Sicurezza
- Mai maneggiare chiavi/credenziali per conto di Davide (env su Vercel/Supabase le inserisce lui).
- Gli ordini diventano 'paid' SOLO dal webhook Stripe (mark_order_paid_demo è solo service_role).
- Ogni CREATE OR REPLACE di view/funzioni resetta i grant ai default: riapplicare i permessi nella stessa migration (revoke da PUBLIC, non solo da anon).
- Verificare sempre dal vivo (comportamento reale in produzione, non solo build verde) prima di dichiarare qualcosa completato.
