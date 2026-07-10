-- upsert_market_prices scarta le righe senza un prezzo POSITIVO (es. grano duro
-- "non quotato" = 0 nel listino CUN, che distorcerebbe il grafico). Vale per tutte
-- le fonti. Ripulisce anche eventuali righe 0 già presenti.
create or replace function public.upsert_market_prices(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count int := 0;
begin
  insert into market_price_history
    (product_id, grade, price_min, price_max, price_avg, currency, unit,
     rilevazione_date, piazza, fonte, fonte_url, raw_label)
  select
    (r->>'product_id')::uuid,
    nullif(r->>'grade',''),
    nullif(r->>'price_min','')::numeric,
    nullif(r->>'price_max','')::numeric,
    nullif(r->>'price_avg','')::numeric,
    coalesce(nullif(r->>'currency',''),'EUR'),
    coalesce(nullif(r->>'unit',''),'kg'),
    (r->>'rilevazione_date')::date,
    nullif(r->>'piazza',''),
    r->>'fonte',
    nullif(r->>'fonte_url',''),
    nullif(r->>'raw_label','')
  from jsonb_array_elements(p_rows) as r
  where (r->>'product_id') is not null
    and (r->>'rilevazione_date') is not null
    and (r->>'fonte') is not null
    and (coalesce(nullif(r->>'price_min','')::numeric,0) > 0
      or coalesce(nullif(r->>'price_max','')::numeric,0) > 0)
  on conflict (product_id, coalesce(grade,''), coalesce(piazza,''), rilevazione_date, fonte)
  do update set
    price_min = excluded.price_min,
    price_max = excluded.price_max,
    price_avg = excluded.price_avg,
    fonte_url = excluded.fonte_url,
    raw_label = excluded.raw_label,
    created_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

delete from market_price_history
where coalesce(price_min,0) <= 0 and coalesce(price_max,0) <= 0;
