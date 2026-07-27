-- ============================================================
-- DAV-33-bis — Layer legale sul modello fornitori non verificati
-- ------------------------------------------------------------
-- Le aziende censite da fonti pubbliche sono visibili come "non verificate"
-- (DAV-33): questo layer dà a chiunque una via d'uscita self-service e a
-- Davide uno strumento immediato per gestire una lamentela reale.
--
-- 1. company_removal_requests + RPC request_company_removal: richiesta di
--    rimozione SENZA login (email aziendale + motivo), una sola richiesta
--    aperta per azienda (indice parziale, anti-spam). Notifica attiva a
--    Davide con la stessa catena di DAV-33 (outbox → pg_net → edge → Resend).
-- 2. companies.hidden_from_public (+reason/at): l'azienda sparisce SUBITO da
--    tutte le viste pubbliche senza cancellare nulla (audit/storico).
--    Controllato in: is_visible_supplier, suppliers_public,
--    get_suppliers_directory, get_supplier_profile,
--    get_product_candidate_suppliers.
-- 3. RPC admin: admin_set_company_hidden (nascondi/ripristina),
--    admin_list_removal_requests, admin_review_removal (nascondi e segna
--    gestita / ignora).
--
-- ATTENZIONE GRANT (regola di casa): ogni oggetto ricreato ha il suo blocco
-- revoke/grant in QUESTA migration.
-- ============================================================

-- ── 1. Flag di occultamento immediato ─────────────────────────────────────
alter table public.companies
  add column if not exists hidden_from_public boolean not null default false,
  add column if not exists hidden_reason text,
  add column if not exists hidden_at timestamptz;
comment on column public.companies.hidden_from_public is
  'Rimossa da TUTTE le viste pubbliche (lamentela/richiesta del titolare) senza cancellare i dati. DAV-33-bis.';

-- ── 2. Richieste di rimozione (tracciate, mai cancellate) ─────────────────
create table if not exists public.company_removal_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  requested_by_email text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','handled','rejected')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by_profile_id uuid references public.profiles(id)
);
comment on table public.company_removal_requests is
  'Richieste self-service di rimozione di un''azienda censita (nessun login richiesto). Scrittura solo via RPC.';
-- RLS attiva senza policy: nessun accesso diretto dai client, solo RPC
-- SECURITY DEFINER e service role (stesso pattern di emails_outbox).
alter table public.company_removal_requests enable row level security;
-- Una sola richiesta aperta per azienda: la seconda viene rifiutata con
-- garbo dalla RPC (status already_pending), non inserita.
create unique index if not exists company_removal_requests_open_uniq
  on public.company_removal_requests(company_id) where status = 'pending';

