-- MIMIT: ingest giornaliero alle 07:00 UTC (il file e' "prezzo alle 8" italiane).
-- Ogni giorno salva il punto del giorno e ricalcola la media settimanale headline.
-- Stesso schema x-cron-secret. Edge function deployata a parte (verify_jwt=false).
select cron.schedule(
  'ingest-market-indicators-mimit',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://uufueekpxboygcotqvhu.supabase.co/functions/v1/ingest-market-indicators-mimit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where key = 'ingest_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
