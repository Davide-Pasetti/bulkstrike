-- DAV-76 — Bacheca Promozioni: RPC di prezzo di riferimento, creazione,
-- approvazione/rifiuto e lettura. Tutte SECURITY DEFINER, search_path fisso.
-- Ogni CREATE OR REPLACE resetta i grant: riapplicati in fondo al file.

-- ── 1) Prezzo di riferimento (media snapshot) ────────────────────────────────
create or replace function public.get_promotion_base_price(
  p_product_id uuid,
  p_window_days int default 180
)
returns table(avg_price numeric, days_used int)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  select round(avg(s.price_per_kg), 4), count(distinct s.snapshot_date)
    into avg_price, days_used
  from product_price_snapshots s
  where s.product_id = p_product_id
    and s.snapshot_date >= current_date - p_window_days;

  if days_used is null or days_used = 0 then
    raise exception 'Storico prezzi insufficiente per calcolare il riferimento di mercato.'
      using errcode = 'P0001';
  end if;
  return next;
end;
$function$;

-- ── 2) Creazione promozione (fornitore) ──────────────────────────────────────
create or replace function public.create_supplier_promotion(
  p_product_id uuid,
  p_supplier_product_id uuid,
  p_discounted_price_per_kg numeric,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_available_kg numeric default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company  uuid := auth_company_id();
  v_avg      numeric;
  v_days     int;
  v_discount numeric;
  v_count    int;
  v_oldest   timestamptz;
  v_promo    uuid;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED'; end if;

  -- Il prodotto deve appartenere al fornitore (coerenza supplier_product).
  if p_supplier_product_id is not null then
    if not exists (
      select 1 from supplier_products sp
      where sp.id = p_supplier_product_id
        and sp.supplier_company_id = v_company
        and sp.product_id = p_product_id
    ) then
      raise exception 'Prodotto non valido per questo fornitore.';
    end if;
  elsif not exists (
      select 1 from supplier_products sp
      where sp.supplier_company_id = v_company
        and sp.product_id = p_product_id and sp.active
  ) then
    raise exception 'Prodotto non valido per questo fornitore.';
  end if;

  if p_discounted_price_per_kg is null or p_discounted_price_per_kg <= 0 then
    raise exception 'Il prezzo promozionale non e'' valido.';
  end if;
  if p_available_kg is not null and p_available_kg <= 0 then
    raise exception 'La quantita'' disponibile non e'' valida.';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Le date della promozione non sono valide.';
  end if;

  -- a) Abbonamento attivo
  if not exists (
    select 1 from supplier_subscriptions
    where supplier_company_id = v_company
      and status = 'active'
      and (current_period_end is null or current_period_end >= now())
  ) then
    raise exception 'Serve un abbonamento attivo per pubblicare una promozione.';
  end if;

  -- b) Quota annua: max 2 per (fornitore, prodotto) negli ultimi 365 giorni,
  --    escluse cancelled/rejected.
  select count(*), min(starts_at) into v_count, v_oldest
  from supplier_promotions
  where supplier_company_id = v_company
    and product_id = p_product_id
    and starts_at >= now() - interval '365 days'
    and status not in ('cancelled','rejected');
  if v_count >= 2 then
    raise exception
      'Hai gia'' usato le 2 promozioni disponibili quest''anno per questo prodotto. La prossima sara'' disponibile dal %.',
      to_char((v_oldest + interval '365 days')::date, 'DD/MM/YYYY');
  end if;

  -- c) Prezzo realmente scontato rispetto al riferimento di mercato.
  select b.avg_price, b.days_used into v_avg, v_days
  from get_promotion_base_price(p_product_id, 180) b;
  if p_discounted_price_per_kg >= v_avg then
    raise exception
      'Il prezzo promozionale deve essere inferiore al prezzo medio di mercato (% €/kg).',
      to_char(v_avg, 'FM999999990.00');
  end if;
  v_discount := round((1 - p_discounted_price_per_kg / v_avg) * 100, 1);

  -- d) Durata massima 14 giorni (oltre alla CHECK sulla tabella).
  if p_ends_at > p_starts_at + interval '14 days' then
    raise exception 'La durata massima di una promozione e'' 14 giorni.';
  end if;

  insert into supplier_promotions (
    supplier_company_id, product_id, supplier_product_id,
    discounted_price_per_kg, base_price_reference, base_price_window_days,
    discount_percent, starts_at, ends_at, available_kg, status, created_by
  ) values (
    v_company, p_product_id, p_supplier_product_id,
    p_discounted_price_per_kg, v_avg, v_days,
    v_discount, p_starts_at, p_ends_at, p_available_kg, 'pending_review', auth.uid()
  ) returning id into v_promo;

  return v_promo;
end;
$function$;

