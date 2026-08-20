-- ============================================================================
-- AGENTI DI VENDITA — legame agente/fornitore/zona + provvigione indicativa
--
-- BulkStrike NON paga e non contrattualizza gli agenti: il rapporto economico
-- resta fra agente e fornitore, fuori piattaforma. Qui si modella solo il
-- legame (per instradare i contatti) e un riferimento teorico di provvigione.
--
-- ATTENZIONE ai nomi: esiste gia' commission_ledger, che riguarda le
-- commissioni sui CORRIERI. La tabella nuova e' agent_commission_ledger e non
-- ha niente a che vedere con quella.
--
-- RLS: nessuna policy di lettura pubblica. La spec chiedeva lettura pubblica
-- dei legami confermati, ma RLS filtra le RIGHE, non le colonne: una policy
-- del genere avrebbe esposto anche commission_rate_indicative, che e' un dato
-- privato fornitore-agente. Quello che il buyer puo' sapere passa dalla RPC
-- agenti_di_zona(), che restituisce nome e zona e NON il tasso.
-- ============================================================================

create table if not exists public.sales_agents (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  email        text not null unique,
  phone        text,
  auth_user_id uuid references auth.users(id) on delete set null,
  status       text not null default 'attivo' check (status in ('attivo','disabilitato')),
  created_at   timestamptz not null default now()
);
comment on table public.sales_agents is
  'Agenti di vendita del settore. BulkStrike non li paga e non li contrattualizza: il rapporto resta fra agente e fornitore.';

create table if not exists public.agent_supplier_zones (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.sales_agents(id) on delete cascade,
  supplier_company_id uuid not null references public.companies(id) on delete cascade,
  country       text,
  region        text,
  status        text not null default 'in_attesa' check (status in ('in_attesa','confermato','rifiutato','disattivato')),
  proposed_by   text not null check (proposed_by in ('agente','fornitore','admin')),
  confirmed_by_supplier_at timestamptz,
  commission_rate_indicative numeric,
  created_at    timestamptz not null default now()
);
comment on table public.agent_supplier_zones is
  'Legame agente-fornitore-zona. Diventa visibile/utilizzabile per l''instradamento SOLO con status=''confermato''. La provvigione indicativa qui salvata non genera mai un pagamento: serve solo come riferimento teorico per il fornitore.';
comment on column public.agent_supplier_zones.commission_rate_indicative is
  'Percentuale concordata FUORI piattaforma (3.5 = 3,5%). Dato privato fornitore-agente: non esce mai verso il buyer.';
-- Indice su espressione e non vincolo unique: country/region possono essere
-- null (legame generico su tutto il paese) e in SQL null <> null, quindi un
-- unique normale lascerebbe passare duplicati.
create unique index if not exists agent_supplier_zones_unico
  on public.agent_supplier_zones (agent_id, supplier_company_id, coalesce(country,''), coalesce(region,''));
create index if not exists agent_supplier_zones_fornitore_idx on public.agent_supplier_zones (supplier_company_id, status);
create index if not exists agent_supplier_zones_agente_idx on public.agent_supplier_zones (agent_id, status);

create table if not exists public.agent_commission_ledger (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  agent_id      uuid references public.sales_agents(id) on delete set null,
  supplier_company_id uuid not null references public.companies(id) on delete cascade,
  commission_rate_applied numeric,
  commission_amount_indicative numeric,
  assignment_status text not null default 'auto' check (assignment_status in ('auto','assegnato_da_admin','non_assegnabile')),
  accrued_at    timestamptz not null default now(),
  unique (order_id)
);
comment on table public.agent_commission_ledger is
  'Valore puramente indicativo/teorico. BulkStrike non gestisce ne'' traccia alcun pagamento reale di provvigione: il regolamento resta interamente tra fornitore e agente, fuori piattaforma. Serve solo come riferimento/reportistica. DA NON CONFONDERE con commission_ledger, che riguarda le commissioni sui corrieri.';
create index if not exists agent_commission_ledger_agente_idx on public.agent_commission_ledger (agent_id);

