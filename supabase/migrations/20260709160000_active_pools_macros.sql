-- get_active_pools espone anche i macro-slug (categorie) del prodotto, per il
-- filtro categoria della pagina "Aste attive" (stessa tassonomia del Catalogo:
-- product_sectors -> sectors -> macro_areas). Drop: cambia la shape del RETURNS.

drop function if exists public.get_active_pools();
create function public.get_active_pools()
returns table(id uuid, status pool_status, pallet_kg integer, total_volume_kg numeric,
  best_price_per_kg numeric, closes_at timestamptz, final_phase_ends_at timestamptz,
  product_id uuid, product_name text, product_enum text, participants bigint, num_bids bigint, macros jsonb)
language sql stable security definer set search_path to 'public'
as $$
  select p.id, p.status, p.pallet_kg, p.total_volume_kg, p.best_price_per_kg,
         p.closes_at, p.final_phase_ends_at,
         pr.id, pr.canonical_name, pr.e_number,
         (select count(*) from pool_participants pp where pp.pool_id = p.id) as participants,
         (select count(distinct b.supplier_company_id) from bids b where b.pool_id = p.id) as num_bids,
         (select coalesce(jsonb_agg(distinct m.slug) filter (where m.slug is not null), '[]'::jsonb)
            from product_sectors ps
            join sectors s on s.id = ps.sector_id
            left join macro_areas m on m.id = s.macro_area_id
            where ps.product_id = pr.id) as macros
  from pools p
  join products pr on pr.id = p.product_id
  where p.status in ('open','final_phase')
  order by p.closes_at asc;
$$;