-- ── 3) Approvazione / rifiuto (admin piattaforma) ────────────────────────────
create or replace function public.approve_promotion(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_starts timestamptz; v_status text;
begin
  if not _is_admin() then raise exception 'NOT_ADMIN'; end if;
  select starts_at, status into v_starts, v_status
  from supplier_promotions where id = p_id for update;
  if v_starts is null then raise exception 'Promozione non trovata.'; end if;
  if v_status <> 'pending_review' then
    raise exception 'La promozione non e'' piu'' in attesa di revisione.';
  end if;
  update supplier_promotions
    set status = case when v_starts > now() then 'scheduled' else 'active' end,
        rejection_reason = null,
        updated_at = now()
  where id = p_id;
end;
$function$;

create or replace function public.reject_promotion(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not _is_admin() then raise exception 'NOT_ADMIN'; end if;
  update supplier_promotions
    set status = 'rejected',
        rejection_reason = nullif(trim(coalesce(p_reason,'')), ''),
        updated_at = now()
  where id = p_id and status = 'pending_review';
  if not found then raise exception 'La promozione non e'' piu'' in attesa di revisione.'; end if;
end;
$function$;

-- ── 4) Letture ───────────────────────────────────────────────────────────────
-- Bacheca pubblica: solo promozioni attive, ordinate per scadenza piu' vicina.
create or replace function public.get_active_promotions()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pr.id,
      'product_id', pr.product_id,
      'product_name', p.canonical_name,
      'e_number', p.e_number,
      'merch_classes', p.merch_classes,
      'supplier_company_id', pr.supplier_company_id,
      'supplier_name', sc.legal_name,
      'discounted_price_per_kg', pr.discounted_price_per_kg,
      'base_price_reference', pr.base_price_reference,
      'base_price_window_days', pr.base_price_window_days,
      'discount_percent', pr.discount_percent,
      'starts_at', pr.starts_at,
      'ends_at', pr.ends_at,
      'available_kg', pr.available_kg,
      'sold_kg', pr.sold_kg,
      'remaining_kg', case when pr.available_kg is null then null
                          else greatest(pr.available_kg - pr.sold_kg, 0) end
    ) order by pr.ends_at asc)
    from supplier_promotions pr
    join products p on p.id = pr.product_id
    join companies sc on sc.id = pr.supplier_company_id
    where pr.status = 'active'
      and coalesce(sc.hidden_from_public, false) = false
  ), '[]'::jsonb);
end;
$function$;

-- Pannello fornitore: le proprie promozioni (tutti gli stati) + contatore quota.
create or replace function public.get_my_promotions()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_company uuid := auth_company_id();
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return jsonb_build_object(
    'promotions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'product_id', pr.product_id,
        'product_name', p.canonical_name,
        'discounted_price_per_kg', pr.discounted_price_per_kg,
        'base_price_reference', pr.base_price_reference,
        'base_price_window_days', pr.base_price_window_days,
        'discount_percent', pr.discount_percent,
        'starts_at', pr.starts_at,
        'ends_at', pr.ends_at,
        'available_kg', pr.available_kg,
        'sold_kg', pr.sold_kg,
        'status', pr.status,
        'rejection_reason', pr.rejection_reason,
        'created_at', pr.created_at
      ) order by pr.created_at desc)
      from supplier_promotions pr
      join products p on p.id = pr.product_id
      where pr.supplier_company_id = v_company
    ), '[]'::jsonb),
    -- Contatore quota annua per prodotto (finestra 365 giorni, esclusi
    -- cancelled/rejected). next_available_at = piu'' vecchia delle 2 + 365 gg.
    'quota', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', q.product_id,
        'product_name', pp.canonical_name,
        'used', q.used,
        'limit', 2,
        'next_available_at', case when q.used >= 2
                                  then q.oldest + interval '365 days' else null end
      ))
      from (
        select product_id, count(*) as used, min(starts_at) as oldest
        from supplier_promotions
        where supplier_company_id = v_company
          and starts_at >= now() - interval '365 days'
          and status not in ('cancelled','rejected')
        group by product_id
      ) q
      join products pp on pp.id = q.product_id
    ), '[]'::jsonb)
  );
end;
$function$;

-- Pannello admin: promozioni in attesa di revisione.
create or replace function public.admin_list_pending_promotions()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not _is_admin() then raise exception 'NOT_ADMIN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pr.id,
      'product_id', pr.product_id,
      'product_name', p.canonical_name,
      'supplier_company_id', pr.supplier_company_id,
      'supplier_name', sc.legal_name,
      'discounted_price_per_kg', pr.discounted_price_per_kg,
      'base_price_reference', pr.base_price_reference,
      'base_price_window_days', pr.base_price_window_days,
      'discount_percent', pr.discount_percent,
      'starts_at', pr.starts_at,
      'ends_at', pr.ends_at,
      'available_kg', pr.available_kg,
      'created_at', pr.created_at
    ) order by pr.created_at asc)
    from supplier_promotions pr
    join products p on p.id = pr.product_id
    join companies sc on sc.id = pr.supplier_company_id
    where pr.status = 'pending_review'
  ), '[]'::jsonb);
end;
$function$;

-- ── Grant (riapplicati dopo ogni CREATE OR REPLACE) ──────────────────────────
-- NB: i function nuovi ereditano dai DEFAULT PRIVILEGES di Supabase il grant
-- EXECUTE ad anon: va revocato ESPLICITAMENTE (revoke da public non basta).
revoke execute on function public.get_promotion_base_price(uuid,int) from public, anon;
grant  execute on function public.get_promotion_base_price(uuid,int) to authenticated, service_role;

revoke execute on function public.create_supplier_promotion(uuid,uuid,numeric,timestamptz,timestamptz,numeric) from public, anon;
grant  execute on function public.create_supplier_promotion(uuid,uuid,numeric,timestamptz,timestamptz,numeric) to authenticated, service_role;

revoke execute on function public.approve_promotion(uuid) from public, anon;
grant  execute on function public.approve_promotion(uuid) to authenticated, service_role;

revoke execute on function public.reject_promotion(uuid,text) from public, anon;
grant  execute on function public.reject_promotion(uuid,text) to authenticated, service_role;

revoke execute on function public.get_active_promotions() from public;
grant  execute on function public.get_active_promotions() to anon, authenticated, service_role;

revoke execute on function public.get_my_promotions() from public, anon;
grant  execute on function public.get_my_promotions() to authenticated, service_role;

revoke execute on function public.admin_list_pending_promotions() from public, anon;
grant  execute on function public.admin_list_pending_promotions() to authenticated, service_role;
