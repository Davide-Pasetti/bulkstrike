-- Cron settimanale CUN Grano Duro: lunedì 18:00 UTC (20:00 Roma), dopo la riunione
-- CUN delle 18:30 Roma. Invoca l'edge function via net.http_post col segreto condiviso.
-- NB: URL specifico del progetto (ref uufueekpxboygcotqvhu). Idempotente per jobname.
select cron.schedule(
  'ingest-market-prices-cun',
  '0 18 * * 1',
  $$
  select net.http_post(
    url := 'https://uufueekpxboygcotqvhu.supabase.co/functions/v1/ingest-market-prices-cun',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where key = 'ingest_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
