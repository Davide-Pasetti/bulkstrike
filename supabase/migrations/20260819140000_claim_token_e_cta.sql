-- ============================================================================
-- CTA DI RIVENDICA nell'email + token legato alla richiesta
--
-- Il token NON approva niente: dice solo QUALE azienda si sta rivendicando e SU
-- QUALE conversazione far atterrare il fornitore dopo. L'approvazione resta
-- admin_review_claim, cioè la review manuale.
--
-- request_company_claim approva DA SOLA quando il dominio dell'email di
-- registrazione coincide con quello del sito aziendale (domain_match) e il
-- dominio non è generico: chi arriva da questo link con una email @suodominio.it
-- viene collegato subito, senza review. Comportamento CONFERMATO come voluto,
-- anche per chi arriva dal token — per questo la nota sotto il bottone dice
-- "se ti registri con l'email della tua azienda, l'accesso è immediato" invece
-- di promettere una verifica manuale che in quel caso non avviene.
-- ============================================================================

create table if not exists public.supplier_claim_tokens (
  token       text primary key default encode(gen_random_bytes(24), 'hex'),
  company_id  uuid not null references public.companies(id) on delete cascade,
  thread_id   uuid references public.message_threads(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days',
  used_at     timestamptz,
  used_by     uuid references public.profiles(id)
);
comment on table public.supplier_claim_tokens is
  'Link di rivendica inviato nelle richieste ai fornitori non registrati. Scade a 30 giorni, valido una volta sola. Non concede accessi: serve solo a sapere quale azienda e quale conversazione.';
create index if not exists supplier_claim_tokens_company_idx on public.supplier_claim_tokens (company_id);

alter table public.supplier_claim_tokens enable row level security;
revoke all on table public.supplier_claim_tokens from public, anon, authenticated;

alter table public.company_claim_requests add column if not exists landing_thread_id uuid references public.message_threads(id) on delete set null;
comment on column public.company_claim_requests.landing_thread_id is
  'Conversazione da aprire al primo accesso dopo l''approvazione. Arriva dal token del link nell''email di richiesta.';

-- Un token per coppia (azienda, thread) finché è valido: se il compratore manda
-- una seconda richiesta allo stesso fornitore non si accumulano link diversi
-- che confonderebbero chi li riceve.
create or replace function public._claim_token_richiesta(p_company uuid, p_thread uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_token text;
begin
  if p_company is null then return null; end if;

  select token into v_token
  from supplier_claim_tokens
  where company_id = p_company
    and thread_id is not distinct from p_thread
    and used_at is null
    and expires_at > now()
  order by created_at desc limit 1;

  if v_token is null then
    insert into supplier_claim_tokens (company_id, thread_id)
    values (p_company, p_thread)
    returning token into v_token;
  end if;

  return v_token;
end;
$fn$;
revoke all on function public._claim_token_richiesta(uuid, uuid) from public, anon;

-- Cosa mostrare nella pagina di registrazione a chi arriva dal link. Pubblica
-- (il fornitore non ha ancora un account) ma non espone nulla di sensibile:
-- solo la ragione sociale, già visibile sul sito.
create or replace function public.claim_token_info(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  t supplier_claim_tokens%rowtype;
  v_nome text;
begin
  select * into t from supplier_claim_tokens where token = btrim(coalesce(p_token, ''));
  if t.token is null then return jsonb_build_object('ok', false, 'motivo', 'TOKEN_NON_VALIDO'); end if;
  if t.used_at is not null then return jsonb_build_object('ok', false, 'motivo', 'TOKEN_GIA_USATO'); end if;
  if t.expires_at <= now() then return jsonb_build_object('ok', false, 'motivo', 'TOKEN_SCADUTO'); end if;
  select legal_name into v_nome from companies where id = t.company_id;
  return jsonb_build_object('ok', true, 'company_id', t.company_id, 'company_name', v_nome, 'thread_id', t.thread_id);
end;
$fn$;
revoke all on function public.claim_token_info(text) from public, anon;
grant execute on function public.claim_token_info(text) to anon, authenticated;

-- Un solo giro per il frontend: valida il token, crea la richiesta di claim con
-- la logica esistente (nessuna scorciatoia) e ricorda dove atterrare dopo.
create or replace function public.claim_con_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  t supplier_claim_tokens%rowtype;
  v_res jsonb;
  v_req uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into t from supplier_claim_tokens where token = btrim(coalesce(p_token, '')) for update;
  if t.token is null then return jsonb_build_object('ok', false, 'motivo', 'TOKEN_NON_VALIDO'); end if;
  if t.used_at is not null then return jsonb_build_object('ok', false, 'motivo', 'TOKEN_GIA_USATO'); end if;
  if t.expires_at <= now() then return jsonb_build_object('ok', false, 'motivo', 'TOKEN_SCADUTO'); end if;

  -- Nessuna scorciatoia: si passa dalla stessa RPC di sempre, con i suoi
  -- controlli. Il token non approva niente, dice solo CHI e DOVE.
  v_res := public.request_company_claim(t.company_id);
  v_req := nullif(v_res->>'request_id','')::uuid;

  if v_req is not null and t.thread_id is not null then
    update company_claim_requests set landing_thread_id = t.thread_id where id = v_req;
  end if;

  update supplier_claim_tokens set used_at = now(), used_by = auth.uid() where token = t.token;

  return v_res || jsonb_build_object('ok', true, 'thread_id', t.thread_id);
end;
$fn$;
revoke all on function public.claim_con_token(text) from public, anon;
grant execute on function public.claim_con_token(text) to authenticated;

-- Al primo accesso dopo l'approvazione: quale conversazione aprire. Si consuma,
-- così l'atterraggio avviene una volta sola e i login successivi sono normali.
create or replace function public.my_claim_landing()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_thread uuid;
  v_req uuid;
begin
  if auth.uid() is null then return null; end if;
  select r.id, r.landing_thread_id into v_req, v_thread
  from company_claim_requests r
  where r.requesting_profile_id = auth.uid()
    and r.landing_thread_id is not null
    and r.decision = 'approved'
  order by r.requested_at desc limit 1;

  if v_req is null then return null; end if;
  update company_claim_requests set landing_thread_id = null where id = v_req;
  return v_thread;
end;
$fn$;
revoke all on function public.my_claim_landing() from public, anon;
grant execute on function public.my_claim_landing() to authenticated;

-- I testi della CTA vivono nel dizionario, come tutto il resto della lettera.
-- piede_iscrizione sparisce: era la vecchia riga generica "Vi invitiamo a
-- iscrivervi", superata dalla CTA vera e propria.
-- email_richiesta_render() prende p_claim_url e, solo per fornitori NON
-- registrati, stampa il bottone + la nota sulla verifica + la riga secondaria
-- sulla risposta via email. Le due funzioni complete sono state riapplicate in
-- produzione; qui restano i testi, che sono la parte che si rilegge.
create or replace function public.email_richiesta_testi(p_lingua text default 'it')
returns jsonb
language sql
immutable
as $fn$
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
      'cta_registrati',     $t$Registrati e rivendica il tuo profilo per rispondere direttamente a {cliente}$t$,
      'cta_nota',           $t$Se ti registri con l'email della tua azienda, l'accesso è immediato; altrimenti verificheremo la richiesta a mano.$t$,
      'cta_alternativa',    $t$In alternativa, puoi rispondere direttamente a questa email.$t$,
      'piede_generata',     $t$Questa email è stata generata da un agente AI del sito BulkStrike.com per conto di {cliente}.$t$,
      'piede_info',         $t$Per maggiori informazioni in merito al sito BulkStrike scrivere alla mail davide@bulkstrike.com.$t$,
      'piede_disiscrizione_html', $t$Se non si desidera più ricevere email, <a href="{url_unsub}" style="color:#64748B">cliccare qui</a>.$t$,
      'piede_disiscrizione_txt',  $t$Se non si desidera più ricevere email: {url_unsub}$t$
  );
$fn$;
revoke all on function public.email_richiesta_testi(text) from public, anon;