alter table public.sales_agents            enable row level security;
alter table public.agent_supplier_zones    enable row level security;
alter table public.agent_commission_ledger enable row level security;
revoke all on table public.sales_agents from public, anon, authenticated;
revoke all on table public.agent_supplier_zones from public, anon, authenticated;
revoke all on table public.agent_commission_ledger from public, anon, authenticated;

-- ── Anagrafica agente ───────────────────────────────────────────────────────
-- Match su email: due fornitori che dichiarano lo stesso agente devono puntare
-- alla stessa riga, non crearne due.
create or replace function public._agente_upsert(p_nome text, p_email text, p_phone text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  if v_email = '' or position('@' in v_email) = 0 then raise exception 'EMAIL_NON_VALIDA'; end if;
  if coalesce(btrim(p_nome), '') = '' then raise exception 'NOME_MANCANTE'; end if;

  select id into v_id from sales_agents where email = v_email;
  if v_id is null then
    insert into sales_agents (full_name, email, phone)
    values (btrim(p_nome), v_email, nullif(btrim(coalesce(p_phone,'')),''))
    returning id into v_id;
  else
    -- Non si sovrascrive il nome gia' noto con quello scritto da un altro
    -- fornitore: si completa solo cio' che manca.
    update sales_agents set phone = coalesce(phone, nullif(btrim(coalesce(p_phone,'')),'')) where id = v_id;
  end if;
  return v_id;
end;
$fn$;
revoke all on function public._agente_upsert(text,text,text) from public, anon;

-- ── FLUSSO A: il fornitore dichiara un proprio agente ───────────────────────
-- E' il fornitore stesso a dirlo, quindi il legame nasce gia' confermato.
create or replace function public.supplier_add_agent(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_me uuid := auth_company_id();
  v_agente uuid;
  v_id uuid;
  v_rate numeric := nullif(payload->>'commission_rate_indicative','')::numeric;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from companies where id = v_me and is_supplier) then raise exception 'SOLO_FORNITORI'; end if;
  if v_rate is not null and (v_rate < 0 or v_rate > 100) then raise exception 'PROVVIGIONE_NON_VALIDA'; end if;

  v_agente := public._agente_upsert(payload->>'full_name', payload->>'email', payload->>'phone');

  insert into agent_supplier_zones (agent_id, supplier_company_id, country, region, status,
                                    proposed_by, confirmed_by_supplier_at, commission_rate_indicative)
  values (v_agente, v_me, nullif(btrim(coalesce(payload->>'country','')),''),
          nullif(btrim(coalesce(payload->>'region','')),''), 'confermato', 'fornitore', now(), v_rate)
  on conflict (agent_id, supplier_company_id, coalesce(country,''), coalesce(region,''))
  do update set status = 'confermato', confirmed_by_supplier_at = now(),
                commission_rate_indicative = coalesce(excluded.commission_rate_indicative, agent_supplier_zones.commission_rate_indicative)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'agent_id', v_agente, 'zone_id', v_id, 'status', 'confermato');
end;
$fn$;
revoke all on function public.supplier_add_agent(jsonb) from public, anon;
grant execute on function public.supplier_add_agent(jsonb) to authenticated;

