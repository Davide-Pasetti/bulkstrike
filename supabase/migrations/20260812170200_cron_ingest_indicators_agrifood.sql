-- DG-AGRI: ingest settimanale, martedì 06:00 UTC (lag 3-14 giorni). Passa solo
-- l'anno corrente (upsert delle settimane recenti + revisioni); lo storico e' gia'
-- stato caricato col backfill. Stesso schema x-cron-secret. La edge function
-- ingest-market-indicators-agrifood va deployata a parte (verify_jwt=false).
select cron.schedule(
  'ingest-market-indicators-agrifood',
  '0 6 * * 2',
  $$
  select net.http_post(
    url := 'https://uufueekpxboygcotqvhu.supabase.co/functions/v1/ingest-market-indicators-agrifood',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where key = 'ingest_cron_secret')
    ),
    body := jsonb_build_object('fromYear', extract(year from now())::int, 'toYear', extract(year from now())::int),
    timeout_milliseconds := 200000
  );
  $$
);
