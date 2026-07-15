-- Divieto asta agricoli (D.Lgs 198/2021) — raffinamento del 15/7/2026.
-- Il divieto riguarda l'ASTA A RIBASSO (competizione tra 2+ fornitori distinti),
-- NON la domanda aggregata: l'Acquisto di gruppo (aggregazione su UN solo fornitore
-- a prezzo fisso) è legittimo per i prodotti agricoli. Prima le 3 RPC bloccavano
-- qualsiasi pool sui prodotti ristretti; ora bloccano solo quando ci sono 2+ fornitori.
-- Conteggio fornitori = count(distinct supplier_company_id) attivi, coerente con la
-- logica groupBuy della UI (1 fornitore = acquisto di gruppo).
-- NB: CREATE OR REPLACE di funzioni SECURITY DEFINER → riapplico i grant (revoke da
-- PUBLIC, execute solo a authenticated + service_role), come da hardening del progetto.

create or replace function public.open_pool(p_product uuid, p_quantity numeric, p_accept boolean default true)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_company uuid := auth_company_id(); v_pallet integer; v_min_pallets integer; v_pool uuid; v_restricted boolean;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from companies where id = v_company and is_buyer) then raise exception 'NOT_A_BUYER'; end if;
  if not p_accept then raise exception 'DISCLAIMER_REQUIRED'; end if;

  select pallet_kg, coalesce(min_pool_pallets, 1), coalesce(auction_restricted_by_law, false)
    into v_pallet, v_min_pallets, v_restricted
    from products where id = p_product;
  if v_pallet is null then raise exception 'UNKNOWN_PRODUCT'; end if;
  -- Divieto D.Lgs 198/2021: vietata l'asta a ribasso (competizione tra 2+ fornitori
  -- distinti), NON l'acquisto di gruppo (1 fornitore, prezzo fisso). Blocco solo se 2+.
  if v_restricted and (select count(distinct sp.supplier_company_id) from supplier_products sp
                       where sp.product_id = p_product and sp.active) >= 2 then
    raise exception 'AUCTION_RESTRICTED_BY_LAW';
  end if;
  if p_quantity < v_pallet * v_min_pallets then raise exception 'BELOW_MIN_PALLET'; end if;
  if mod(p_quantity, v_pallet) <> 0 then raise exception 'MUST_BE_WHOLE_PALLET_MULTIPLE'; end if;
  if exists (select 1 from pools where product_id = p_product and status in ('open','final_phase')) then
    raise exception 'POOL_ALREADY_OPEN';
  end if;

  insert into pools (product_id, status, opened_by_company_id, pallet_kg, total_volume_kg, closes_at)
  values (p_product, 'open', v_company, v_pallet, p_quantity, now() + interval '7 days')
  returning id into v_pool;

  insert into pool_participants (pool_id, buyer_company_id, quantity_kg, accepted_disclaimer)
  values (v_pool, v_company, p_quantity, true);

  insert into pool_events (pool_id, event_type, actor_company_id, data)
  values (v_pool, 'opened', v_company, jsonb_build_object('quantity_kg', p_quantity));

  perform _notify_pool_watchers(p_product, v_pool, v_company);
  return v_pool;
end;
$function$;

create or replace function public.join_pool(p_pool uuid, p_quantity numeric, p_accept boolean default true)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_company uuid := auth_company_id(); v_product uuid;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not p_accept then raise exception 'DISCLAIMER_REQUIRED'; end if;
  if p_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;

  select product_id into v_product from pools where id = p_pool and status = 'open' for update;
  if v_product is null then raise exception 'POOL_NOT_OPEN'; end if;
  -- Divieto D.Lgs 198/2021: blocco l'adesione solo se il pool è un'asta a ribasso
  -- competitiva (2+ fornitori distinti). L'acquisto di gruppo (1 fornitore) è ammesso.
  if exists (select 1 from products where id = v_product and auction_restricted_by_law)
     and (select count(distinct sp.supplier_company_id) from supplier_products sp
          where sp.product_id = v_product and sp.active) >= 2 then
    raise exception 'AUCTION_RESTRICTED_BY_LAW';
  end if;

  insert into pool_participants (pool_id, buyer_company_id, quantity_kg, accepted_disclaimer)
  values (p_pool, v_company, p_quantity, true)
  on conflict (pool_id, buyer_company_id)
    do update set quantity_kg = pool_participants.quantity_kg + excluded.quantity_kg;

  update pools set total_volume_kg = (select coalesce(sum(quantity_kg),0) from pool_participants where pool_id = p_pool),
                   updated_at = now()
  where id = p_pool;

  insert into pool_events (pool_id, event_type, actor_company_id, data)
  values (p_pool, 'joined', v_company, jsonb_build_object('quantity_kg', p_quantity));