-- ── FLUSSO B: l'agente si autocandida ───────────────────────────────────────
-- Pagina pubblica, quindi eseguibile da anon: il legame nasce 'in_attesa' e NON
-- e' visibile ne' usato per instradare finche' il fornitore non conferma.
create or replace function public.agent_self_register(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_agente uuid;
  v_target uuid;
  v_zone uuid;
  v_nome_agente text := btrim(coalesce(payload->>'full_name',''));
  v_forn companies%rowtype;
  v_zona text;
  v_creati int := 0;
  v_recenti int;
begin
  if payload->'suppliers' is null or jsonb_typeof(payload->'suppliers') <> 'array'
     or jsonb_array_length(payload->'suppliers') = 0 then
    raise exception 'NESSUN_FORNITORE_INDICATO';
  end if;
  if jsonb_array_length(payload->'suppliers') > 20 then raise exception 'TROPPI_FORNITORI'; end if;

  v_agente := public._agente_upsert(v_nome_agente, payload->>'email', payload->>'phone');

  -- Freno all'abuso: la pagina e' pubblica, senza un limite chiunque potrebbe
  -- riempire la coda di conferme dei fornitori.
  select count(*) into v_recenti from agent_supplier_zones
   where agent_id = v_agente and created_at > now() - interval '24 hours';
  if v_recenti >= 30 then raise exception 'LIMITE_24H_RAGGIUNTO'; end if;

  for v_target, v_zona in
    select nullif(x->>'supplier_company_id','')::uuid, x->>'region'
    from jsonb_array_elements(payload->'suppliers') x
  loop
    select * into v_forn from companies where id = v_target and deleted_at is null and is_supplier;
    continue when v_forn.id is null;

    insert into agent_supplier_zones (agent_id, supplier_company_id, country, region, status, proposed_by)
    values (v_agente, v_target,
            nullif(btrim(coalesce(v_forn.country,'')),''), nullif(btrim(coalesce(v_zona,'')),''),
            'in_attesa', 'agente')
    on conflict (agent_id, supplier_company_id, coalesce(country,''), coalesce(region,'')) do nothing
    returning id into v_zone;

    if v_zone is not null then
      v_creati := v_creati + 1;
      perform public._queue_plain_email(
        'agent_zone_richiesta', v_target, 'acquisti',
        'Un agente dichiara di rappresentarvi su BulkStrike',
        '<p><b>' || coalesce(v_nome_agente,'Un agente') || '</b> dichiara di rappresentare la vostra azienda' ||
          case when v_zona is null then '' else ' per la zona <b>' || v_zona || '</b>' end || '.</p>' ||
          '<p>Il collegamento resta <b>sospeso</b> finche'' non lo confermate voi: fino ad allora non e'' visibile a nessuno e nessun contatto viene instradato all''agente.</p>' ||
          '<p><a href="https://www.bulkstrike.com/fornitore/agenti">Conferma o rifiuta dal tuo pannello</a></p>',
        coalesce(v_nome_agente,'Un agente') || ' dichiara di rappresentare la vostra azienda' ||
          case when v_zona is null then '' else ' per la zona ' || v_zona end ||
          '. Il collegamento resta sospeso finche'' non lo confermate: https://www.bulkstrike.com/fornitore/agenti');
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'agent_id', v_agente, 'legami_creati', v_creati);
end;
$fn$;
revoke all on function public.agent_self_register(jsonb) from public, anon;
grant execute on function public.agent_self_register(jsonb) to anon, authenticated;

-- ── Pannello fornitore ──────────────────────────────────────────────────────
create or replace function public.my_agent_zones()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare v_me uuid := auth_company_id();
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', z.id, 'agent_id', a.id, 'full_name', a.full_name, 'email', a.email, 'phone', a.phone,
      'country', z.country, 'region', z.region, 'status', z.status, 'proposed_by', z.proposed_by,
      'commission_rate_indicative', z.commission_rate_indicative,
      'confirmed_at', z.confirmed_by_supplier_at, 'created_at', z.created_at)
      order by (z.status = 'in_attesa') desc, z.created_at desc)
    from agent_supplier_zones z join sales_agents a on a.id = z.agent_id
    where z.supplier_company_id = v_me
  ), '[]'::jsonb);
end;
$fn$;
revoke all on function public.my_agent_zones() from public, anon;
grant execute on function public.my_agent_zones() to authenticated;

