-- Editing dei formati di vendita per prodotto dal pannello admin "Apertura asta":
-- pallet_kg (sempre richiesto, >= 1) e sacco_kg/container_kg (null = formato non
-- disponibile: il bottone nel pannello asta non compare). Stesso gate NOT_ADMIN
-- delle altre RPC admin.

-- La lista espone anche i due nuovi campi (drop: cambia la shape del RETURNS TABLE).
drop function if exists public.admin_list_products_pool_min();
create function public.admin_list_products_pool_min()
returns table(id uuid, canonical_name text, pallet_kg integer, sacco_kg integer, container_kg integer, min_pool_pallets integer)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from companies where id = auth_company_id() and is_platform_admin) then
    raise exception 'NOT_ADMIN';
  end if;
  return query
    select pr.id, pr.canonical_name, pr.pallet_kg, pr.sacco_kg, pr.container_kg, coalesce(pr.min_pool_pallets, 1)
    from products pr
    order by pr.canonical_name;
end;
$$;

create or replace function public.admin_set_product_formats(p_product uuid, p_pallet integer, p_sacco integer, p_container integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from companies where id = auth_company_id() and is_platform_admin) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_pallet is null or p_pallet < 1 then raise exception 'INVALID_PALLET'; end if;
  if p_sacco is not null and p_sacco < 1 then raise exception 'INVALID_FORMAT'; end if;
  if p_container is not null and p_container < 1 then raise exception 'INVALID_FORMAT'; end if;
  update products set pallet_kg = p_pallet, sacco_kg = p_sacco, container_kg = p_container where id = p_product;
  if not found then raise exception 'UNKNOWN_PRODUCT'; end if;
end;
$$;
