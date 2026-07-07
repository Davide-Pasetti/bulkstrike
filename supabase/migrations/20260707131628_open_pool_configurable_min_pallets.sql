-- Task 3: open_pool ora rispetta il minimo per-prodotto (products.min_pool_pallets).
-- Invariato tutto il resto: multiplo intero di pallet obbligatorio in apertura,
-- un solo pool aperto per prodotto, ecc.
CREATE OR REPLACE FUNCTION public.open_pool(p_product uuid, p_quantity numeric, p_accept boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid := auth_company_id(); v_pallet integer; v_min_pallets integer; v_pool uuid;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from companies where id = v_company and is_buyer) then raise exception 'NOT_A_BUYER'; end if;
  if not p_accept then raise exception 'DISCLAIMER_REQUIRED'; end if;

  select pallet_kg, coalesce(min_pool_pallets, 1) into v_pallet, v_min_pallets from products where id = p_product;
  if v_pallet is null then raise exception 'UNKNOWN_PRODUCT'; end if;
  -- minimo per aprire = min_pool_pallets pedane (configurabile da admin, default 1 pallet)
  if p_quantity < v_pallet * v_min_pallets then raise exception 'BELOW_MIN_PALLET'; end if;
  -- aprire un'asta richiede sempre un multiplo intero di pallet (niente collettame in apertura,
  -- solo chi aderisce dopo con una quantità libera se ne fa carico).
  if mod(p_quantity, v_pallet) <> 0 then raise exception 'MUST_BE_WHOLE_PALLET_MULTIPLE'; end if;
  if exists (select 1 from pools where product_id = p_product and status in ('open','final_phase')) then
    raise exception 'POOL_ALREADY_OPEN';   -- il frontend deve proporre di unirsi
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
