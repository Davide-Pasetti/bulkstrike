-- DAV-76 — Hotfix grant applicato in produzione: i function NUOVI ereditano dai
-- DEFAULT PRIVILEGES di Supabase il grant EXECUTE ad anon/authenticated, che il
-- semplice "revoke ... from public" NON rimuove. Qui revoco anon esplicitamente
-- (e authenticated per le funzioni di solo cron/service_role). get_active_promotions
-- resta eseguibile da anon (è la bacheca pubblica).
-- I file _rpcs/_checkout/_cron includono già questi revoke inline: qui è ridondante
-- ma tenuto per allineare la storia migrazioni con la produzione.

revoke execute on function public.get_promotion_base_price(uuid,int) from anon;
revoke execute on function public.create_supplier_promotion(uuid,uuid,numeric,timestamptz,timestamptz,numeric) from anon;
revoke execute on function public.approve_promotion(uuid) from anon;
revoke execute on function public.reject_promotion(uuid,text) from anon;
revoke execute on function public.get_my_promotions() from anon;
revoke execute on function public.admin_list_pending_promotions() from anon;
revoke execute on function public.add_promotion_to_cart(uuid,numeric) from anon;

revoke execute on function public.activate_scheduled_promotions() from anon, authenticated;
revoke execute on function public.expire_promotions() from anon, authenticated;
