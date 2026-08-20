-- ============================================================================
-- POSTA IN ARRIVO di commercial@bulkstrike.com + relay nelle conversazioni
--
-- Il job (edge function ingest-inbox-imap) legge la INBOX in SOLA LETTURA:
-- EXAMINE apre la cartella read-only e BODY.PEEK[] scarica il corpo SENZA
-- mettere il flag \Seen. Una FETCH normale cambierebbe lo stato letto/non letto
-- delle mail sul server: da sola violerebbe il vincolo.
--
-- Qui finisce TUTTA la posta della casella, non solo le risposte agganciate:
-- e' una casella aziendale con dentro anche corrispondenza di terzi, quindi la
-- tabella e' chiusa (RLS senza policy) e si legge solo dalla pagina admin.
-- ============================================================================

create table if not exists public.emails_inbox (
  id            uuid primary key default gen_random_uuid(),
  mailbox       text not null,
  imap_uid      bigint not null,
  uidvalidity   bigint not null,
  message_id    text,
  in_reply_to   text,
  refs          text,
  from_email    text,
  from_name     text,
  to_email      text,
  subject       text,
  body_text     text,
  body_html     text,
  received_at   timestamptz,
  fetched_at    timestamptz not null default now(),
  processed     boolean not null default false,
  thread_id     uuid references public.message_threads(id) on delete set null,
  thread_message_id uuid references public.thread_messages(id) on delete set null,
  match_note    text,
  -- Chiave naturale del messaggio sul server: rileggere lo stesso UID non
  -- duplica niente (il job e' quindi ripetibile senza danni).
  unique (mailbox, uidvalidity, imap_uid)
);
comment on table public.emails_inbox is
  'Specchio della posta in arrivo delle caselle monitorate. Sola lettura lato IMAP. processed=false + match_note = da rivedere a mano.';
create index if not exists emails_inbox_da_rivedere_idx on public.emails_inbox (fetched_at desc) where processed = false;
alter table public.emails_inbox enable row level security;
revoke all on table public.emails_inbox from public, anon, authenticated;

-- Da dove riprendere. UIDVALIDITY va tenuto INSIEME all'UID: gli UID sono unici
-- solo finche' quel valore non cambia; se Zoho ricostruisce la cartella
-- ripartono da capo e, guardando solo l'ultimo UID, si salterebbe tutta la
-- posta nuova.
create table if not exists public.imap_state (
  mailbox      text primary key,
  uidvalidity  bigint,
  last_uid     bigint not null default 0,
  last_run_at  timestamptz,
  last_error   text
);
alter table public.imap_state enable row level security;
revoke all on table public.imap_state from public, anon, authenticated;
insert into public.imap_state (mailbox) values ('commercial@bulkstrike.com') on conflict (mailbox) do nothing;

-- Un solo giro per email: la salva, prova l'aggancio col codice [RIF-…] e, se
-- lo trova, riporta la risposta nella conversazione marcandola via_email.
-- Chi non aggancia resta con processed=false e il motivo scritto: mai scartato
-- in silenzio, e' il materiale della pagina admin "Mail ricevute".
create or replace function public.ingest_inbox_email(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_mailbox text := payload->>'mailbox';
  v_uid     bigint := (payload->>'imap_uid')::bigint;
  v_uidval  bigint := (payload->>'uidvalidity')::bigint;
  v_subject text := payload->>'subject';
  v_corpo   text := nullif(btrim(coalesce(payload->>'body_clean', payload->>'body_text', '')), '');
  v_id      uuid;
  v_match   record;
  v_t       message_threads%rowtype;
  v_msg     uuid;
  v_nota    text;
begin
  if v_mailbox is null or v_uid is null or v_uidval is null then
    raise exception 'PAYLOAD_INCOMPLETO';
  end if;

  insert into emails_inbox (
    mailbox, imap_uid, uidvalidity, message_id, in_reply_to, refs,
    from_email, from_name, to_email, subject, body_text, body_html, received_at)
  values (
    v_mailbox, v_uid, v_uidval, payload->>'message_id', payload->>'in_reply_to', payload->>'refs',
    lower(nullif(payload->>'from_email','')), payload->>'from_name', lower(nullif(payload->>'to_email','')),
    v_subject, payload->>'body_text', payload->>'body_html',
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

  -- Il mittente e' il FORNITORE della conversazione: la risposta arriva da lui,
  -- anche se materialmente l'abbiamo letta dalla nostra casella.
  insert into thread_messages (thread_id, sender_company_id, body, via_email)
  values (v_t.id, v_t.supplier_company_id, left(v_corpo, 4000), true)
  returning id into v_msg;

  update message_threads set last_message_at = now() where id = v_t.id;

  update emails_inbox
     set processed = true, thread_id = v_t.id, thread_message_id = v_msg, match_note = null
   where id = v_id;

  insert into notifications (company_id, type, title, body, action_label, action_url)
  values (v_t.buyer_company_id, 'message', 'Risposta dal fornitore',
          left(v_corpo, 160), 'Apri i messaggi', '/messaggi?thread=' || v_t.id);

  return jsonb_build_object('stato', 'agganciata', 'id', v_id, 'thread_id', v_t.id, 'thread_message_id', v_msg);
end;
$fn$;
revoke all on function public.ingest_inbox_email(jsonb) from public, anon, authenticated;

create or replace function public.imap_state_get(p_mailbox text)
returns jsonb
language sql
security definer
set search_path to 'public'
as $fn$
  select jsonb_build_object('uidvalidity', uidvalidity, 'last_uid', last_uid)
  from imap_state where mailbox = p_mailbox;
$fn$;
revoke all on function public.imap_state_get(text) from public, anon, authenticated;

create or replace function public.imap_state_set(p_mailbox text, p_uidvalidity bigint, p_last_uid bigint, p_error text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  -- Giro fallito (uidvalidity sconosciuto): si registra SOLO l'errore. Toccare
  -- last_uid qui lo azzererebbe e al giro dopo si rileggerebbe tutta la casella
  -- da capo, ricreando messaggi e notifiche gia' inseriti.
  if p_uidvalidity is null then
    update imap_state set last_run_at = now(), last_error = p_error where mailbox = p_mailbox;
    return;
  end if;

  insert into imap_state (mailbox, uidvalidity, last_uid, last_run_at, last_error)
  values (p_mailbox, p_uidvalidity, p_last_uid, now(), p_error)
  on conflict (mailbox) do update
    set uidvalidity = excluded.uidvalidity,
        last_uid    = case when imap_state.uidvalidity is distinct from excluded.uidvalidity
                           then excluded.last_uid
                           else greatest(imap_state.last_uid, excluded.last_uid) end,
        last_run_at = now(),
        last_error  = excluded.last_error;
end;
$fn$;
revoke all on function public.imap_state_set(text, bigint, bigint, text) from public, anon, authenticated;

-- Pagina admin "Mail ricevute". Il gate e' qui dentro, non nella UI.
create or replace function public.admin_list_inbox(p_solo_da_rivedere boolean default false, p_limit int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
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
        'estratto', left(coalesce(e.body_text, ''), 400),
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
$fn$;
revoke all on function public.admin_list_inbox(boolean, int) from public, anon;
grant execute on function public.admin_list_inbox(boolean, int) to authenticated;

-- Il cron NON viene creato qui: va acceso solo quando il LOGIN IMAP passa.
-- Ripetere login falliti ogni 20 minuti e' il modo piu' rapido per farsi
-- bloccare l'account da Zoho. Comando da lanciare a credenziali funzionanti:
--
--   select cron.schedule('ingest-inbox-imap', '*/20 * * * *', $job$
--     select net.http_post(
--       url := 'https://uufueekpxboygcotqvhu.supabase.co/functions/v1/ingest-inbox-imap',
--       headers := jsonb_build_object('Content-Type','application/json',
--         'x-cron-secret', (select value from public.app_secrets where key = 'ingest_cron_secret')),
--       body := '{}'::jsonb, timeout_milliseconds := 90000);
--   $job$);
