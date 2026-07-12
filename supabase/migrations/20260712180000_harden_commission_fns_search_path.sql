-- Advisor WARN function_search_path_mutable sulle tre funzioni del flusso
-- commissioni. Solo ALTER ... SET search_path (nessuna riscrittura dei corpi,
-- che restano quelli applicati a mano in prod il 7/7/2026): blocca la
-- risoluzione degli identificatori allo schema public contro search_path
-- injection. I riferimenti non qualificati nei corpi (orders,
-- commission_ledger) sono tutti oggetti di public: la risoluzione non cambia.
-- Verificato con test in rollback prima e dopo l'ALTER: stessi importi
-- (traditional 490.00 -> 24.50 accrued; escrow 1235.00 -> 61.75 settled;
-- get_order_grand_total invariata sugli ordini campione).
alter function public.fn_accrue_commission_traditional() set search_path = public;
alter function public.fn_accrue_commission_escrow()      set search_path = public;
alter function public.get_order_grand_total(uuid)        set search_path = public;
