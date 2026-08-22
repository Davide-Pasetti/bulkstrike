-- ============================================================================
-- reply_to anche sulla copia agli agenti di zona.
--
-- Il FROM e' info@updates.bulkstrike.com, sottodominio senza MX: senza
-- reply_to la risposta di un agente rimbalzava, e il codice [RIF-] che pure
-- c'e' nel suo oggetto non serviva a niente. La copia agli agenti nasce gia'
-- con thread_id (vedi _inoltra_richiesta_agente), quindi ora la risposta via
-- email rientra nella conversazione come quella di un fornitore.
--
-- Chiude il "si decidera' caso per caso" lasciato aperto dalla migration
-- 20260818130000, mai rivisto quando il sistema agenti e' nato il 20/08.
--
-- Il trigger trg_reply_to_default e' BEFORE INSERT: vale dalle prossime mail,
-- le righe gia' in emails_outbox restano com'erano (sono tutte gia' 'sent').
--
-- VERIFICATO: una sola versione della funzione; inserendo una riga
-- 'agent_request_copy' il trigger scrive reply_to = info@bulkstrike.com
-- (prova annullata con un'eccezione volontaria, nessuna riga di scarto);
-- i kind non elencati continuano a non prendere reply_to.
-- ============================================================================
create or replace function public._reply_to_per_kind(p_kind text)
returns text
language sql
immutable
as $fn$
  -- Un kind non elencato NON prende reply_to.
  select case coalesce(p_kind, '')
    when 'sample_request_supplier'              then 'info@bulkstrike.com'
    when 'supplier_contact_request_preventivo'  then 'info@bulkstrike.com'
    when 'supplier_contact_request_contatto'    then 'info@bulkstrike.com'
    when 'agent_request_copy'                   then 'info@bulkstrike.com'
    else null
  end;
$fn$;
-- CREATE OR REPLACE riazzera i grant: si ripristinano quelli verificati su
-- proacl prima della modifica (postgres, authenticated, service_role).
revoke all on function public._reply_to_per_kind(text) from public, anon;
grant execute on function public._reply_to_per_kind(text) to authenticated, service_role;
