-- Collegamento Stripe, fase 1 (lato DB):
-- 1) companies.stripe_customer_id: il customer Stripe del buyer (per pay-in
--    on-session e per il futuro SetupIntent/off_session dell'asta).
-- 2) set_my_stripe_customer: scrive il customer della PROPRIA azienda, una
--    sola volta (idempotente sullo stesso valore) — chiamata dagli endpoint
--    server dopo stripe.customers.create, senza service role.
-- 3) stamp_order_payment_methods: il ramo escrow ora mette l'ordine in
--    pending_payment (prima restava nello stato demo "già pagato"): 'paid'
--    arriva SOLO dal webhook payment_intent.succeeded.
alter table public.companies add column if not exists stripe_customer_id text;

create or replace function public.set_my_stripe_customer(p_customer text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_company uuid := auth_company_id();
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_customer is null or p_customer !~ '^cus_[A-Za-z0-9]+$' then raise exception 'INVALID_CUSTOMER'; end if;
  update companies set stripe_customer_id = p_customer
  where id = v_company and (stripe_customer_id is null or stripe_customer_id = p_customer);
  if not found then raise exception 'CUSTOMER_ALREADY_SET'; end if;
end $$;

-- permessi espliciti nella stessa migration (CREATE FUNCTION riparte da
-- EXECUTE a PUBLIC): mai eseguibile da anon.
revoke all on function public.set_my_stripe_customer(text) from public, anon;
grant execute on function public.set_my_stripe_customer(text) to authenticated, service_role;

create or replace function public.stamp_order_payment_methods(p_map jsonb)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_company uuid := auth_company_id();
  v_entry record; v_method text; v_terms int; v_order record; v_updated int := 0;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED'; end if;
  -- p_map: { "<supplier_company_id>": { "method": "...", "terms_days": <int|null> }, ... }
  for v_entry in select key as supplier, value from jsonb_each(p_map) loop
    v_method := v_entry.value->>'method';
    v_terms := nullif(v_entry.value->>'terms_days','')::int;
    if v_method not in ('escrow_sepa','escrow_premium','bonifico_anticipato','termini_dilazionati') then
      raise exception 'INVALID_PAYMENT_METHOD';
    end if;
    for v_order in
      select id, status from orders
      where buyer_company_id = v_company
        and supplier_company_id = v_entry.supplier::uuid
        and payment_method is null
      for update
    loop
      if v_method in ('escrow_sepa','escrow_premium') then
        -- escrow: l'ordine resta in attesa del pay-in Stripe ('paid' arriva
        -- solo dal webhook payment_intent.succeeded); pianifica il rilascio.
        update orders set payment_method = v_method, paid_at = null,
               status = case when status = 'awaiting_shipping_quote' then status
                             else 'pending_payment'::order_status end,
               release_scheduled_at = coalesce(release_scheduled_at, now() + interval '7 days')
        where id = v_order.id;
      elsif v_method = 'bonifico_anticipato' then
        -- il buyer paga il fornitore: non è pagato da BulkStrike. Se l'ordine è
        -- già in attesa di corriere lo status logistico ha priorità.
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

revoke all on function public.stamp_order_payment_methods(jsonb) from public, anon;
grant execute on function public.stamp_order_payment_methods(jsonb) to authenticated, service_role;
