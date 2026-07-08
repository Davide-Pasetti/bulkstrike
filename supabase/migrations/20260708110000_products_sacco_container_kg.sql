-- Formati di vendita per prodotto oltre al pallet: peso di 1 sacco e di 1
-- container (kg). Nullable: il bottone del formato compare nel pannello asta
-- SOLO se il valore è impostato per quel prodotto (coerente con pallet_kg).
alter table public.products add column if not exists sacco_kg integer;
alter table public.products add column if not exists container_kg integer;

comment on column public.products.sacco_kg is 'Peso in kg di 1 sacco per questo prodotto (null = formato non disponibile)';
comment on column public.products.container_kg is 'Peso in kg di 1 container per questo prodotto (null = formato non disponibile)';

-- get_pool_detail: espone anche sacco_kg/container_kg del prodotto, per i
-- bottoni formato del pannello "Aggiungi un quantitativo" della pagina asta.
-- DROP necessario: cambia la shape del RETURNS TABLE.
drop function if exists public.get_pool_detail(uuid);
create function public.get_pool_detail(p_pool uuid)
returns table(
  id uuid, status pool_status, pallet_kg integer, total_volume_kg numeric,
  best_price_per_kg numeric, final_price_per_kg numeric,
  closes_at timestamp with time zone, final_phase_ends_at timestamp with time zone,
  product_id uuid, product_name text, product_enum text,
  participants bigint, my_quantity_kg numeric,
  sacco_kg integer, container_kg integer
)
language sql
security definer
set search_path to 'public'
as $$
  select p.id, p.status, p.pallet_kg, p.total_volume_kg, p.best_price_per_kg, p.final_price_per_kg,
         p.closes_at, p.final_phase_ends_at,
         pr.id, pr.canonical_name, pr.e_number,
         (select count(*) from pool_participants pp where pp.pool_id = p.id) as participants,
         (select pp2.quantity_kg from pool_participants pp2 where pp2.pool_id = p.id and pp2.buyer_company_id = auth_company_id()) as my_quantity_kg,
         pr.sacco_kg, pr.container_kg
  from pools p
  join products pr on pr.id = p.product_id
  where p.id = p_pool;
$$;
