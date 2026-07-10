-- Segreto condiviso per proteggere le edge function di ingest (chiamate dal cron).
-- Leggibile solo da service_role/postgres (RLS senza policy + revoke). Sia il cron
-- sia la function lo leggono da qui: il valore non è mai hardcoded né esposto.
create table if not exists public.app_secrets (
  key        text primary key,
  value      text not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

insert into public.app_secrets(key, value)
values ('ingest_cron_secret',
        replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''))
on conflict (key) do nothing;