-- ── 3. RPC pubblica: richiedi la rimozione (senza login) ──────────────────
create or replace function public.request_company_removal(p_company uuid, p_email text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_reason text := left(btrim(coalesce(p_reason, '')), 2000);
begin
  select legal_name into v_name
    from companies where id = p_company and is_supplier and deleted_at is null;
  if v_name is null then raise exception 'COMPANY_NOT_FOUND'; end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if exists (select 1 from company_removal_requests r
             where r.company_id = p_company and r.status = 'pending') then
    return jsonb_build_object('status', 'already_pending');
  end if;
  insert into company_removal_requests (company_id, requested_by_email, reason)
  values (p_company, v_email, nullif(v_reason, ''));
  return jsonb_build_object('status', 'ok');
end $$;
revoke execute on function public.request_company_removal(uuid, text, text) from public;
grant execute on function public.request_company_removal(uuid, text, text) to anon, authenticated, service_role;

-- Notifica attiva a Davide a ogni richiesta (stessa catena di DAV-33).
create or replace function public._notify_removal_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into emails_outbox (kind, to_company_id, subject, body_text)
  select 'removal_request', new.company_id,
    '[BulkStrike] Richiesta di RIMOZIONE: ' || coalesce(c.legal_name, new.company_id::text),
    'Azienda: ' || coalesce(c.legal_name, new.company_id::text)
      || chr(10) || 'Richiedente: ' || new.requested_by_email
      || chr(10) || 'Motivo: ' || coalesce(new.reason, '(non indicato)')
      || chr(10) || chr(10) || 'Dalla console puoi nasconderla subito dalle viste pubbliche:'
      || chr(10) || 'https://www.bulkstrike.com/admin/fornitori'
  from companies c where c.id = new.company_id;
  return new;
end $$;
revoke execute on function public._notify_removal_request() from public, anon, authenticated;

drop trigger if exists trg_removal_request_notify on public.company_removal_requests;
create trigger trg_removal_request_notify
  after insert on public.company_removal_requests
  for each row execute function public._notify_removal_request();

-- Il dispatcher outbox ora spedisce anche il nuovo kind.
drop trigger if exists trg_outbox_dispatch on public.emails_outbox;
create trigger trg_outbox_dispatch
  after insert on public.emails_outbox
  for each row
  when (new.kind in ('claim_request','unclaimed_contact','removal_request') and new.status = 'queued')
  execute function public._dispatch_outbox_email();

-- ── 4. Visibilità pubblica: il flag vale ovunque ──────────────────────────
create or replace function public.is_visible_supplier(p_company uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from companies c
    where c.id = p_company
      and c.is_supplier
      and c.deleted_at is null
      and not c.hidden_from_public
      and (c.status = 'verified'
           or (c.status = 'pending' and c.import_source in ('import','europages')))
  );
$$;
revoke execute on function public.is_visible_supplier(uuid) from public;
grant execute on function public.is_visible_supplier(uuid) to anon, authenticated, service_role;

create or replace view public.suppliers_public as
 SELECT id,
    legal_name,
    logo_url,
    description,
    supplier_type,
    status,
    country,
    region,
    city,
        CASE
            WHEN has_confirmed_order_between(auth_company_id(), id) OR auth_company_id() = id THEN address
            ELSE NULL::text
        END AS address,
        CASE
            WHEN has_confirmed_order_between(auth_company_id(), id) OR auth_company_id() = id THEN phone
            ELSE NULL::text
        END AS phone,
        CASE
            WHEN has_confirmed_order_between(auth_company_id(), id) OR auth_company_id() = id THEN fax
            ELSE NULL::text
        END AS fax,
    website,
        CASE
            WHEN has_confirmed_order_between(auth_company_id(), id) OR auth_company_id() = id THEN support_email
            ELSE NULL::text
        END AS support_email,
    linkedin_url,
    facebook_url,
    rating,
    reviews_count,
    countries_served,
    production_capacity,
    employee_count_range,
    founded_year,
    company_certifications,
    latitude,
    longitude,
    europages_url,
    import_source,
    created_at
   FROM companies c
  WHERE is_supplier = true
    AND deleted_at IS NULL
    AND hidden_from_public = false
    AND (status = 'verified'::company_status
         OR (status = 'pending'::company_status AND import_source IN ('import','europages')));
revoke all on public.suppliers_public from public, anon;
grant select on public.suppliers_public to authenticated, service_role;

create or replace function public.get_suppliers_directory()
returns jsonb
language sql stable security definer set search_path = public as $$
  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'name'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', c.id,
      'name', c.legal_name,
      'logo_url', c.logo_url,
      'supplier_type', c.supplier_type,
      'status', c.status,
      'country', c.country,
      'country_iso2', c.country_iso2,
      'city', c.city,
      'rating', c.rating,
      'reviews_count', c.reviews_count,
      'countries_served', COALESCE(c.countries_served, '{}'),
      'product_count', (SELECT count(*) FROM supplier_products sp WHERE sp.supplier_company_id = c.id AND sp.active),
      'certifications', COALESCE((
        SELECT jsonb_agg(DISTINCT cert)
        FROM supplier_products sp, unnest(sp.certifications) cert
        WHERE sp.supplier_company_id = c.id AND sp.active
      ), '[]'::jsonb),
      'sectors', COALESCE((
        SELECT jsonb_agg(DISTINCT s.slug)
        FROM supplier_products sp
        JOIN product_sectors ps ON ps.product_id = sp.product_id
        JOIN sectors s ON s.id = ps.sector_id
        WHERE sp.supplier_company_id = c.id AND sp.active
      ), '[]'::jsonb),
      'sector_names', COALESCE((
        SELECT jsonb_agg(DISTINCT jsonb_build_object('name', s.name, 'slug', s.slug, 'icon', s.icon))
        FROM supplier_products sp
        JOIN product_sectors ps ON ps.product_id = sp.product_id
        JOIN sectors s ON s.id = ps.sector_id
        WHERE sp.supplier_company_id = c.id AND sp.active
      ), '[]'::jsonb),
      'macros', COALESCE((
        SELECT jsonb_agg(DISTINCT m.slug)
        FROM supplier_products sp
        JOIN product_sectors ps ON ps.product_id = sp.product_id
        JOIN sectors s ON s.id = ps.sector_id
        JOIN macro_areas m ON m.id = s.macro_area_id
        WHERE sp.supplier_company_id = c.id AND sp.active
      ), '[]'::jsonb)
    ) AS row_data
    FROM companies c
    WHERE c.is_supplier = true
      AND c.deleted_at IS NULL
      AND c.hidden_from_public = false
      AND (c.status = 'verified'
           OR (c.status = 'pending' AND c.import_source IN ('import','europages')))
  ) sub;
