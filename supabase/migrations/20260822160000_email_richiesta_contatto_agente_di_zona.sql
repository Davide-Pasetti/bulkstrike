-- ============================================================================
-- COPY: la richiesta di CONTATTO nomina anche l'agente di zona.
--
-- Cambia solo la chiave 'richiesta_contatto'. 'richiesta_preventivo' resta com'e':
-- e' l'altro kind della stessa tabella supplier_contact_requests, ma chiede
-- prezzo/tempi/pagamento e la frase sull'essere ricontattati non c'entra.
-- 'richiesta_campione' (sample_requests) non si tocca.
-- Nessuna modifica al layout: il render non cambia.
--
-- La funzione si riscrive per intero, non per sostituzione parziale: e' gia'
-- successo che una string-replace fallisse in silenzio lasciando il vecchio
-- testo. Verificato dopo: una sola versione della funzione, e nel render di
-- 'contatto' la frase nuova compare sia in HTML sia in text, mentre
-- 'preventivo' e 'campione' non contengono "agente di zona".
-- ============================================================================
create or replace function public.email_richiesta_testi(p_lingua text default 'it'::text)
returns jsonb
language sql
immutable
as $function$
  select jsonb_build_object(
      'oggetto_campione',   $t$Richiesta di campionatura$t$,
      'oggetto_preventivo', $t$Richiesta di preventivo$t$,
      'oggetto_contatto',   $t$Richiesta di contatto$t$,
      'saluto',             $t$Buongiorno {fornitore},$t$,
      'interesse',          $t$vi contatto perché sono interessato all'acquisto di {quantita}{prodotto}.$t$,
      'richiesta_campione', $t$Con la presente si chiede gentilmente la disponibilità all'invio di un campione del prodotto, al fine di valutarne le caratteristiche tecniche e la conformità alle nostre specifiche.$t$,
      'richiesta_preventivo', $t$Con la presente si chiede gentilmente di ricevere un preventivo per la fornitura del prodotto in oggetto, con indicazione di prezzo, tempi di consegna e condizioni di pagamento.$t$,
      'richiesta_contatto', $t$Con la presente si chiede gentilmente di essere ricontattati direttamente, o da un vostro agente di zona, per valutare insieme una possibile fornitura del prodotto in oggetto.$t$,
      'note',               $t$Note del cliente: {messaggio}$t$,
      'specifiche_titolo',  $t$Specifiche richieste$t$,
      'spese_campione',     $t$I costi di spedizione verranno concordati dopo l'accettazione della richiesta.$t$,
      'pannello',           $t$Puoi accettare o rifiutare la richiesta dal tuo pannello BulkStrike.$t$,
      'chiusura',           $t$Restando in attesa di un Vostro cortese riscontro, porgo cordiali saluti.$t$,
      'cta_registrati',     $t$Registrati o rivendica il tuo profilo su BulkStrike.com per rispondere direttamente a {cliente}$t$,
      'cta_rispondi',      $t$Rispondi al cliente direttamente dal sito BulkStrike$t$,
      'cta_nota',           $t$Se ti registri con l'email della tua azienda, l'accesso è immediato; altrimenti verificheremo la richiesta a mano.$t$,
      'cta_alternativa',    $t$In alternativa, puoi rispondere direttamente a questa email.$t$,
      'piede_generata',     $t$Questa email è stata generata da un agente AI del sito BulkStrike.com per conto di {cliente}.$t$,
      'piede_info',         $t$Per maggiori informazioni in merito al sito BulkStrike scrivere alla mail davide@bulkstrike.com.$t$,
      'piede_disiscrizione_html', $t$Se non si desidera più ricevere email, <a href="{url_unsub}" style="color:#64748B">cliccare qui</a>.$t$,
      'piede_disiscrizione_txt',  $t$Se non si desidera più ricevere email: {url_unsub}$t$
  );
$function$;
-- CREATE OR REPLACE riazzera i grant: si ripristinano quelli verificati su
-- proacl prima della modifica (postgres, authenticated, service_role).
revoke all on function public.email_richiesta_testi(text) from public, anon;
grant execute on function public.email_richiesta_testi(text) to authenticated, service_role;