end;
$function$;

create or replace function public.join_pool_at_target(p_pool uuid, p_quantity numeric, p_target_price numeric, p_accept boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_company uuid := auth_company_id(); v_product uuid; v_best numeric;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not p_accept then raise exception 'DISCLAIMER_REQUIRED'; end if;
  if p_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  if p_target_price <= 0 then raise exception 'INVALID_TARGET_PRICE'; end if;

  select product_id, best_price_per_kg into v_product, v_best from pools where id = p_pool and status = 'open' for update;
  if v_product is null then raise exception 'POOL_NOT_OPEN'; end if;
  -- Divieto D.Lgs 198/2021: solo asta a ribasso competitiva (2+ fornitori). L'adesione
  -- a soglia ha senso solo in asta; l'acquisto di gruppo (1 fornitore) resta ammesso.
  if exists (select 1 from products where id = v_product and auction_restricted_by_law)
     and (select count(distinct sp.supplier_company_id) from supplier_products sp
          where sp.product_id = v_product and sp.active) >= 2 then
    raise exception 'AUCTION_RESTRICTED_BY_LAW';
  end if;

  if v_best is not null and v_best <= p_target_price then
    insert into pool_participants (pool_id, buyer_company_id, quantity_kg, accepted_disclaimer)
    values (p_pool, v_company, p_quantity, true)
    on conflict (pool_id, buyer_company_id)
      do update set quantity_kg = pool_participants.quantity_kg + excluded.quantity_kg;
    update pools set total_volume_kg = (select coalesce(sum(quantity_kg),0) from pool_participants where pool_id = p_pool), updated_at = now() where id = p_pool;
    insert into pool_events (pool_id, event_type, actor_company_id, data)
    values (p_pool, 'joined', v_company, jsonb_build_object('quantity_kg', p_quantity));
    return jsonb_build_object('status', 'joined_now');
  else
    insert into pool_target_joins (pool_id, buyer_company_id, quantity_kg, target_price_per_kg)
    values (p_pool, v_company, p_quantity, p_target_price)
    on conflict (pool_id, buyer_company_id) where status = 'pending'
    do update set quantity_kg = excluded.quantity_kg, target_price_per_kg = excluded.target_price_per_kg, created_at = now();
    return jsonb_build_object('status', 'pending');
  end if;
end;
$function$;

-- Riapplico i grant (le 3 funzioni erano: execute a authenticated + service_role, niente PUBLIC).
revoke execute on function public.open_pool(uuid, numeric, boolean) from public;
grant execute on function public.open_pool(uuid, numeric, boolean) to authenticated, service_role;
revoke execute on function public.join_pool(uuid, numeric, boolean) from public;
grant execute on function public.join_pool(uuid, numeric, boolean) to authenticated, service_role;
revoke execute on function public.join_pool_at_target(uuid, numeric, numeric, boolean) from public;
grant execute on function public.join_pool_at_target(uuid, numeric, numeric, boolean) to authenticated, service_role;

-- Flag divieto sui 2 prodotti soia grezzi/mangimistici (D.Lgs 198/2021; da validare
-- con l'avvocato per la Farina di estrazione, derivato/mangime).
update public.products set auction_restricted_by_law = true
where id in ('560227d1-6a2b-4c8f-ad24-d440583f2a12','444e4e58-fd8e-4105-aee9-49ae4033da6e');
