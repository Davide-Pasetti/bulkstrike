-- Hardening permessi dopo la regressione su suppliers_public (12/7/2026).
-- Contesto: i default di Supabase concedono CRUD completo ad anon/authenticated
-- su ogni tabella creata; la protezione reale è demandata a RLS. Tutte le
-- tabelle hanno RLS attivo (verificato), quindi questi grant erano inerti via
-- REST, ma restano una violazione di difesa in profondità e si ripresentano a
-- ogni CREATE. Regola per le migration future: dopo aver (ri)creato un
-- oggetto, riapplicare SEMPRE i permessi voluti nella stessa migration.

-- A) anon non scrive MAI direttamente: revoca su tutte le tabelle esistenti.
--    (Le scritture client passano da authenticated+RLS o da RPC SECURITY DEFINER.)
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;

-- B) pools: le scritture avvengono SOLO via engine server-side (open_pool,
--    join_pool, place_bid, tick_*): RLS non ha alcuna policy di scrittura.
--    Revoca anche per authenticated (il SELECT resta per-colonna: le colonne
--    opened_by_company_id/winner_supplier_company_id non sono leggibili).
revoke insert, update, delete, truncate, references, trigger on table public.pools from authenticated;

-- C) le tabelle create dalle migration future non nascano di nuovo scrivibili
--    da anon (default privileges del ruolo postgres, che esegue le migration).
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon;

-- D) funzioni SECURITY DEFINER che non hanno motivo di essere eseguibili da
--    anon (hanno gate interni, ma la difesa in profondità li precede):
--    admin_*, helper/trigger interni, funzioni di checkout/ordini/IBAN.
--    Restano pubbliche quelle del browse anonimo: get_catalog, get_taxonomy,
--    get_active_pools, get_pool_*, get_open_pool_for_product,
--    get_market_price_series, get_products_with_market_prices,
--    search_products_suggest, register_company (signup).
-- NB: questa revoca dal solo ruolo anon si è rivelata INSUFFICIENTE per le
-- funzioni con EXECUTE ancora concesso a PUBLIC (default Postgres): la
-- migration successiva (harden_fn_grants_revoke_public) revoca da PUBLIC e
-- riconcede in modo mirato. Tenuta qui per fedeltà allo storico applicato.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      '_can_manage_product_docs','_queue_bonifico_email','_queue_delivery_email','_queue_order_qr_email',
      'add_product_certificate','delete_product_certificate','set_product_documents','set_order_lot',
      'admin_count_pending_suppliers','admin_discard_suppliers','admin_list_order_emails','admin_list_pending_suppliers',
      'admin_list_products_pool_min','admin_resend_order_email','admin_set_product_formats','admin_set_product_pool_min',
      'admin_set_product_unit','admin_verify_suppliers',
      'apply_escrow_premium_service_fee','apply_escrow_service_fee','fn_apply_approved_terms',
      'trg_order_created_qr_email','trg_order_delivered_email',
      'get_available_payment_methods','get_my_pools','get_supplier_iban_for_order','stamp_order_payment_methods'
    )
  loop
    execute format('revoke execute on function %s from anon', f.sig);
  end loop;
end $$;

-- E) helper interni e trigger function: nemmeno authenticated deve poterli
--    invocare direttamente via REST (girano nel contesto di trigger o dentro
--    RPC SECURITY DEFINER dell'owner; revocare EXECUTE non tocca i trigger).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      '_can_manage_product_docs','_queue_bonifico_email','_queue_delivery_email','_queue_order_qr_email',
      'apply_escrow_premium_service_fee','apply_escrow_service_fee','fn_apply_approved_terms',
      'trg_order_created_qr_email','trg_order_delivered_email'
    )
  loop
    execute format('revoke execute on function %s from authenticated', f.sig);
  end loop;
end $$;
