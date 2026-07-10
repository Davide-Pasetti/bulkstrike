-- RPC per il grafico "Andamento prezzi" (Home + pagina prodotto).

-- Prodotti che hanno uno storico prezzi di mercato (per i tab del grafico).
create or replace function public.get_products_with_market_prices()
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.canonical_name, 'fonte', x.fonte
  ) order by p.canonical_name), '[]'::jsonb)
  from (select product_id, max(fonte) as fonte from market_price_history group by product_id) x
  join products p on p.id = x.product_id;
$$;

-- Serie storica "andamento medio" per un prodotto: per ogni data di rilevazione,
-- la media dei prezzi su tutte le piazze/gradi. Include fonte, link e data più
-- recente per la citazione obbligatoria.
create or replace function public.get_market_price_series(p_product_id uuid)
returns jsonb
language sql stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'fonte', (select fonte from market_price_history where product_id = p_product_id order by rilevazione_date desc, created_at desc limit 1),
    'fonte_url', (select fonte_url from market_price_history where product_id = p_product_id order by rilevazione_date desc, created_at desc limit 1),
    'last_date', (select max(rilevazione_date) from market_price_history where product_id = p_product_id),
    'unit', 'kg',
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('t', d::text, 'v', round(v, 3)) order by d)
      from (
        select rilevazione_date as d,
               avg(coalesce(price_avg, (coalesce(price_min, price_max) + coalesce(price_max, price_min)) / 2.0)) as v
        from market_price_history
        where product_id = p_product_id and (coalesce(price_min,0) > 0 or coalesce(price_max,0) > 0)
        group by rilevazione_date
      ) s
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.get_products_with_market_prices() to anon, authenticated;
grant execute on function public.get_market_price_series(uuid) to anon, authenticated;
