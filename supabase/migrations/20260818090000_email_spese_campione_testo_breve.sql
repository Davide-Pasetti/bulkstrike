-- ============================================================================
-- SPESE DI SPEDIZIONE — testo unico fra popup ed email
--
-- Il popup di conferma ora dice "I costi di spedizione verranno concordati dopo
-- l'accettazione della richiesta." e l'email si allinea: una sola frase invece
-- di due varianti che dicevano quasi la stessa cosa in modo diverso.
--
-- ATTENZIONE, è una perdita voluta: cade "le spese di spedizione del campione
-- sono a carico del cliente". Nel popup era un promemoria per chi compra; nella
-- lettera al fornitore diceva CHI PAGA, cioè un dato commerciale su cui il
-- fornitore decide se accettare. Se un giorno serve rimetterlo, è questa la
-- chiave da cambiare ('spese_campione').
-- ============================================================================

create or replace function public.email_richiesta_testi(p_lingua text default 'it')
returns jsonb
language sql
immutable
as $fn$
  -- Un solo dizionario finché la lingua è una. Per aggiungere l'inglese basta
  -- avvolgere il tutto in un case su p_lingua.
  select jsonb_build_object(
      'oggetto_campione',   $t$Richiesta di campionatura$t$,
      'oggetto_preventivo', $t$Richiesta di preventivo$t$,
      'oggetto_contatto',   $t$Richiesta di contatto$t$,
      'saluto',             $t$Buongiorno {fornitore},$t$,
      'interesse',          $t$vi contatto perché sono interessato all'acquisto di {quantita}{prodotto}.$t$,
      'richiesta_campione', $t$Con la presente si chiede gentilmente la disponibilità all'invio di un campione del prodotto, al fine di valutarne le caratteristiche tecniche e la conformità alle nostre specifiche.$t$,
      'richiesta_preventivo', $t$Con la presente si chiede gentilmente di ricevere un preventivo per la fornitura del prodotto in oggetto, con indicazione di prezzo, tempi di consegna e condizioni di pagamento.$t$,
      'richiesta_contatto', $t$Con la presente si chiede gentilmente di essere ricontattati per valutare insieme una possibile fornitura del prodotto in oggetto.$t$,
      'note',               $t$Note del cliente: {messaggio}$t$,
      'specifiche_titolo',  $t$Specifiche richieste$t$,
      'spese_campione',     $t$I costi di spedizione verranno concordati dopo l'accettazione della richiesta.$t$,
      'pannello',           $t$Puoi accettare o rifiutare la richiesta dal tuo pannello BulkStrike.$t$,
      'chiusura',           $t$Restando in attesa di un Vostro cortese riscontro, porgo cordiali saluti.$t$,
      'piede_generata',     $t$Questa email è stata generata da un agente AI del sito BulkStrike.com per conto di {cliente}.$t$,
      'piede_iscrizione',   $t$Vi invitiamo a iscrivervi al link {url_registrati} per ricevere direttamente le richieste dai clienti.$t$,
      'piede_info',         $t$Per maggiori informazioni scrivere alla mail davide@bulkstrike.com.$t$,
      'piede_disiscrizione_html', $t$Se non si desidera più ricevere email, <a href="{url_unsub}" style="color:#64748B">cliccare qui</a>.$t$,
      'piede_disiscrizione_txt',  $t$Se non si desidera più ricevere email: {url_unsub}$t$
  );
$fn$;
revoke all on function public.email_richiesta_testi(text) from public, anon;
