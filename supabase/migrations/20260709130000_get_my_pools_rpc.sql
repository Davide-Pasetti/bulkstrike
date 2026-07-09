-- Elenco REALE delle aste a ribasso dell'azienda loggata, per la sezione
-- "Aste personali" del profilo (prima mostrava dati demo hardcoded).
-- Include le aste in cui l'azienda:
--   - partecipa come compratore (pool_participants)  -> my_quantity_kg
--   - ha fatto offerte come fornitore (bids)          -> my_bid_price
-- e i contatori per la card (aziende aggregate, fornitori in gara).
-- SECURITY DEFINER + auth_company_id(): se non loggato o senza company,
-- auth_company_id() e' null e non restituisce righe.

create or replace function public.get_my_pools()
returns table(
  pool_id uuid,
  product_name text,
  status pool_status,
  total_volume_kg numeric,
  best_price_per_kg numeric,
  closes_at timestamptz,
  final_phase_ends_at timestamptz,
  my_quantity_kg numeric,
  my_bid_price numeric,
  participants bigint,
  suppliers bigint
)
language sql
security definer
set search_path to 'public'
as $$
  select p.id, pr.canonical_name, p.status,
         p.total_volume_kg, p.best_price_per_kg,
         p.closes_at, p.final_phase_ends_at,
         (select pp.quantity_kg from pool_participants pp
            where pp.pool_id = p.id and pp.buyer_company_id = auth_company_id()) as my_quantity_kg,
         (select min(b.price_per_kg) from bids b
            where b.pool_id = p.id and b.supplier_company_id = auth_company_id()) as my_bid_price,
         (select count(*) from pool_participants x where x.pool_id = p.id) as participants,
         (select count(distinct b2.supplier_company_id) from bids b2 where b2.pool_id = p.id) as suppliers
  from pools p
  join products pr on pr.id = p.product_id
  where exists (select 1 from pool_participants pp2 where pp2.pool_id = p.id and pp2.buyer_company_id = auth_company_id())
     or exists (select 1 from bids b3 where b3.pool_id = p.id and b3.supplier_company_id = auth_company_id())
  order by p.closes_at nulls last;
$$;
