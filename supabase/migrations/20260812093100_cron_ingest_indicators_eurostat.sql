-- Ingest mensile del nuovo modello a indicatori Eurostat: giorno 12 alle 06:00 UTC
-- (lag Eurostat ~2 mesi; il giorno 12 il dato del mese m-2 e' consolidato e i
-- provvisori vengono revisionati con upsert). Stesso schema x-cron-secret delle
-- altre ingest function. La edge function ingest-market-indicators-eurostat va
-- deployata a parte (verify_jwt=false).
select cron.schedule(
  'ingest-market-indicators-eurostat',
  '0 6 12 * *',
  $$
  select net.http_post(
    url := 'https://uufueekpxboygcotqvhu.supabase.co/functions/v1/ingest-market-indicators-eurostat',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where key = 'ingest_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
