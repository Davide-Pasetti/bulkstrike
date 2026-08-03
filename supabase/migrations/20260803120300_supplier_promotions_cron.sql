-- DAV-76 — Bacheca Promozioni: transizioni di stato via pg_cron (ogni 15 min).
-- Job dedicato (non si appoggia al job di rilascio consegne) e definito qui in
-- migration, come i tick delle aste che chiamano direttamente le funzioni SQL.

create or replace function public.activate_scheduled_promotions()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n int;
begin
  update supplier_promotions
     set status = 'active', updated_at = now()
   where status = 'scheduled' and starts_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$function$;

create or replace function public.expire_promotions()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n int;
begin
  update supplier_promotions
     set status = 'expired', updated_at = now()
   where status = 'active'
     and (ends_at <= now()
          or (available_kg is not null and sold_kg >= available_kg));
  get diagnostics n = row_count;
  return n;
end;
$function$;

-- solo cron/service_role: revoco anche anon/authenticated (default privileges).
revoke execute on function public.activate_scheduled_promotions() from public, anon, authenticated;
grant  execute on function public.activate_scheduled_promotions() to service_role;
revoke execute on function public.expire_promotions() from public, anon, authenticated;
grant  execute on function public.expire_promotions() to service_role;

-- Job */15: cron.schedule con lo stesso nome fa upsert (idempotente).
select cron.schedule(
  'bs_promotions_transitions',
  '*/15 * * * *',
  $$ select public.activate_scheduled_promotions(); select public.expire_promotions(); $$
);
