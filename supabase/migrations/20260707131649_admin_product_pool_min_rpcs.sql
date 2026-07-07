-- Task 3: RPC admin per leggere/impostare il minimo pedane per aprire un'asta, per-prodotto.
-- Gating: solo platform admin (companies.is_platform_admin). SECURITY DEFINER così
-- l'enforcement non è aggirabile lato client.

CREATE OR REPLACE FUNCTION public.admin_list_products_pool_min()
 RETURNS TABLE (id uuid, canonical_name text, pallet_kg integer, min_pool_pallets integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from companies where id = auth_company_id() and is_platform_admin) then
    raise exception 'NOT_ADMIN';
  end if;
  return query
    select pr.id, pr.canonical_name, pr.pallet_kg, coalesce(pr.min_pool_pallets, 1)
    from products pr
    order by pr.canonical_name;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_product_pool_min(p_product uuid, p_min integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from companies where id = auth_company_id() and is_platform_admin) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_min is null or p_min < 1 then raise exception 'INVALID_MIN'; end if;
  update products set min_pool_pallets = p_min where id = p_product;
  if not found then raise exception 'UNKNOWN_PRODUCT'; end if;
end;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_products_pool_min() FROM public;
REVOKE ALL ON FUNCTION public.admin_set_product_pool_min(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_products_pool_min() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_product_pool_min(uuid, integer) TO authenticated;
