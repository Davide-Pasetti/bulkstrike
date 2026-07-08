-- Fix: in plpgsql le colonne del RETURNS TABLE sono variabili, quindi nella
-- guardia admin "where id = auth_company_id()" il riferimento a id era ambiguo
-- (errore 42702 a runtime, la pagina admin mostrava "Operazione non riuscita").
-- Qualifichiamo la tabella con un alias; stessa qualifica per coerenza anche
-- in admin_set_product_formats.
create or replace function public.admin_list_products_pool_min()
returns table(id uuid, canonical_name text, pallet_kg integer, sacco_kg integer, container_kg integer, min_pool_pallets integer)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from companies c where c.id = auth_company_id() and c.is_platform_admin) then
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
  if not exists (select 1 from companies c where c.id = auth_company_id() and c.is_platform_admin) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_pallet is null or p_pallet < 1 then raise exception 'INVALID_PALLET'; end if;
  if p_sacco is not null and p_sacco < 1 then raise exception 'INVALID_FORMAT'; end if;
  if p_container is not null and p_container < 1 then raise exception 'INVALID_FORMAT'; end if;
  update products set pallet_kg = p_pallet, sacco_kg = p_sacco, container_kg = p_container where products.id = p_product;
  if not found then raise exception 'UNKNOWN_PRODUCT'; end if;
end;
$$;
