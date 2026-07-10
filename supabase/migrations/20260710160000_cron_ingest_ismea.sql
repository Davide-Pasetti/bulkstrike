-- Cron settimanale ISMEA: giovedì 19:00 UTC (21:00 Roma), dopo i mercati del giovedì.
-- Invoca l'edge function via net.http_post passando il segreto condiviso da app_secrets.
-- NB: URL specifico del progetto (ref uufueekpxboygcotqvhu). Idempotente per jobname.
select cron.schedule(
  'ingest-market-prices-ismea',
  '0 19 * * 4',
  $$
  select net.http_post(
    url := 'https://uufueekpxboygcotqvhu.supabase.co/functions/v1/ingest-market-prices-ismea',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where key = 'ingest_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
