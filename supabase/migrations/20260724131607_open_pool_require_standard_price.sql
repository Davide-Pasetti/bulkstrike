-- Regola di business (titolare, 24/07): un'asta non si apre su un prodotto senza
-- almeno un fornitore quotato (price_tiers). Era un buco: open_pool NON lo
-- controllava, quindi si poteva aprire un'asta su un prodotto senza prezzo, che
-- alla chiusura (close_pool, ramo senza offerte) generava ordini a prezzo NULL.
-- Aggiunta solo la guardia sul prezzo. Il blocco legale D.Lgs. 198/2021
-- (AUCTION_RESTRICTED_BY_LAW) e tutto il resto restano INVARIATI.
CREATE OR REPLACE FUNCTION public.open_pool(p_product uuid, p_quantity numeric, p_accept boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_company uuid := auth_company_id(); v_pallet integer; v_min_pallets integer; v_pool uuid; v_restricted boolean;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from companies where id = v_company and is_buyer) then raise exception 'NOT_A_BUYER'; end if;
  if not p_accept then raise exception 'DISCLAIMER_REQUIRED'; end if;
  select pallet_kg, coalesce(min_pool_pallets, 1), coalesce(auction_restricted_by_law, false)
    into v_pallet, v_min_pallets, v_restricted from products where id = p_product;
  if v_pallet is null then raise exception 'UNKNOWN_PRODUCT'; end if;
  if v_restricted and (select count(distinct sp.supplier_company_id) from supplier_products sp
                       where sp.product_id = p_product and sp.active) >= 2 then
    raise exception 'AUCTION_RESTRICTED_BY_LAW';
  end if;
  -- Nessun fornitore con un prezzo standard per questa quantita' → niente asta:
  -- non potrebbe chiudersi con un prezzo. Stesso lookup che usa close_pool.
  if (select price from _best_standard_price(p_product, p_quantity)) is null then
    raise exception 'NO_STANDARD_PRICE';
  end if;
  if p_quantity < v_pallet * v_min_pallets then raise exception 'BELOW_MIN_PALLET'; end if;
  if mod(p_quantity, v_pallet) <> 0 then raise exception 'MUST_BE_WHOLE_PALLET_MULTIPLE'; end if;
  if exists (select 1 from pools where product_id = p_product and status in ('open','final_phase')) then
    raise exception 'POOL_ALREADY_OPEN';
  end if;
  insert into pools (product_id, status, opened_by_company_id, pallet_kg, total_volume_kg, closes_at)
  values (p_product, 'open', v_company, v_pallet, p_quantity, now() + interval '7 days') returning id into v_pool;
  insert into pool_participants (pool_id, buyer_company_id, quantity_kg, accepted_disclaimer)
  values (v_pool, v_company, p_quantity, true);
  insert into pool_events (pool_id, event_type, actor_company_id, data)
  values (v_pool, 'opened', v_company, jsonb_build_object('quantity_kg', p_quantity));
  perform _notify_pool_watchers(p_product, v_pool, v_company);
  return v_pool;
end;
$function$;

-- CREATE OR REPLACE azzera i grant ai default: riapplicare (revoke da PUBLIC).
REVOKE ALL ON FUNCTION public.open_pool(uuid, numeric, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.open_pool(uuid, numeric, boolean) TO authenticated, service_role;
