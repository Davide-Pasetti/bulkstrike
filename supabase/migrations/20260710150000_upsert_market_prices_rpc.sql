-- Upsert batch idempotente per market_price_history. Incapsula l'ON CONFLICT
-- sull'indice unique a espressione (coalesce grade/piazza), che supabase-js non
-- può targettare direttamente. Chiamata dalle edge function di ingest (service_role).
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

revoke execute on function public.upsert_market_prices(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_market_prices(jsonb) to service_role;
