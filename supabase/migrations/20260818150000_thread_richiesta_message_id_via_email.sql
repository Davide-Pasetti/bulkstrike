-- ============================================================================
-- FONDAMENTA per il relay delle risposte email nel thread
--
-- Tre pezzi, tutti indipendenti dalla parte IMAP (che resta bloccata):
--   1. la richiesta apre una conversazione compratore-fornitore e ci semina
--      dentro il testo di cosa e' stato chiesto;
--   2. l'email di richiesta porta un Message-ID nostro, che sara' la chiave per
--      ritrovare quella conversazione quando arrivera' una risposta;
--   3. thread_messages.via_email distingue i messaggi riportati da email da
--      quelli scritti in piattaforma.
--
-- SCOPE: solo per fornitori NON rivendicati. Chi ha un profilo usa gia' la
-- messaggistica e il suo flusso non viene toccato (verificato: con fornitore
-- registrato non nasce nessun thread e l'email non prende message_id).
--
-- NOTA su message_threads: e' unico per coppia (buyer, supplier). Due richieste
-- allo stesso fornitore su prodotti diversi finiscono percio' nella stessa
-- conversazione: e' un limite della tabella, non una scelta di questa migration.
-- ============================================================================

alter table public.emails_outbox   add column if not exists message_id text;
alter table public.emails_outbox   add column if not exists thread_id  uuid references public.message_threads(id) on delete set null;
alter table public.thread_messages add column if not exists via_email  boolean not null default false;

comment on column public.emails_outbox.message_id is
  'Header Message-ID dell''email inviata. Serve a ritrovare il thread quando arriva una risposta (In-Reply-To/References).';
comment on column public.emails_outbox.thread_id is
  'Conversazione di destinazione delle risposte. Valorizzato solo per le richieste al fornitore.';
comment on column public.thread_messages.via_email is
  'true = messaggio arrivato via email e riportato qui in automatico, non scritto in piattaforma.';

create index if not exists emails_outbox_message_id_idx on public.emails_outbox (message_id) where message_id is not null;

-- Il Message-ID si genera quando c'e' un thread a cui agganciare le risposte:
-- senza thread non ci sarebbe niente da ritrovare, quindi niente header custom
-- e le altre email restano identiche a prima. La regola e' causale, non una
-- lista di kind da tenere allineata a mano.
create or replace function public._message_id_default()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.thread_id is not null and new.message_id is null then
    new.message_id := '<' || gen_random_uuid() || '@bulkstrike.com>';
  end if;
  return new;
end;
$fn$;
revoke all on function public._message_id_default() from public, anon;

drop trigger if exists trg_message_id_default on emails_outbox;
create trigger trg_message_id_default
before insert on emails_outbox
for each row execute function public._message_id_default();

-- Apre (o recupera) la conversazione e ci semina il testo della richiesta come
-- primo messaggio del compratore. Niente notifica in-app: si usa solo per
-- fornitori non rivendicati, che un profilo non ce l'hanno e non la vedrebbero.
-- Per loro la notifica e' l'email stessa.
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
  end if;

  return v_thread;
end;
$fn$;
revoke all on function public._apri_thread_richiesta(uuid, uuid, text) from public, anon;

-- Il primo messaggio del thread: cosa e' stato chiesto, in forma breve. Non e'
-- la lettera inviata al fornitore, e' il promemoria che il compratore rivede.
create or replace function public._testo_thread_richiesta(
  p_tipo text, p_prodotto text, p_quantita text, p_messaggio text, p_specifiche text
) returns text
language sql
immutable
as $fn$
  select concat_ws(chr(10),
    case p_tipo
      when 'campione'   then 'Richiesta di campionatura'
      when 'preventivo' then 'Richiesta di preventivo'
      else                   'Richiesta di contatto'
    end || coalesce(' — ' || nullif(btrim(coalesce(p_prodotto,'')), ''), ''),
    nullif('Quantità stimata necessaria: ' || nullif(btrim(coalesce(p_quantita,'')), ''), 'Quantità stimata necessaria: '),
    nullif(btrim(coalesce(p_specifiche,'')), ''),
    nullif('Note: ' || nullif(btrim(coalesce(p_messaggio,'')), ''), 'Note: ')
  );
$fn$;
revoke all on function public._testo_thread_richiesta(text,text,text,text,text) from public, anon;

-- _queue_plain_email prende il thread di riferimento. Il DROP serve perche' un
-- parametro in piu' con default creerebbe un overload ambiguo per le chiamate
-- a 6 argomenti gia' presenti ovunque.
drop function if exists public._queue_plain_email(text, uuid, text, text, text, text);
create or replace function public._queue_plain_email(
  p_kind text, p_company uuid, p_role text, p_subject text, p_html text, p_text text,
  p_thread_id uuid default null
) returns void
language sql
security definer
set search_path to 'public'
as $fn$
  insert into emails_outbox (kind, to_company_id, recipient_role, subject, body_html, body_text, status, thread_id)
  values (p_kind, p_company, coalesce(p_role, 'acquisti'), p_subject, p_html, p_text, 'queued', p_thread_id);
$fn$;
revoke all on function public._queue_plain_email(text, uuid, text, text, text, text, uuid) from public, anon;

-- get_thread_messages espone via_email, altrimenti la UI non potrebbe
-- distinguere il relay da un messaggio scritto dal fornitore.
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
        'via_email', coalesce(m.via_email, false)
      ) order by m.created_at)
      from thread_messages m where m.thread_id = p_thread
    ), '[]'::jsonb)
  );
end $function$;
revoke all on function public.get_thread_messages(uuid) from public, anon;
grant execute on function public.get_thread_messages(uuid) to authenticated, service_role;

-- I due chiamanti (trg_sample_request_emails e request_supplier_contact_bulk)
-- sono stati riapplicati in produzione con la sola aggiunta di:
--   v_reg := _company_registrata(fornitore);
--   if not v_reg then v_thread := _apri_thread_richiesta(...); end if;
-- e il thread passato come 7° argomento di _queue_plain_email per l'email al
-- fornitore. Il resto delle due funzioni e' invariato rispetto a
-- 20260818110000_email_firma_dati_cliente.sql.
