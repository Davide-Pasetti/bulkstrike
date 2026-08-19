-- ============================================================================
-- MATCHING DELLE RISPOSTE — codice [RIF-XXXXXXXX] nell'oggetto
--
-- Il Message-ID custom NON funziona: SES lo sovrascrive con uno suo
-- (@eu-west-1.amazonses.com) e il nostro header sparisce. Il plus-addressing
-- non e' percorribile: Zoho non supporta gli alias con "+" in ricezione.
-- Resta il codice nell'oggetto, che sopravvive al "Re:" di qualunque client.
--
-- message_id resta in tabella per log e diagnostica, ma NON e' piu' il
-- meccanismo di matching.
--
-- Il codice e il suffisso nell'oggetto si scrivono nello STESSO trigger: se il
-- codice lo generasse un chiamante e il suffisso lo aggiungesse un altro,
-- basterebbe un chiamante distratto per avere in tabella un codice che
-- nell'oggetto non c'e', e il matching fallirebbe in silenzio per sempre.
-- ============================================================================

alter table public.emails_outbox add column if not exists thread_ref_code text;
create unique index if not exists emails_outbox_thread_ref_code_key
  on public.emails_outbox (thread_ref_code) where thread_ref_code is not null;

comment on column public.emails_outbox.thread_ref_code is
  'Codice [RIF-XXXXXXXX] nell''oggetto. E'' il meccanismo PRIMARIO per ricondurre una risposta email al thread: Resend/SES riscrive il Message-ID, quindi quello non e'' utilizzabile per il matching.';
comment on column public.emails_outbox.message_id is
  'Message-ID generato da noi. SES lo sovrascrive con uno suo, quindi NON serve al matching: resta solo per log e diagnostica.';

-- 8 caratteri A-Z0-9, come da pattern atteso dal parser delle risposte.
-- Riprova in caso di collisione invece di far fallire l'invio.
create or replace function public._nuovo_thread_ref_code()
returns text
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_code text;
  v_tentativi int := 0;
begin
  loop
    select string_agg(substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', (random() * 35)::int + 1, 1), '')
      into v_code from generate_series(1, 8);
    exit when not exists (select 1 from emails_outbox where thread_ref_code = v_code);
    v_tentativi := v_tentativi + 1;
    if v_tentativi > 5 then
      raise exception 'REF_CODE_COLLISION';
    end if;
  end loop;
  return v_code;
end;
$fn$;
revoke all on function public._nuovo_thread_ref_code() from public, anon;

-- Stessa regola causale del message_id: si aggancia solo dove c'e' un thread da
-- ritrovare, quindi le altre email restano identiche a prima.
create or replace function public._aggancio_richiesta_default()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.thread_id is not null then
    if new.message_id is null then
      new.message_id := '<' || gen_random_uuid() || '@bulkstrike.com>';
    end if;
    if new.thread_ref_code is null then
      new.thread_ref_code := public._nuovo_thread_ref_code();
    end if;
    -- Idempotente: se l'oggetto porta gia' un RIF non se ne aggiunge un secondo.
    if coalesce(new.subject, '') !~ '\[RIF-[A-Z0-9]{8}\]' then
      new.subject := coalesce(new.subject, '') || ' [RIF-' || new.thread_ref_code || ']';
    end if;
  end if;
  return new;
end;
$fn$;
revoke all on function public._aggancio_richiesta_default() from public, anon;

-- Il nome del trigger conta: i BEFORE scattano in ordine alfabetico e
-- "aggancio" viene prima di "email_test_redirect", che antepone il suo
-- "[TEST -> ...]". Cosi' il RIF resta in coda all'oggetto in entrambi i casi.
drop trigger if exists trg_message_id_default on emails_outbox;
drop function if exists public._message_id_default();
drop trigger if exists trg_aggancio_richiesta on emails_outbox;
create trigger trg_aggancio_richiesta
before insert on emails_outbox
for each row execute function public._aggancio_richiesta_default();

-- Estrae il RIF dall'oggetto di una risposta e risale al thread. La useranno la
-- cattura IMAP e il relay; e' gia' testabile senza credenziali.
-- Torna zero righe se il codice non c'e' o non corrisponde a nulla: chi chiama
-- deve loggare il caso per revisione manuale, non scartarlo in silenzio.
-- Confronto case-insensitive: il codice lo generiamo maiuscolo, ma un fornitore
-- che lo ribatte a mano puo' scriverlo minuscolo.
create or replace function public.thread_da_oggetto(p_subject text)
returns table (thread_ref_code text, thread_id uuid, outbox_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with rif as (
    select upper((regexp_match(coalesce(p_subject, ''), '\[RIF-([A-Z0-9]{8})\]', 'i'))[1]) as code
  )
  select e.thread_ref_code, e.thread_id, e.id
  from rif join emails_outbox e on e.thread_ref_code = rif.code
  where rif.code is not null
  order by e.created_at desc
  limit 1;
$fn$;
revoke all on function public.thread_da_oggetto(text) from public, anon;
