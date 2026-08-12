-- World Bank Pink Sheet: ingest mensile giorno 5 alle 06:30 UTC (il file mensile
-- viene aggiornato all'inizio del mese). Stesso schema x-cron-secret. La edge
-- function ingest-market-indicators-worldbank va deployata a parte (verify_jwt=false).
select cron.schedule(
  'ingest-market-indicators-worldbank',
  '0 6 5 * *',
  $$
  select net.http_post(
    url := 'https://uufueekpxboygcotqvhu.supabase.co/functions/v1/ingest-market-indicators-worldbank',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where key = 'ingest_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