$$;
revoke execute on function public.get_suppliers_directory() from public, anon;
grant execute on function public.get_suppliers_directory() to authenticated, service_role;

-- Profilo: il WHERE finale usa già is_visible_supplier (che ora esclude le
-- nascoste); qui si allineano anche rank e totale al medesimo insieme.
create or replace function public.get_supplier_profile(p_company uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.legal_name,
    'logo_url', c.logo_url,
    'description', c.description,
    'supplier_type', c.supplier_type,
    'status', c.status,
    'country', c.country,
    'country_iso2', c.country_iso2,
    'city', c.city,
    'website', c.website,
    'contacts_visible', rv.ok,
    'phone', case when rv.ok then c.phone end,
    'support_email', case when rv.ok then c.support_email end,
    'contact_name', case when rv.ok then c.contact_name end,
    'address', case when rv.ok then c.address end,
    'countries_served', coalesce(c.countries_served, '{}'),
    'rating', c.rating,
    'reviews_count', c.reviews_count,
    'member_since', to_char(c.created_at, 'YYYY'),
    'site_rank', (select r.rk from (
        select id, rank() over (order by rating desc nulls last, reviews_count desc nulls last) rk
        from companies where is_supplier = true and deleted_at is null and not hidden_from_public
          and (status = 'verified' or (status = 'pending' and import_source in ('import','europages')))
      ) r where r.id = c.id),
    'suppliers_total', (select count(*) from companies where is_supplier = true and deleted_at is null and not hidden_from_public
          and (status = 'verified' or (status = 'pending' and import_source in ('import','europages')))),
    'sectors', coalesce((
      select jsonb_agg(distinct jsonb_build_object('name', s.name, 'slug', s.slug, 'icon', s.icon,
                                                   'macro', m.name, 'macro_slug', m.slug))
      from supplier_products sp
      join product_sectors ps on ps.product_id = sp.product_id
      join sectors s on s.id = ps.sector_id
      left join macro_areas m on m.id = s.macro_area_id
      where sp.supplier_company_id = c.id and sp.active
    ), '[]'::jsonb),
    'certifications', coalesce((
      select jsonb_agg(distinct cert)
      from supplier_products sp, unnest(sp.certifications) cert
      where sp.supplier_company_id = c.id and sp.active
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', p.id,
        'name', p.canonical_name,
        'e_number', p.e_number,
        'cas_number', p.cas_number,
        'grade', sp.grade,
        'min_order_kg', sp.min_order_kg,
        'lead_time_days', sp.lead_time_days,
        'certifications', coalesce(sp.certifications, '{}'),
        'best_price', case when c.manually_verified
                           then (select min(pt.price_per_kg) from price_tiers pt where pt.supplier_product_id = sp.id)
                      end,
        'has_pool', exists (select 1 from pools po where po.product_id = p.id and po.status in ('open','final_phase')),
        'sector', (select s2.name from product_sectors ps2 join sectors s2 on s2.id = ps2.sector_id
                   where ps2.product_id = p.id order by s2.name limit 1)
      ) order by p.canonical_name)
      from supplier_products sp
      join products p on p.id = sp.product_id
      where sp.supplier_company_id = c.id and sp.active
    ), '[]'::jsonb)
  )
  from companies c
  cross join lateral (
    select (public.has_confirmed_order_between(public.auth_company_id(), c.id)
            or public.auth_company_id() = c.id) as ok
  ) rv
  where c.id = p_company and public.is_visible_supplier(c.id);
