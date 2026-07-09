-- get_pool_detail: per la pagina di un'asta CONCLUSA aggiunge
--   - winner_name: ragione sociale del fornitore vincitore (bid status 'winning'),
--     rivelata SOLO quando il pool e' 'closed' (identita' svelata alla chiusura);
--     null per aste ancora aperte/annullate.
--   - my_order_id: l'ordine generato per l'azienda loggata da questo pool (se esiste),
--     per linkare al riepilogo ordine (/ordine?id=...).
-- Drop necessario: cambia la shape del RETURNS TABLE.

drop function if exists public.get_pool_detail(uuid);
create function public.get_pool_detail(p_pool uuid)
returns table(
  id uuid, status pool_status, pallet_kg integer, total_volume_kg numeric,
  best_price_per_kg numeric, final_price_per_kg numeric,
  closes_at timestamptz, final_phase_ends_at timestamptz,
  product_id uuid, product_name text, product_enum text,
  participants bigint, my_quantity_kg numeric, sacco_kg integer, container_kg integer,
  winner_name text, my_order_id uuid
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
         pr.sacco_kg, pr.container_kg,
         (select c.legal_name from bids b join companies c on c.id = b.supplier_company_id
            where b.pool_id = p.id and b.status = 'winning' and p.status = 'closed' limit 1) as winner_name,
         (select o.id from orders o where o.pool_id = p.id and o.buyer_company_id = auth_company_id() limit 1) as my_order_id
  from pools p
  join products pr on pr.id = p.product_id
  where p.id = p_pool;
$$;
