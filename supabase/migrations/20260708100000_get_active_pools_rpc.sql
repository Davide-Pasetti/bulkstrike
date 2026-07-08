-- Elenco pubblico delle aste attive (pagina /pool senza id).
-- Stessa impostazione delle altre RPC pubbliche di lettura pool
-- (get_pool_detail, get_open_pool_for_product): SECURITY DEFINER perché la
-- tabella pools ha RLS auth.uid() IS NOT NULL, ma l'elenco aste è una pagina
-- di navigazione pubblica (come il catalogo). Espone solo dati non sensibili.
create or replace function public.get_active_pools()
returns table(
  id uuid,
  status pool_status,
  pallet_kg integer,
  total_volume_kg numeric,
  best_price_per_kg numeric,
  closes_at timestamp with time zone,
  final_phase_ends_at timestamp with time zone,
  product_id uuid,
  product_name text,
  product_enum text,
  participants bigint,
  num_bids bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.status, p.pallet_kg, p.total_volume_kg, p.best_price_per_kg,
         p.closes_at, p.final_phase_ends_at,
         pr.id, pr.canonical_name, pr.e_number,
         (select count(*) from pool_participants pp where pp.pool_id = p.id) as participants,
         (select count(distinct b.supplier_company_id) from bids b where b.pool_id = p.id) as num_bids
  from pools p
  join products pr on pr.id = p.product_id
  where p.status in ('open','final_phase')
  order by p.closes_at asc;
$$;
