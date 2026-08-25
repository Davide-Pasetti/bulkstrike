-- ============================================================================
-- RELAY: verifica del mittente prima di pubblicare in conversazione.
--
-- Il test dal vivo del 24/08 ha mostrato il buco: una mail spedita da un
-- indirizzo estraneo (esempio@dominio.it) e' entrata nel thread attribuita al
-- fornitore, solo perche' l'oggetto conteneva il codice giusto. I codici [RIF-]
-- viaggiano in chiaro nell'oggetto di mail vere: un inoltro o una casella
-- compromessa bastano a conoscerli. Da soli non provano chi scrive.
--
-- Tre esiti, non due:
--   verificato         -> dominio del mittente fra quelli noti del fornitore;
--   non_corrispondente -> domini noti ci sono ma non combaciano: la mail NON
--                         entra in conversazione, resta in "Mail ricevute";
--   non_verificabile   -> del fornitore non conosciamo nessun indirizzo (caso
--                         comune per i non registrati): si pubblica, ma il
--                         messaggio porta un contrassegno.
-- Bloccare anche il terzo caso avrebbe mandato in revisione manuale quasi
-- tutte le risposte, rendendo il relay inutile.
--
-- VERIFICATO su dati reali, con transazioni annullate:
--   esempio@dominio.it (dominio estraneo)  -> mittente_non_corrispondente,
--     nessun messaggio creato (thread fermo a 1);
--   ufficio@dominio-fornitore.it, stesso thread -> agganciata, verificato;
--   fornitore con recapiti azzerati        -> agganciata, mittente=
--     non_verificabile, thread_messages.sender_unverified = true;
--   admin_pubblica_mail_inbox senza utente -> NOT_ADMIN.
--
-- ATTENZIONE ai grant: revocare da "public, anon" NON basta. I default
-- privileges del progetto assegnano EXECUTE anche ad authenticated alla
-- creazione della funzione. Per i due helper interni va revocato pure lui,
-- altrimenti qualunque utente loggato puo' leggere i domini email di
-- qualsiasi azienda (_domini_noti) o sondarli uno a uno (_esito_mittente).
-- ============================================================================

-- Il corpo ripulito ora si conserva: serve all'admin per decidere se
-- pubblicare, e serve alla RPC di pubblicazione manuale. Prima veniva usato
-- e buttato via, e per le mail solo-HTML (Outlook) in "Mail ricevute" si
-- vedeva un estratto vuoto — su una riga vuota non si decide niente.
alter table public.emails_inbox add column if not exists body_clean text;
comment on column public.emails_inbox.body_clean is
  'Corpo ripulito da citazioni e firme, come finisce nel thread.';

alter table public.thread_messages add column if not exists sender_unverified boolean not null default false;
comment on column public.thread_messages.sender_unverified is
  'true = non abbiamo potuto confermare che il mittente sia davvero il fornitore.';

