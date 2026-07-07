-- Compositore email conferma ordine bonifico (SENZA dati bancari). Interno.
CREATE OR REPLACE FUNCTION public._queue_bonifico_email(p_order uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare o record; v_supplier text; v_product text; v_total numeric; v_ref text;
begin
  select ord.*, c.legal_name as buyer_name into o
  from orders ord join companies c on c.id = ord.buyer_company_id
  where ord.id = p_order;
  if not found then return; end if;
  select legal_name into v_supplier from companies where id = o.supplier_company_id;
  select canonical_name into v_product from products where id = o.product_id;
  v_total := coalesce(o.goods_subtotal,0) + coalesce(o.shipping_amount,0) + coalesce(o.vat_amount,0);
  v_ref := upper(left(p_order::text, 8));
  insert into emails_outbox (kind, to_company_id, order_id, subject, body_html, body_text)
  values (
    'bonifico_order_confirmation', o.buyer_company_id, p_order,
    'Conferma ordine ' || v_ref || ' — pagamento con bonifico',
    '<p>Ciao ' || coalesce(o.buyer_name,'') || ',</p>'
      || '<p>Abbiamo registrato il tuo ordine <b>' || v_ref || '</b> con pagamento tramite <b>bonifico bancario anticipato</b>.</p>'
      || '<ul><li>Prodotto: ' || coalesce(v_product,'—') || '</li>'
      || '<li>Fornitore: ' || coalesce(v_supplier,'—') || '</li>'
      || '<li>Quantità: ' || o.quantity_kg || ' kg</li>'
      || '<li>Importo totale (IVA inclusa): ' || to_char(v_total,'FM999999990.00') || ' €</li>'
      || '<li>Stato: in attesa di bonifico</li></ul>'
      || '<p><b>I dati per il bonifico (IBAN del fornitore) sono disponibili solo nella tua area riservata</b>, alla pagina dell''ordine, sezione Pagamento. Per la tua sicurezza non li inviamo mai via email.</p>'
      || '<p><a href="/ordine?id=' || p_order || '">Apri l''ordine e visualizza i dati di pagamento</a></p>',
    'Ciao ' || coalesce(o.buyer_name,'') || ', ordine ' || v_ref
      || ' registrato con pagamento tramite bonifico bancario anticipato.'
      || ' Prodotto: ' || coalesce(v_product,'—') || '; Fornitore: ' || coalesce(v_supplier,'—')
      || '; Quantità: ' || o.quantity_kg || ' kg; Importo totale (IVA inclusa): ' || to_char(v_total,'FM999999990.00') || ' €;'
      || ' Stato: in attesa di bonifico.'
      || ' I dati per il bonifico (IBAN) sono disponibili SOLO nella tua area riservata alla pagina dell''ordine, sezione Pagamento.'
      || ' Apri: /ordine?id=' || p_order
  );
end $function$;
REVOKE ALL ON FUNCTION public._queue_bonifico_email(uuid) FROM public;

-- Stamping: applica il metodo di pagamento scelto per fornitore agli ordini
-- appena creati (payment_method IS NULL) del buyer corrente.
CREATE OR REPLACE FUNCTION public.stamp_order_payment_methods(p_map jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
        -- escrow: fondi trattenuti (demo: resta 'paid'); pianifica il rilascio.
        update orders set payment_method = v_method,
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

-- Rivela l'IBAN del fornitore SOLO al buyer dell'ordine e SOLO se il metodo è
-- bonifico anticipato. Gated: rispetta il pattern "IBAN mai nei profili pubblici".
CREATE OR REPLACE FUNCTION public.get_supplier_iban_for_order(p_order uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_company uuid := auth_company_id(); o record; s record;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select buyer_company_id, supplier_company_id, payment_method,
         coalesce(goods_subtotal,0)+coalesce(shipping_amount,0)+coalesce(vat_amount,0) as total
    into o from orders where id = p_order;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.buyer_company_id <> v_company then raise exception 'NOT_YOUR_ORDER'; end if;
  if o.payment_method is distinct from 'bonifico_anticipato' then raise exception 'NOT_BANK_TRANSFER_ORDER'; end if;
  select iban, iban_holder, bic into s from companies where id = o.supplier_company_id;
  return jsonb_build_object('iban', s.iban, 'iban_holder', s.iban_holder, 'bic', s.bic, 'amount', o.total);
end $function$;

REVOKE ALL ON FUNCTION public.stamp_order_payment_methods(jsonb) FROM public;
REVOKE ALL ON FUNCTION public.get_supplier_iban_for_order(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.stamp_order_payment_methods(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_iban_for_order(uuid) TO authenticated;