create or replace function public.supplier_set_agent_zone(p_zone uuid, p_azione text, p_rate numeric default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_me uuid := auth_company_id();
  v_z agent_supplier_zones%rowtype;
  v_nuovo text;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_z from agent_supplier_zones where id = p_zone;
  if v_z.id is null or v_z.supplier_company_id <> v_me then raise exception 'NOT_ALLOWED'; end if;
  if p_rate is not null and (p_rate < 0 or p_rate > 100) then raise exception 'PROVVIGIONE_NON_VALIDA'; end if;

  v_nuovo := case p_azione
    when 'conferma'  then 'confermato'
    when 'rifiuta'   then 'rifiutato'
    when 'disattiva' then 'disattivato'
    else null end;
  if v_nuovo is null then raise exception 'AZIONE_NON_VALIDA'; end if;

  update agent_supplier_zones
     set status = v_nuovo,
         confirmed_by_supplier_at = case when v_nuovo = 'confermato' then now() else confirmed_by_supplier_at end,
         commission_rate_indicative = coalesce(p_rate, commission_rate_indicative)
   where id = p_zone;

  return jsonb_build_object('ok', true, 'status', v_nuovo);
end;
$fn$;
revoke all on function public.supplier_set_agent_zone(uuid, text, numeric) from public, anon;
grant execute on function public.supplier_set_agent_zone(uuid, text, numeric) to authenticated;

-- ── Cosa puo' sapere il BUYER ───────────────────────────────────────────────
-- Solo legami confermati, solo nome e zona: mai la provvigione.
create or replace function public.agenti_di_zona(p_supplier uuid, p_region text default null, p_country text default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'zone_id', z.id, 'agent_id', a.id, 'full_name', a.full_name,
      'country', z.country, 'region', z.region,
      -- true = copre proprio la zona chiesta; false = agente del fornitore ma
      -- per un'altra zona (si propone comunque, in modo generico).
      'zona_esatta', (p_region is not null and z.region is not distinct from p_region))
      order by (p_region is not null and z.region is not distinct from p_region) desc, a.full_name)
    from agent_supplier_zones z join sales_agents a on a.id = z.agent_id
    where z.supplier_company_id = p_supplier
      and z.status = 'confermato'
      and a.status = 'attivo'
      and (p_country is null or z.country is null or z.country = p_country)
  ), '[]'::jsonb);
$fn$;
revoke all on function public.agenti_di_zona(uuid, text, text) from public;
grant execute on function public.agenti_di_zona(uuid, text, text) to anon, authenticated, service_role;

-- ── Provvigione indicativa sugli ordini reali ───────────────────────────────
-- Solo qui, mai sui lead. Un fornitore senza agenti confermati non produce
-- alcuna riga: per lui non cambia niente.
create or replace function public.trg_agent_commission_on_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_n int;
  v_agente uuid;
  v_rate numeric;
  v_base numeric := coalesce(new.goods_subtotal, 0);
begin
  select count(*) into v_n
  from agent_supplier_zones z join sales_agents a on a.id = z.agent_id
  where z.supplier_company_id = new.supplier_company_id and z.status = 'confermato' and a.status = 'attivo';

  if v_n = 0 then return new; end if;

  if v_n = 1 then
    select z.agent_id, z.commission_rate_indicative into v_agente, v_rate
    from agent_supplier_zones z join sales_agents a on a.id = z.agent_id
    where z.supplier_company_id = new.supplier_company_id and z.status = 'confermato' and a.status = 'attivo'
    limit 1;

    insert into agent_commission_ledger (order_id, agent_id, supplier_company_id,
      commission_rate_applied, commission_amount_indicative, assignment_status)
    values (new.id, v_agente, new.supplier_company_id, v_rate,
            case when v_rate is null then null else round(v_base * v_rate / 100.0, 2) end, 'auto')
    on conflict (order_id) do nothing;
  else
    -- Piu' agenti confermati e nessun campo zona strutturato sull'ordine: la
    -- riga si crea comunque, ma spetta a un admin dire di chi e'. Meglio una
    -- riga da assegnare che una provvigione attribuita a caso.
    insert into agent_commission_ledger (order_id, agent_id, supplier_company_id, assignment_status)
    values (new.id, null, new.supplier_company_id, 'non_assegnabile')
    on conflict (order_id) do nothing;
  end if;

  return new;
end;
$fn$;
revoke all on function public.trg_agent_commission_on_order() from public, anon;

drop trigger if exists trg_agent_commission_on_order on public.orders;
create trigger trg_agent_commission_on_order
after insert on public.orders
for each row execute function public.trg_agent_commission_on_order();

