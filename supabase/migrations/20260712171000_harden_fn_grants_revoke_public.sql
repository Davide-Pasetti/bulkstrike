-- Correzione dell'hardening precedente: molte funzioni avevano EXECUTE
-- concesso a PUBLIC (default Postgres), quindi la revoca dal solo ruolo anon
-- era inefficace (has_function_privilege('anon',…) restava true via PUBLIC).
-- Qui: revoca da PUBLIC e riconcessione mirata.
-- Regola per le migration future: quando si (ri)crea una funzione che non
-- deve essere pubblica, nella stessa migration fare
--   revoke execute on function <fn> from public, anon;
--   grant execute on function <fn> to authenticated, service_role;  -- se serve
-- perché CREATE [OR REPLACE] FUNCTION riparte sempre da EXECUTE a PUBLIC.

-- D) funzioni riservate ai loggati (la UI le chiama solo da authenticated;
--    i gate interni NOT_ADMIN/ownership restano la difesa primaria).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'add_product_certificate','delete_product_certificate','set_product_documents','set_order_lot',
      'admin_count_pending_suppliers','admin_discard_suppliers','admin_list_order_emails','admin_list_pending_suppliers',
      'admin_list_products_pool_min','admin_resend_order_email','admin_set_product_formats','admin_set_product_pool_min',
      'admin_set_product_unit','admin_verify_suppliers',
      'get_available_payment_methods','get_my_pools','stamp_order_payment_methods'
    )
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- E) helper interni e trigger function: nessun ruolo client li invoca via
--    REST (girano nel contesto di trigger o dentro RPC SECURITY DEFINER
--    dell'owner; revocare EXECUTE non tocca i trigger).
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
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
