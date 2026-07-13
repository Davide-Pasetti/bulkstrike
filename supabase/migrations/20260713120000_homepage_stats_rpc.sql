-- Contatori reali per il blocco statistiche + badge della homepage (pubblici).
create or replace function public.get_homepage_stats()
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'active_pools', (select count(*) from pools where status in ('open','final_phase')),
    'products',     (select count(*) from products),
    'suppliers',    (select count(*) from companies where is_supplier and deleted_at is null),
    'companies',    (select count(*) from companies where deleted_at is null),
    'countries',    (select count(distinct country) from companies where country is not null and country <> '' and deleted_at is null)
  );
$$;
grant execute on function public.get_homepage_stats() to anon, authenticated;