-- ── Pannello admin ──────────────────────────────────────────────────────────
create or replace function public._is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select coalesce((select c.is_platform_admin from profiles p join companies c on c.id = p.company_id
                   where p.id = auth.uid()), false);
$fn$;
revoke all on function public._is_platform_admin() from public, anon;

create or replace function public.admin_list_agents()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if not public._is_platform_admin() then raise exception 'NOT_ADMIN'; end if;
  return jsonb_build_object(
    'agenti', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'full_name', a.full_name, 'email', a.email, 'phone', a.phone, 'status', a.status,
        'legami', coalesce((select jsonb_agg(jsonb_build_object(
            'id', z.id, 'fornitore', c.legal_name, 'supplier_company_id', z.supplier_company_id,
            'country', z.country, 'region', z.region, 'status', z.status,
            'proposed_by', z.proposed_by, 'commission_rate_indicative', z.commission_rate_indicative)
            order by z.created_at desc)
          from agent_supplier_zones z join companies c on c.id = z.supplier_company_id
          where z.agent_id = a.id), '[]'::jsonb))
      order by a.full_name) from sales_agents a), '[]'::jsonb),
    'provvigioni', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'order_id', l.order_id, 'agent_id', l.agent_id,
        'agente', (select full_name from sales_agents s where s.id = l.agent_id),
        'fornitore', (select legal_name from companies c where c.id = l.supplier_company_id),
        'rate', l.commission_rate_applied, 'importo', l.commission_amount_indicative,
        'assignment_status', l.assignment_status, 'accrued_at', l.accrued_at)
      order by l.accrued_at desc) from agent_commission_ledger l), '[]'::jsonb));
end;
$fn$;
revoke all on function public.admin_list_agents() from public, anon;
grant execute on function public.admin_list_agents() to authenticated;

create or replace function public.admin_set_agent_zone(p_zone uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not public._is_platform_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_status not in ('in_attesa','confermato','rifiutato','disattivato') then raise exception 'STATO_NON_VALIDO'; end if;
  update agent_supplier_zones
     set status = p_status,
         confirmed_by_supplier_at = case when p_status = 'confermato' then coalesce(confirmed_by_supplier_at, now()) else confirmed_by_supplier_at end
   where id = p_zone;
  return jsonb_build_object('ok', true, 'status', p_status);
end;
$fn$;
revoke all on function public.admin_set_agent_zone(uuid, text) from public, anon;
grant execute on function public.admin_set_agent_zone(uuid, text) to authenticated;

create or replace function public.admin_assign_commission(p_ledger uuid, p_agent uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_l agent_commission_ledger%rowtype;
  v_rate numeric;
  v_base numeric;
begin
  if not public._is_platform_admin() then raise exception 'NOT_ADMIN'; end if;
  select * into v_l from agent_commission_ledger where id = p_ledger;
  if v_l.id is null then raise exception 'RIGA_INESISTENTE'; end if;
  -- Solo fra gli agenti confermati di QUEL fornitore: assegnare a un agente
  -- estraneo produrrebbe un dato inventato.
  if not exists (select 1 from agent_supplier_zones z
                 where z.agent_id = p_agent and z.supplier_company_id = v_l.supplier_company_id
                   and z.status = 'confermato') then
    raise exception 'AGENTE_NON_COLLEGATO_AL_FORNITORE';
  end if;

  select max(z.commission_rate_indicative) into v_rate from agent_supplier_zones z
   where z.agent_id = p_agent and z.supplier_company_id = v_l.supplier_company_id and z.status = 'confermato';
  select coalesce(goods_subtotal, 0) into v_base from orders where id = v_l.order_id;

  update agent_commission_ledger
     set agent_id = p_agent, commission_rate_applied = v_rate,
         commission_amount_indicative = case when v_rate is null then null else round(v_base * v_rate / 100.0, 2) end,
         assignment_status = 'assegnato_da_admin'
   where id = p_ledger;
  return jsonb_build_object('ok', true);
end;
$fn$;
revoke all on function public.admin_assign_commission(uuid, uuid) from public, anon;
grant execute on function public.admin_assign_commission(uuid, uuid) to authenticated;
