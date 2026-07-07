-- ============================================================
-- BulkStrike — Messaggistica diretta buyer↔fornitore + fornitori preferiti
-- Un thread continuativo per coppia di aziende (unique buyer+supplier);
-- scritture SOLO via RPC SECURITY DEFINER con guardie auth_company_id(),
-- lettura via RLS ristretta alle due parti. Notifica in campanella alla
-- controparte al primo messaggio non letto.
-- (applicata il 07/07/2026 e registrata come 20260707195645; verificata
-- in produzione con transazione di test in rollback: 11/11 check ok)
-- ============================================================

-- ── Tabelle ──────────────────────────────────────────────────
create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  buyer_company_id uuid not null references public.companies(id),
  supplier_company_id uuid not null references public.companies(id),
  order_id uuid references public.orders(id),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (buyer_company_id, supplier_company_id),
  check (buyer_company_id <> supplier_company_id)
);
create index idx_message_threads_buyer on public.message_threads(buyer_company_id, last_message_at desc);
create index idx_message_threads_supplier on public.message_threads(supplier_company_id, last_message_at desc);

create table public.thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_company_id uuid not null references public.companies(id),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index idx_thread_messages_thread on public.thread_messages(thread_id, created_at);
create index idx_thread_messages_unread on public.thread_messages(thread_id, sender_company_id) where read_at is null;

create table public.supplier_follows (
  buyer_company_id uuid not null references public.companies(id),
  supplier_company_id uuid not null references public.companies(id),
  created_at timestamptz not null default now(),
  primary key (buyer_company_id, supplier_company_id)
);

-- ── RLS: lettura alle sole parti; nessuna policy di scrittura (si passa dalle RPC) ──
alter table public.message_threads enable row level security;
alter table public.thread_messages enable row level security;
alter table public.supplier_follows enable row level security;

create policy thread_parties_select on public.message_threads for select
  using (buyer_company_id = auth_company_id() or supplier_company_id = auth_company_id());

create policy thread_messages_parties_select on public.thread_messages for select
  using (exists (
    select 1 from public.message_threads t
    where t.id = thread_id
      and (t.buyer_company_id = auth_company_id() or t.supplier_company_id = auth_company_id())
  ));

create policy follows_own_select on public.supplier_follows for select
  using (buyer_company_id = auth_company_id());

-- ── RPC messaggistica ─────────────────────────────────────────
-- Crea o recupera il thread. Con p_order: le parti derivano dall'ordine (il
-- chiamante deve esserne una). Senza ordine: p_other_company deve essere un
-- fornitore verificato (chiamante = buyer); un fornitore può ricontattare un
-- cliente SOLO se esiste già un ordine tra le due aziende.
create or replace function public.start_or_get_thread(p_other_company uuid default null, p_order uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth_company_id();
  v_buyer uuid; v_supplier uuid; v_thread uuid;
  v_ord orders%rowtype;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;

  if p_order is not null then
    select * into v_ord from orders where id = p_order;
    if v_ord.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
    if v_me not in (v_ord.buyer_company_id, v_ord.supplier_company_id) then
      raise exception 'NOT_ALLOWED';
    end if;
    if p_other_company is not null
       and p_other_company not in (v_ord.buyer_company_id, v_ord.supplier_company_id) then
      raise exception 'NOT_ALLOWED';
    end if;
    v_buyer := v_ord.buyer_company_id;
    v_supplier := v_ord.supplier_company_id;
  else
    if p_other_company is null or p_other_company = v_me then
      raise exception 'INVALID_COMPANY';
    end if;
    if exists (select 1 from companies c where c.id = p_other_company and c.is_supplier and c.status = 'verified') then
      v_buyer := v_me;
      v_supplier := p_other_company;
    else
      select o.buyer_company_id, o.supplier_company_id into v_buyer, v_supplier
      from orders o
      where (o.buyer_company_id = v_me and o.supplier_company_id = p_other_company)
         or (o.buyer_company_id = p_other_company and o.supplier_company_id = v_me)
      order by o.created_at desc limit 1;
      if v_buyer is null then raise exception 'SUPPLIER_NOT_AVAILABLE'; end if;
    end if;
  end if;

  insert into message_threads (buyer_company_id, supplier_company_id, order_id)
  values (v_buyer, v_supplier, p_order)
  on conflict (buyer_company_id, supplier_company_id)
  do update set order_id = coalesce(message_threads.order_id, excluded.order_id)
  returning id into v_thread;

  return v_thread;
end $$;

create or replace function public.get_my_message_threads()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth_company_id();
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'other_company_id', case when t.buyer_company_id = v_me then t.supplier_company_id else t.buyer_company_id end,
      'other_name', c.legal_name,
      'other_logo', c.logo_url,
      'my_role', case when t.buyer_company_id = v_me then 'buyer' else 'supplier' end,
      'order_id', t.order_id,
      'last_message_at', t.last_message_at,
      'last_message', (select left(m.body, 140) from thread_messages m where m.thread_id = t.id order by m.created_at desc limit 1),
      'last_message_mine', (select m.sender_company_id = v_me from thread_messages m where m.thread_id = t.id order by m.created_at desc limit 1),
      'unread', (select count(*) from thread_messages m where m.thread_id = t.id and m.sender_company_id <> v_me and m.read_at is null)
    ) order by t.last_message_at desc)
    from message_threads t
    join companies c on c.id = case when t.buyer_company_id = v_me then t.supplier_company_id else t.buyer_company_id end
    where t.buyer_company_id = v_me or t.supplier_company_id = v_me
  ), '[]'::jsonb);
