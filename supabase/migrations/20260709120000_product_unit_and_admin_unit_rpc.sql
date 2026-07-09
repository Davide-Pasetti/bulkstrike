-- Tipo prodotto (default_unit: 'kg' = solido, 'L' = liquido) editabile dal
-- pannello admin "Apertura asta". Aggiunge un flag di revisione per le
-- classificazioni ancora da confermare (mostrato come "da verificare" nella UI).
-- Stesso gate NOT_ADMIN (SECURITY DEFINER) delle altre RPC admin.

alter table public.products
  add column if not exists unit_needs_review boolean not null default false;

-- La lista admin espone anche tipo prodotto e flag di revisione
-- (drop necessario: cambia la shape del RETURNS TABLE).
drop function if exists public.admin_list_products_pool_min();
create function public.admin_list_products_pool_min()
returns table(id uuid, canonical_name text, pallet_kg integer, sacco_kg integer, container_kg integer, min_pool_pallets integer, default_unit text, unit_needs_review boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from companies where id = auth_company_id() and is_platform_admin) then
    raise exception 'NOT_ADMIN';
  end if;
  return query
    select pr.id, pr.canonical_name, pr.pallet_kg, pr.sacco_kg, pr.container_kg,
           coalesce(pr.min_pool_pallets, 1), pr.default_unit, pr.unit_needs_review
    from products pr
    order by pr.canonical_name;
end;
$$;

-- Imposta il tipo prodotto ('kg' solido | 'L' liquido). Un click nel pannello e'
-- una decisione esplicita dell'admin: azzera sempre il flag "da verificare".
create or replace function public.admin_set_product_unit(p_product uuid, p_unit text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from companies where id = auth_company_id() and is_platform_admin) then
    raise exception 'NOT_ADMIN';
  end if;
  if p_unit is null or p_unit not in ('kg', 'L') then raise exception 'INVALID_UNIT'; end if;
  update products set default_unit = p_unit, unit_needs_review = false where id = p_product;
  if not found then raise exception 'UNKNOWN_PRODUCT'; end if;
end;
$$;
