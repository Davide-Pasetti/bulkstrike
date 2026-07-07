-- Refinement: per 'termini_dilazionati' i giorni li prende dal server
-- (supplier_trusted_buyers), non dal client — così il frontend invia solo il
-- metodo per fornitore e i terms_days non sono manipolabili lato client.
CREATE OR REPLACE FUNCTION public.stamp_order_payment_methods(p_map jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_company uuid := auth_company_id();
  v_entry record; v_method text; v_terms int; v_order record; v_updated int := 0;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED'; end if;
  for v_entry in select key as supplier, value from jsonb_each(p_map) loop
    v_method := v_entry.value->>'method';
    if v_method not in ('escrow_sepa','escrow_premium','bonifico_anticipato','termini_dilazionati') then
      raise exception 'INVALID_PAYMENT_METHOD';
    end if;
    -- terms_days SEMPRE dalla whitelist (mai dal client)
    v_terms := null;
    if v_method = 'termini_dilazionati' then
      select terms_days into v_terms from supplier_trusted_buyers
        where supplier_id = v_entry.supplier::uuid and buyer_id = v_company and status = 'active';
      if v_terms is null then raise exception 'TERMS_NOT_AVAILABLE'; end if;
    end if;
    for v_order in
      select id, status from orders
      where buyer_company_id = v_company
        and supplier_company_id = v_entry.supplier::uuid
        and payment_method is null
      for update
    loop
      if v_method in ('escrow_sepa','escrow_premium') then
        update orders set payment_method = v_method,
               release_scheduled_at = coalesce(release_scheduled_at, now() + interval '7 days')
        where id = v_order.id;
      elsif v_method = 'bonifico_anticipato' then
        update orders set payment_method = v_method, paid_at = null,
               status = case when status = 'awaiting_shipping_quote' then status
                             else 'awaiting_bank_transfer'::order_status end
        where id = v_order.id;
        perform _queue_bonifico_email(v_order.id);
      else -- termini_dilazionati
        update orders set payment_method = v_method, terms_days = v_terms, paid_at = null,
               status = case when status = 'awaiting_shipping_quote' then status
                             else 'terms_pending'::order_status end
        where id = v_order.id;
      end if;
      v_updated := v_updated + 1;
    end loop;
  end loop;
  return jsonb_build_object('updated', v_updated);
end $function$;