$$;
revoke execute on function public.get_supplier_profile(uuid) from public, anon;
grant execute on function public.get_supplier_profile(uuid) to authenticated, service_role;

-- Candidati esterni: mai mostrare aziende nascoste (o cancellate, filtro che
-- mancava anche qui).
create or replace function public.get_product_candidate_suppliers(p_product_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'legal_name', c.legal_name,
    'country', c.country,
    'country_iso2', c.country_iso2,
    'supplier_type', c.supplier_type,
    'website', c.website,
    'logo_url', c.logo_url,
    'support_email', c.support_email
  ) order by c.legal_name), '[]'::jsonb)
  from supplier_products sp
  join companies c on c.id = sp.supplier_company_id
  where sp.product_id = p_product_id
    and sp.active = false
    and c.status <> 'verified'
    and c.is_supplier = true
    and c.deleted_at is null
    and not c.hidden_from_public;
$$;
revoke execute on function public.get_product_candidate_suppliers(uuid) from public, anon;
grant execute on function public.get_product_candidate_suppliers(uuid) to authenticated, service_role;

-- ── 5. Azioni admin ───────────────────────────────────────────────────────
create or replace function public.admin_set_company_hidden(p_company uuid, p_hidden boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not _is_admin() then raise exception 'NOT_ADMIN'; end if;
  update companies
     set hidden_from_public = p_hidden,
         hidden_reason = case when p_hidden then coalesce(nullif(btrim(coalesce(p_reason,'')),''), 'Nascosta su richiesta') end,
         hidden_at = case when p_hidden then now() end,
         updated_at = now(),
         verification_notes = concat_ws(' ', nullif(verification_notes, ''),
           '['||to_char(now(),'DD/MM/YYYY')||' '||
           case when p_hidden then 'nascosta dalle viste pubbliche'
                else 'ripristinata nelle viste pubbliche' end ||
           coalesce(' — '||nullif(btrim(coalesce(p_reason,'')),''), '')||']')
   where id = p_company and deleted_at is null
   returning legal_name into v_name;
  if v_name is null then raise exception 'COMPANY_NOT_FOUND'; end if;
  return jsonb_build_object('company_id', p_company, 'legal_name', v_name, 'hidden', p_hidden);
end $$;
revoke execute on function public.admin_set_company_hidden(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_company_hidden(uuid, boolean, text) to authenticated, service_role;

create or replace function public.admin_list_removal_requests()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not _is_admin() then raise exception 'NOT_ADMIN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'request_id', r.id,
      'company_id', r.company_id,
      'legal_name', c.legal_name,
      'country', c.country,
      'country_iso2', c.country_iso2,
      'website', c.website,
      'requested_by_email', r.requested_by_email,
      'reason', r.reason,
      'created_at', r.created_at,
      'hidden_from_public', c.hidden_from_public
    ) order by r.created_at)
    from company_removal_requests r
    join companies c on c.id = r.company_id
    where r.status = 'pending'
  ), '[]'::jsonb);
end $$;
revoke execute on function public.admin_list_removal_requests() from public, anon;
grant execute on function public.admin_list_removal_requests() to authenticated, service_role;

-- p_action: 'hide' = nascondi l'azienda e segna gestita; 'dismiss' = ignora
-- (es. richiesta pretestuosa/spam) senza toccare la visibilità.
create or replace function public.admin_review_removal(p_request uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r company_removal_requests%rowtype;
begin
  if not _is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_action not in ('hide','dismiss') then raise exception 'INVALID_ACTION'; end if;
  select * into r from company_removal_requests where id = p_request for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if r.status <> 'pending' then raise exception 'ALREADY_REVIEWED'; end if;

  if p_action = 'hide' then
    perform admin_set_company_hidden(r.company_id, true,
      'Richiesta di rimozione da ' || r.requested_by_email);
  end if;

  update company_removal_requests
     set status = case when p_action = 'hide' then 'handled' else 'rejected' end,
         handled_at = now(),
         handled_by_profile_id = auth.uid()
   where id = p_request;

  return jsonb_build_object('request_id', p_request, 'action', p_action);
end $$;
revoke execute on function public.admin_review_removal(uuid, text) from public, anon;
grant execute on function public.admin_review_removal(uuid, text) to authenticated, service_role;