end $$;

create or replace function public.get_thread_messages(p_thread uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth_company_id();
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (
    select 1 from message_threads t where t.id = p_thread
      and (t.buyer_company_id = v_me or t.supplier_company_id = v_me)
  ) then raise exception 'NOT_ALLOWED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id,
      'mine', m.sender_company_id = v_me,
      'body', m.body,
      'created_at', m.created_at,
      'read_at', m.read_at
    ) order by m.created_at)
    from thread_messages m where m.thread_id = p_thread
  ), '[]'::jsonb);
end $$;

create or replace function public.send_message(p_thread uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth_company_id();
  v_t message_threads%rowtype;
  v_other uuid;
  v_msg uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_had_unread boolean;
  v_my_name text;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then raise exception 'INVALID_BODY'; end if;
  select * into v_t from message_threads where id = p_thread;
  if v_t.id is null or v_me not in (v_t.buyer_company_id, v_t.supplier_company_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  v_other := case when v_t.buyer_company_id = v_me then v_t.supplier_company_id else v_t.buyer_company_id end;

  -- una sola notifica per "sessione di lettura": se la controparte ha già
  -- messaggi non letti in questo thread, non ne accodiamo un'altra
  select exists (
    select 1 from thread_messages m
    where m.thread_id = p_thread and m.sender_company_id = v_me and m.read_at is null
  ) into v_had_unread;

  insert into thread_messages (thread_id, sender_company_id, body)
  values (p_thread, v_me, v_body)
  returning id into v_msg;

  update message_threads set last_message_at = now() where id = p_thread;

  if not v_had_unread then
    select legal_name into v_my_name from companies where id = v_me;
    insert into notifications (company_id, type, title, body, action_label, action_url)
    values (v_other, 'message',
            'Nuovo messaggio da ' || coalesce(v_my_name, 'un''azienda BulkStrike'),
            left(v_body, 160),
            'Apri i messaggi', '/messaggi?thread=' || p_thread);
  end if;

  return v_msg;
end $$;

create or replace function public.mark_thread_read(p_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth_company_id();
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (
    select 1 from message_threads t where t.id = p_thread
      and (t.buyer_company_id = v_me or t.supplier_company_id = v_me)
  ) then raise exception 'NOT_ALLOWED'; end if;
  update thread_messages set read_at = now()
  where thread_id = p_thread and sender_company_id <> v_me and read_at is null;
end $$;

create or replace function public.get_my_unread_messages_count()
returns integer language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth_company_id();
begin
  if v_me is null then return 0; end if;
  return coalesce((
    select count(*)::int
    from thread_messages m
    join message_threads t on t.id = m.thread_id
    where (t.buyer_company_id = v_me or t.supplier_company_id = v_me)
      and m.sender_company_id <> v_me and m.read_at is null
  ), 0);
end $$;

-- ── RPC fornitori preferiti ───────────────────────────────────
create or replace function public.follow_supplier(p_supplier uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth_company_id();
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_supplier is null or p_supplier = v_me then raise exception 'INVALID_COMPANY'; end if;
  if not exists (select 1 from companies c where c.id = p_supplier and c.is_supplier and c.status = 'verified') then
    raise exception 'SUPPLIER_NOT_AVAILABLE';
  end if;
  insert into supplier_follows (buyer_company_id, supplier_company_id)
  values (v_me, p_supplier)
  on conflict (buyer_company_id, supplier_company_id) do nothing;
end $$;

create or replace function public.unfollow_supplier(p_supplier uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth_company_id();
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from supplier_follows where buyer_company_id = v_me and supplier_company_id = p_supplier;
end $$;

-- Stessa proiezione card di get_suppliers_directory (nessuna logica duplicata
-- nel client: la pagina Preferiti riusa la stessa struttura dati della directory).
create or replace function public.get_my_followed_suppliers()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth_company_id();
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return coalesce((
    select jsonb_agg(row_data order by row_data->>'name')
    from (
      select jsonb_build_object(
        'id', c.id,
        'name', c.legal_name,
        'logo_url', c.logo_url,
        'supplier_type', c.supplier_type,
        'status', c.status,
        'country', c.country,
        'city', c.city,
        'rating', c.rating,
        'reviews_count', c.reviews_count,
        'countries_served', coalesce(c.countries_served, '{}'),
        'followed_at', f.created_at,
        'product_count', (select count(*) from supplier_products sp where sp.supplier_company_id = c.id and sp.active),
        'certifications', coalesce((
          select jsonb_agg(distinct cert)
          from supplier_products sp, unnest(sp.certifications) cert
          where sp.supplier_company_id = c.id and sp.active
        ), '[]'::jsonb),
        'sector_names', coalesce((
          select jsonb_agg(distinct jsonb_build_object('name', s.name, 'slug', s.slug, 'icon', s.icon))
          from supplier_products sp
          join product_sectors ps on ps.product_id = sp.product_id
          join sectors s on s.id = ps.sector_id
          where sp.supplier_company_id = c.id and sp.active
        ), '[]'::jsonb)
      ) as row_data
      from supplier_follows f
      join companies c on c.id = f.supplier_company_id
      where f.buyer_company_id = v_me
    ) sub
  ), '[]'::jsonb);
end $$;

-- ── Grants: solo utenti autenticati (mai anon), service_role per i job ──
revoke execute on function public.start_or_get_thread(uuid, uuid) from public, anon;
revoke execute on function public.get_my_message_threads() from public, anon;
revoke execute on function public.get_thread_messages(uuid) from public, anon;
revoke execute on function public.send_message(uuid, text) from public, anon;
revoke execute on function public.mark_thread_read(uuid) from public, anon;
revoke execute on function public.get_my_unread_messages_count() from public, anon;
revoke execute on function public.follow_supplier(uuid) from public, anon;
revoke execute on function public.unfollow_supplier(uuid) from public, anon;
revoke execute on function public.get_my_followed_suppliers() from public, anon;

grant execute on function public.start_or_get_thread(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_my_message_threads() to authenticated, service_role;
grant execute on function public.get_thread_messages(uuid) to authenticated, service_role;
grant execute on function public.send_message(uuid, text) to authenticated, service_role;
grant execute on function public.mark_thread_read(uuid) to authenticated, service_role;
grant execute on function public.get_my_unread_messages_count() to authenticated, service_role;
grant execute on function public.follow_supplier(uuid) to authenticated, service_role;
grant execute on function public.unfollow_supplier(uuid) to authenticated, service_role;
grant execute on function public.get_my_followed_suppliers() to authenticated, service_role;