-- Domini che riconduciamo a un'azienda: contatti, sito, e le persone che
-- hanno un profilo su quell'azienda.
create or replace function public._domini_noti(p_company uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select coalesce(array_agg(distinct d), '{}'::text[])
  from (
    select lower(btrim(split_part(v.x, '@', 2))) as d
    from companies c
    cross join lateral (values (c.email_mgmt), (c.support_email), (c.email_admin), (c.pec)) v(x)
    where c.id = p_company and coalesce(v.x, '') like '%@%'
    union all
    select lower(regexp_replace(regexp_replace(regexp_replace(
             btrim(c.website), '^[a-zA-Z]+://', ''), '/.*$', ''), '^www\.', ''))
    from companies c
    where c.id = p_company and btrim(coalesce(c.website, '')) <> ''
    union all
    select lower(btrim(split_part(coalesce(nullif(btrim(p.email), ''), u.email), '@', 2)))
    from profiles p left join auth.users u on u.id = p.id
    where p.company_id = p_company
      and coalesce(nullif(btrim(p.email), ''), u.email) like '%@%'
  ) s
  where d is not null and d <> '';
$fn$;
revoke all on function public._domini_noti(uuid) from public, anon, authenticated;
grant execute on function public._domini_noti(uuid) to service_role;

create or replace function public._esito_mittente(p_company uuid, p_from text)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_dom  text := lower(btrim(split_part(coalesce(p_from, ''), '@', 2)));
  v_noti text[];
begin
  -- Mittente illeggibile: trattato come non corrispondente, non come ignoto.
  if v_dom = '' then return 'non_corrispondente'; end if;
  v_noti := public._domini_noti(p_company);
  if coalesce(array_length(v_noti, 1), 0) = 0 then return 'non_verificabile'; end if;
  if v_dom = any (v_noti) then return 'verificato'; end if;
  return 'non_corrispondente';
end;
$fn$;
revoke all on function public._esito_mittente(uuid, text) from public, anon, authenticated;
grant execute on function public._esito_mittente(uuid, text) to service_role;

create or replace function public.ingest_inbox_email(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mailbox text := payload->>'mailbox';
  v_uid     bigint := (payload->>'imap_uid')::bigint;
  v_uidval  bigint := (payload->>'uidvalidity')::bigint;
  v_subject text := payload->>'subject';
  v_from    text := lower(nullif(payload->>'from_email',''));
  v_corpo   text := nullif(btrim(coalesce(payload->>'body_clean', payload->>'body_text', '')), '');
  v_id      uuid;
  v_match   record;
  v_t       message_threads%rowtype;
  v_msg     uuid;
  v_nota    text;
  v_esito   text;
  v_forn    text;
begin
  if v_mailbox is null or v_uid is null or v_uidval is null then
    raise exception 'PAYLOAD_INCOMPLETO';
  end if;

  insert into emails_inbox (
    mailbox, imap_uid, uidvalidity, message_id, in_reply_to, refs,
    from_email, from_name, to_email, subject, body_text, body_html, body_clean, received_at)
  values (
    v_mailbox, v_uid, v_uidval, payload->>'message_id', payload->>'in_reply_to', payload->>'refs',
    v_from, payload->>'from_name', lower(nullif(payload->>'to_email','')),
    v_subject, payload->>'body_text', payload->>'body_html', v_corpo,
    nullif(payload->>'received_at','')::timestamptz)
  on conflict (mailbox, uidvalidity, imap_uid) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('stato', 'gia_presente');
  end if;

  select * into v_match from public.thread_da_oggetto(v_subject);

  if v_match.thread_id is null then
    v_nota := case
      when v_subject is null or v_subject !~* '\[RIF-[A-Z0-9]{8}\]'
        then 'Nessun codice RIF nell''oggetto: rimosso dal fornitore, oppure e'' una mail nuova non legata a una richiesta.'
      else 'Codice RIF presente ma non corrisponde a nessuna richiesta inviata.'
    end;
    update emails_inbox set match_note = v_nota where id = v_id;
    return jsonb_build_object('stato', 'senza_aggancio', 'id', v_id, 'nota', v_nota);
  end if;

  if v_corpo is null then
    update emails_inbox set thread_id = v_match.thread_id,
      match_note = 'Conversazione trovata, ma il corpo e'' risultato vuoto dopo la ripulitura: da leggere a mano.'
     where id = v_id;
    return jsonb_build_object('stato', 'corpo_vuoto', 'id', v_id, 'thread_id', v_match.thread_id);
  end if;

  select * into v_t from message_threads where id = v_match.thread_id;

  -- Il codice nell'oggetto dice A QUALE conversazione appartiene la mail,
  -- non CHI l'ha scritta. Quest'ultima e' la domanda che conta.
  v_esito := public._esito_mittente(v_t.supplier_company_id, v_from);

  if v_esito = 'non_corrispondente' then
    select legal_name into v_forn from companies where id = v_t.supplier_company_id;
    v_nota := 'Mittente ' || coalesce(v_from, '(illeggibile)')
              || ' estraneo ai domini noti di ' || coalesce(v_forn, 'questo fornitore')
              || ': non pubblicata nella conversazione, da verificare a mano.';
    update emails_inbox set thread_id = v_t.id, match_note = v_nota where id = v_id;
    return jsonb_build_object('stato', 'mittente_non_corrispondente', 'id', v_id,
                              'thread_id', v_t.id, 'nota', v_nota);
  end if;

  insert into thread_messages (thread_id, sender_company_id, body, via_email, sender_unverified)
  values (v_t.id, v_t.supplier_company_id, left(v_corpo, 4000), true, v_esito = 'non_verificabile')
  returning id into v_msg;

  update message_threads set last_message_at = now() where id = v_t.id;

  update emails_inbox
     set processed = true, thread_id = v_t.id, thread_message_id = v_msg, match_note = null
   where id = v_id;

  insert into notifications (company_id, type, title, body, action_label, action_url)
  values (v_t.buyer_company_id, 'message', 'Risposta dal fornitore',
          left(v_corpo, 160), 'Apri i messaggi', '/messaggi?thread=' || v_t.id);

  return jsonb_build_object('stato', 'agganciata', 'id', v_id, 'thread_id', v_t.id,
                            'thread_message_id', v_msg, 'mittente', v_esito);
end;
$function$;
revoke all on function public.ingest_inbox_email(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_inbox_email(jsonb) to service_role;

-- Pubblicazione manuale di una mail trattenuta: la decide un admin dopo aver
-- letto chi scrive. Il messaggio nasce sempre contrassegnato, perche' il
-- controllo automatico non e' bastato.
create or replace function public.admin_pubblica_mail_inbox(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_admin boolean;
  v_e     emails_inbox%rowtype;
  v_t     message_threads%rowtype;
  v_corpo text;
  v_msg   uuid;
begin
  select coalesce(c.is_platform_admin, false) into v_admin
  from profiles p join companies c on c.id = p.company_id
  where p.id = auth.uid();
  if not coalesce(v_admin, false) then raise exception 'NOT_ADMIN'; end if;

  select * into v_e from emails_inbox where id = p_id;
  if v_e.id is null then raise exception 'MAIL_INESISTENTE'; end if;
  if v_e.processed then raise exception 'GIA_PUBBLICATA'; end if;
  if v_e.thread_id is null then raise exception 'NESSUNA_CONVERSAZIONE'; end if;

  v_corpo := nullif(btrim(coalesce(v_e.body_clean, v_e.body_text, '')), '');
  if v_corpo is null then raise exception 'CORPO_VUOTO'; end if;

  select * into v_t from message_threads where id = v_e.thread_id;

  insert into thread_messages (thread_id, sender_company_id, body, via_email, sender_unverified)
  values (v_t.id, v_t.supplier_company_id, left(v_corpo, 4000), true, true)
  returning id into v_msg;

  update message_threads set last_message_at = now() where id = v_t.id;
  update emails_inbox
     set processed = true, thread_message_id = v_msg,
         match_note = 'Pubblicata a mano da un amministratore.'
   where id = p_id;

  insert into notifications (company_id, type, title, body, action_label, action_url)
  values (v_t.buyer_company_id, 'message', 'Risposta dal fornitore',
          left(v_corpo, 160), 'Apri i messaggi', '/messaggi?thread=' || v_t.id);

  return jsonb_build_object('ok', true, 'thread_id', v_t.id, 'thread_message_id', v_msg);
end;
$fn$;
revoke all on function public.admin_pubblica_mail_inbox(uuid) from public, anon;
grant execute on function public.admin_pubblica_mail_inbox(uuid) to authenticated, service_role;

-- L'estratto ora ricade su body_clean e, in mancanza, sull'HTML spogliato.
create or replace function public.admin_list_inbox(p_solo_da_rivedere boolean default false, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_admin boolean;
begin
  select coalesce(c.is_platform_admin, false) into v_admin
  from profiles p join companies c on c.id = p.company_id
  where p.id = auth.uid();
  if not coalesce(v_admin, false) then raise exception 'NOT_ADMIN'; end if;

  return coalesce((
    select jsonb_agg(x order by x->>'fetched_at' desc) from (
      select jsonb_build_object(
        'id', e.id, 'mailbox', e.mailbox, 'from_email', e.from_email, 'from_name', e.from_name,
        'subject', e.subject, 'received_at', e.received_at, 'fetched_at', e.fetched_at,
        'processed', e.processed, 'match_note', e.match_note,
        'thread_id', e.thread_id,
        'estratto', left(coalesce(
          nullif(btrim(e.body_clean), ''),
          nullif(btrim(e.body_text), ''),
          btrim(regexp_replace(regexp_replace(regexp_replace(
            coalesce(e.body_html, ''), '<style[^>]*>.*?</style>', ' ', 'gi'),
            '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g'))
        ), 400),
        -- true = c'e' una conversazione ma la mail e' stata trattenuta:
        -- l'admin puo' pubblicarla lui dopo aver controllato chi scrive.
        'pubblicabile', (e.processed = false and e.thread_id is not null),
        'controparte', (select c.legal_name from message_threads t join companies c on c.id = t.supplier_company_id where t.id = e.thread_id),
        'cliente', (select c.legal_name from message_threads t join companies c on c.id = t.buyer_company_id where t.id = e.thread_id)
      ) as x
      from emails_inbox e
      where (not p_solo_da_rivedere) or e.processed = false
      order by e.fetched_at desc
      limit greatest(1, least(coalesce(p_limit, 100), 300))
    ) s
  ), '[]'::jsonb);
end;
$function$;
revoke all on function public.admin_list_inbox(boolean, integer) from public, anon;
grant execute on function public.admin_list_inbox(boolean, integer) to authenticated, service_role;

create or replace function public.get_thread_messages(p_thread uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := auth_company_id();
  v_t message_threads%rowtype;
  v_masked boolean;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_t from message_threads where id = p_thread;
  if v_t.id is null or v_me not in (v_t.buyer_company_id, v_t.supplier_company_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  v_masked := not has_confirmed_order_between(v_t.buyer_company_id, v_t.supplier_company_id);
  return jsonb_build_object(
    'contacts_masked', v_masked,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'mine', m.sender_company_id = v_me,
        'body', case when v_masked then mask_contacts(m.body) else m.body end,
        'created_at', m.created_at,
        'read_at', m.read_at,
        -- Chi legge deve poter distinguere un messaggio scritto in piattaforma
        -- da uno arrivato via email e riportato qui in automatico.
        'via_email', coalesce(m.via_email, false),
        -- ... e sapere quando non abbiamo potuto confermare chi lo ha scritto.
        'sender_unverified', coalesce(m.sender_unverified, false)
      ) order by m.created_at)
      from thread_messages m where m.thread_id = p_thread
    ), '[]'::jsonb)
  );
end $function$;
revoke all on function public.get_thread_messages(uuid) from public, anon;
grant execute on function public.get_thread_messages(uuid) to authenticated, service_role;

-- Il cron del relay, tenuto spento finche' il LOGIN IMAP non ha funzionato
-- (ripetere login falliti e' il modo piu' rapido per farsi bloccare da Zoho).
-- Acceso il 24/08/2026, a login riuscito e test di aggancio superato.
--   select cron.schedule('ingest-inbox-imap', '*/20 * * * *', $job$
--     select net.http_post(
--       url := 'https://uufueekpxboygcotqvhu.supabase.co/functions/v1/ingest-inbox-imap',
--       headers := jsonb_build_object('Content-Type','application/json',
--         'x-cron-secret', (select value from public.app_secrets where key = 'ingest_cron_secret')),
--       body := '{}'::jsonb, timeout_milliseconds := 90000);
--   $job$);
