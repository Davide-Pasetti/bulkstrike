-- ============================================================
-- BulkStrike — Hardening emerso dall'audit del 07/07/2026
-- (già applicata sul progetto uufueekpxboygcotqvhu e registrata nello
-- storico remoto come 20260707064235; file solo per lo storico nel repo)
-- ============================================================

-- get_monthly_commissions: SECURITY DEFINER senza guard interno, esponeva
-- commissioni e fatturato spedizioni per corriere a chiunque (anon).
-- È chiamata solo dalla route admin con service role: revoca a tutti gli altri.
revoke execute on function public.get_monthly_commissions(integer, integer) from public, anon, authenticated;
grant execute on function public.get_monthly_commissions(integer, integer) to service_role;

-- Advisor "function_search_path_mutable": search_path fisso sulle 4 funzioni
-- segnalate (tutte referenziano solo oggetti di public).
alter function public.get_monthly_commissions(integer, integer) set search_path = public;
alter function public.get_available_payment_methods(uuid, uuid, numeric) set search_path = public;
alter function public.fn_apply_approved_terms() set search_path = public;
alter function public.set_updated_at() set search_path = public;
