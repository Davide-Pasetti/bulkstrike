-- ============================================================================
-- La casella del relay passa da commercial@bulkstrike.com a info@bulkstrike.com
-- (la prima e' stata eliminata su Zoho, la seconda e' attiva).
--
-- Due cose distinte cambiano insieme, ed e' voluto:
--   1) la mailbox LETTA dal job IMAP (imap_state);
--   2) il reply_to delle mail ai fornitori, cioe' l'indirizzo a cui rispondono.
-- Devono restare la stessa casella: se divergono, le risposte arrivano dove
-- nessuno le legge e non rientrano mai nelle conversazioni.
--
-- Le migration 20260818130000 e 20260820100000 nominano ancora commercial@:
-- restano come sono di proposito, registrano cosa fu applicato allora. Questa
-- le supera; la storia non si riscrive.
--
-- NB il lato edge function e' nel commit che accompagna questa migration:
-- ingest-inbox-imap usa ZOHO_IMAP_USER con default info@bulkstrike.com. Se il
-- secret ZOHO_IMAP_USER e' valorizzato vince lui, quindi dopo un cambio di
-- casella va aggiornato o rimosso.
-- ============================================================================

-- reply_to: e' l'indirizzo che il fornitore vede e a cui risponde.
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
    else null
  end;
$fn$;
-- CREATE OR REPLACE riazzera i grant ai default (EXECUTE a PUBLIC): si
-- ripristinano quelli che c'erano davvero, verificati su proacl prima della
-- modifica -> postgres, authenticated, service_role. Niente anon.
revoke all on function public._reply_to_per_kind(text) from public, anon;
grant execute on function public._reply_to_per_kind(text) to authenticated, service_role;

-- Casella nuova, contatore da zero. Non e' una perdita: la riga di
-- commercial@ era ferma a last_uid=0 con uidvalidity null e last_error
-- "Invalid credentials", e emails_inbox e' vuota — non ha mai letto nulla di
-- reale. Su una casella diversa gli UID ripartono comunque da capo.
delete from public.imap_state where mailbox = 'commercial@bulkstrike.com';
insert into public.imap_state (mailbox) values ('info@bulkstrike.com')
  on conflict (mailbox) do nothing;

-- APERTO, non risolto qui: il kind 'agent_request_copy' non ha reply_to (la
-- mappa sopra copre solo i tre kind al fornitore, per la scelta esplicita del
-- 18/08 "per gli altri si decidera' caso per caso"). Il FROM e'
-- info@updates.bulkstrike.com, sottodominio senza MX: la risposta di un agente
-- oggi rimbalza, e il codice [RIF-] che pure c'e' nel suo oggetto non serve a
-- niente. Va deciso, non e' un refuso di questo cambio.
