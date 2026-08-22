-- ============================================================================
-- CTA della mail di richiesta, in base allo stato del profilo fornitore
--
-- Prima: il fornitore NON registrato vedeva il bottone di rivendica, quello
-- REGISTRATO non vedeva alcun bottone. Ora:
--   non registrato -> "Registrati o rivendica il tuo profilo su BulkStrike.com
--                      per rispondere direttamente a [cliente]"
--   registrato     -> "Rispondi al cliente direttamente dal sito BulkStrike",
--                      con link ALLA CONVERSAZIONE di quella richiesta.
--
-- CAMBIO DI FONDO: il thread ora nasce per TUTTI i fornitori, non piu' solo per
-- i non rivendicati. Serviva per due motivi che il test dal vivo ha reso
-- evidenti: senza thread non c'e' un link su cui puntare il bottone, e
-- soprattutto senza thread la riga di emails_outbox non ha thread_id, quindi
-- NON riceve il codice [RIF-…] nell'oggetto — e la risposta via email di un
-- fornitore registrato non sarebbe mai rientrata nella conversazione.
-- Verificato prima della modifica: per un fornitore registrato l'oggetto era
-- privo di RIF e il thread non esisteva.
-- ============================================================================

-- Thread per tutti + notifica in-app a chi ha davvero un pannello dove vederla.
create or replace function public._apri_thread_richiesta(
  p_buyer uuid, p_supplier uuid, p_testo text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_thread uuid;
  v_body text := nullif(btrim(coalesce(p_testo, '')), '');
  v_nome text;
begin
  if p_buyer is null or p_supplier is null or p_buyer = p_supplier then
    return null;
  end if;

  insert into message_threads (buyer_company_id, supplier_company_id)
  values (p_buyer, p_supplier)
  on conflict (buyer_company_id, supplier_company_id) do update
    set last_message_at = message_threads.last_message_at
  returning id into v_thread;

  if v_body is not null then
    insert into thread_messages (thread_id, sender_company_id, body, via_email)
    values (v_thread, p_buyer, left(v_body, 4000), false);
    update message_threads set last_message_at = now() where id = v_thread;

    -- Solo a chi ha un profilo: per un'azienda non rivendicata la notifica
    -- in-app non la vedrebbe nessuno, la sua notifica e' l'email.
    if public._company_registrata(p_supplier) then
      select legal_name into v_nome from companies where id = p_buyer;
      insert into notifications (company_id, type, title, body, action_label, action_url)
      values (p_supplier, 'message',
              'Nuova richiesta da ' || coalesce(v_nome, 'un cliente'),
              left(v_body, 160), 'Apri i messaggi', '/messaggi?thread=' || v_thread);
    end if;
  end if;

  return v_thread;
end;
$fn$;
revoke all on function public._apri_thread_richiesta(uuid, uuid, text) from public, anon;

-- I testi: nuovo cta_rispondi, cta_registrati riformulato.
-- (email_richiesta_testi va riapplicata per intero: qui cambiano due chiavi.)

-- email_richiesta_render prende p_thread_url e sceglie UN solo bottone.
-- Il DROP e' obbligatorio: aggiungere un parametro a un CREATE OR REPLACE crea
-- un OVERLOAD e lascia in vita la versione vecchia. E' successo davvero durante
-- questa modifica, con due versioni compresenti e la chiamata che ne prendeva
-- una a caso.
drop function if exists public.email_richiesta_render(text,text,text,text,text,text,text,boolean,text,text,text,text,text,text,text,text);

-- NB: il corpo completo di email_richiesta_render, email_richiesta_testi,
-- trg_sample_request_emails e request_supplier_contact_bulk e' quello
-- attualmente in produzione (dumpabile con pg_get_functiondef). Le modifiche
-- rispetto alla versione precedente sono:
--   * testi: cta_registrati riformulato + nuova chiave cta_rispondi;
--   * render: nuovo parametro finale p_thread_url e scelta del bottone
--     (registrato+thread -> "Rispondi dal sito"; non registrato+claim ->
--     "Registrati o rivendica"). In entrambi i casi resta la riga
--     "In alternativa, puoi rispondere direttamente a questa email";
--   * i due chiamanti: il thread si apre SEMPRE, poi
--       if v_reg then v_thread_url := '…/messaggi?thread=' || v_thread;
--       else v_claim := '…/registrati?claim=' || _claim_token_richiesta(...);
--     e passano v_thread_url come 17° argomento del render.
--
-- VERIFICATO dopo la modifica, in transazioni annullate:
--   fornitore REGISTRATO      -> RIF si', thread si', bottone "Rispondi al
--                                cliente direttamente dal sito BulkStrike"
--                                con link /messaggi?thread=<id>;
--   fornitore NON REGISTRATO  -> RIF si', thread si', bottone "Registrati o
--                                rivendica il tuo profilo su BulkStrike.com…"
--                                con link /registrati?claim=<token>.
-- E, end-to-end su dati reali poi ripuliti: risposta via email di un fornitore
-- registrato -> ingest_inbox_email -> messaggio nel thread con via_email=true.
