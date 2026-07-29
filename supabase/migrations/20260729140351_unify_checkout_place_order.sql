-- place_order: RPC unica di checkout che riceve indirizzo + corrieri + metodi di
-- pagamento e crea gli ordini DIRETTAMENTE nello stato finale corretto, senza il
-- doppio giro checkout_cart('paid' ottimistico) -> stamp_order_payment_methods
-- (downgrade). Elimina anche la falsa notifica "ordine pagato": alla creazione il
-- fornitore riceve una notifica NEUTRA; il push "pagamento confermato — spedisci"
-- per l'escrow arriva da record_payment_held quando i fondi sono davvero incassati.
-- Sostituirà checkout_cart + stamp_order_payment_methods, che restano per ora in
-- essere finché il frontend non passa a place_order.

CREATE OR REPLACE FUNCTION public.place_order(
  p_shipping_address   text,
  p_shipping_notes     text  DEFAULT NULL,
  p_carrier_selections jsonb DEFAULT '{}'::jsonb,
  p_payment_methods    jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid := auth_company_id();
  v_buyer_name text;
  v_line record;
  v_price numeric; v_goods numeric;
  v_supplier_qty_total numeric; v_supplier_country text;
  v_carrier_id uuid;
  v_supplier_ship_total numeric; v_line_shipping numeric; v_vat numeric;
  v_order uuid;
  v_orders uuid[] := '{}';
  v_held_orders uuid[] := '{}';
  v_payins uuid[] := '{}';
  v_name text; v_notes_line text;
  v_is_hold boolean;
  v_method text; v_terms int;
  v_status order_status; v_release timestamptz;
  v_total numeric := 0;
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_shipping_address IS NULL OR TRIM(p_shipping_address) = '' THEN RAISE EXCEPTION 'SHIPPING_ADDRESS_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cart_items WHERE company_id = v_company) THEN RAISE EXCEPTION 'CART_EMPTY'; END IF;

  SELECT legal_name INTO v_buyer_name FROM companies WHERE id = v_company;
  v_notes_line := CASE WHEN p_shipping_notes IS NOT NULL AND TRIM(p_shipping_notes) <> '' THEN ' Note del cliente: ' || TRIM(p_shipping_notes) || '.' ELSE '' END;

  FOR v_line IN SELECT * FROM cart_items WHERE company_id = v_company ORDER BY created_at LOOP
    -- prezzo (min tier applicabile), stesso criterio di checkout_cart
    SELECT pt.price_per_kg INTO v_price
    FROM price_tiers pt JOIN supplier_products sp ON sp.id = pt.supplier_product_id
    WHERE sp.supplier_company_id = v_line.supplier_company_id AND sp.product_id = v_line.product_id AND sp.active
      AND pt.min_kg <= v_line.quantity_kg AND (pt.max_kg IS NULL OR v_line.quantity_kg <= pt.max_kg)
    ORDER BY pt.price_per_kg ASC LIMIT 1;
    IF v_price IS NULL THEN RAISE EXCEPTION 'NO_SUPPLIER_AVAILABLE'; END IF;
    v_goods := round(v_line.quantity_kg * v_price, 2);

    -- metodo di pagamento del fornitore (obbligatorio, uno per fornitore)
    v_method := p_payment_methods->(v_line.supplier_company_id::text)->>'method';
    v_terms  := nullif(p_payment_methods->(v_line.supplier_company_id::text)->>'terms_days','')::int;
    IF v_method IS NULL THEN RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED'; END IF;
    IF v_method NOT IN ('escrow_sepa','escrow_premium','bonifico_anticipato','termini_dilazionati') THEN
      RAISE EXCEPTION 'INVALID_PAYMENT_METHOD';
    END IF;

    SELECT country INTO v_supplier_country FROM companies WHERE id = v_line.supplier_company_id;
    SELECT SUM(quantity_kg) INTO v_supplier_qty_total FROM cart_items WHERE company_id = v_company AND supplier_company_id = v_line.supplier_company_id;

    v_carrier_id := NULLIF(p_carrier_selections->>(v_line.supplier_company_id::text), '')::uuid;
    v_is_hold := v_carrier_id IS NULL;
    v_supplier_ship_total := NULL;
    IF NOT v_is_hold THEN
      v_supplier_ship_total := _carrier_price_for(v_carrier_id, v_supplier_country, v_supplier_qty_total);
      IF v_supplier_ship_total IS NULL THEN v_is_hold := true; END IF;
    END IF;

    IF v_is_hold THEN
      v_line_shipping := 0;
      v_vat := round(v_goods * 0.22, 2);
    ELSE
      v_line_shipping := round(v_supplier_ship_total * (v_line.quantity_kg / v_supplier_qty_total), 2);
      v_vat := round((v_goods + v_line_shipping) * 0.22, 2);
    END IF;

    -- stato finale corretto in base a corriere + metodo (niente 'paid' ottimistico)
    v_release := NULL;
    IF v_is_hold THEN
      v_status := 'awaiting_shipping_quote'::order_status;
      IF v_method IN ('escrow_sepa','escrow_premium') THEN v_release := now() + interval '7 days'; END IF;
    ELSIF v_method IN ('escrow_sepa','escrow_premium') THEN
      v_status := 'pending_payment'::order_status;
      v_release := now() + interval '7 days';
    ELSIF v_method = 'bonifico_anticipato' THEN
      v_status := 'awaiting_bank_transfer'::order_status;
    ELSE
      v_status := 'terms_pending'::order_status;
    END IF;

    INSERT INTO orders (buyer_company_id, supplier_company_id, product_id, mode, quantity_kg, unit_price_per_kg,
                        goods_subtotal, shipping_amount, vat_amount, status, shipping_address, shipping_notes,
                        carrier_company_id, payment_method, terms_days, paid_at, release_scheduled_at)
    VALUES (v_company, v_line.supplier_company_id, v_line.product_id, 'instant', v_line.quantity_kg, v_price,
            v_goods, v_line_shipping, v_vat, v_status, TRIM(p_shipping_address), NULLIF(TRIM(p_shipping_notes), ''),
            CASE WHEN v_is_hold THEN NULL ELSE v_carrier_id END,
            v_method, CASE WHEN v_method = 'termini_dilazionati' THEN v_terms ELSE NULL END,
            NULL, v_release)
    RETURNING id INTO v_order;
    v_total := v_total + v_goods + v_line_shipping + v_vat;

    IF v_is_hold THEN
      v_held_orders := v_held_orders || v_order;
      INSERT INTO logistics_requests (order_id, buyer_company_id, supplier_company_id, quantity_kg, shipping_address)
      VALUES (v_order, v_company, v_line.supplier_company_id, v_line.quantity_kg, TRIM(p_shipping_address));
      PERFORM _notify_logistics_gap(v_order);
    ELSE
      v_orders := v_orders || v_order;
      IF v_method IN ('escrow_sepa','escrow_premium') THEN
        v_payins := v_payins || v_order;                 -- necessita del pay-in Stripe
      ELSIF v_method = 'bonifico_anticipato' THEN
        PERFORM _queue_bonifico_email(v_order);
      END IF;
    END IF;

    -- Notifica NEUTRA al fornitore alla creazione (mai "pagato" prima dell'incasso).
    SELECT canonical_name INTO v_name FROM products WHERE id = v_line.product_id;
    INSERT INTO notifications (company_id, type, product_id, pool_id, title, body, action_label, action_url)
    VALUES (v_line.supplier_company_id, 'order_update', v_line.product_id, NULL,
      'Nuovo ordine ricevuto — ' || COALESCE(v_name, 'prodotto'),
      'Ordine da ' || COALESCE(v_buyer_name, 'un cliente BulkStrike') || ': ' || v_line.quantity_kg || ' kg di ' || COALESCE(v_name, '') ||
        ' (' || to_char(v_price, 'FM999999990.00') || ' €/kg). ' ||
        CASE
          WHEN v_is_hold THEN 'In attesa di quotazione della spedizione.'
          WHEN v_method IN ('escrow_sepa','escrow_premium') THEN 'In attesa del pagamento in garanzia: riceverai conferma quando spedire.'
          WHEN v_method = 'bonifico_anticipato' THEN 'Pagamento con bonifico anticipato: in attesa del bonifico del cliente.'
          ELSE 'Pagamento a termini dilazionati concordati.'
        END ||
        ' Spedire a: ' || TRIM(p_shipping_address) || '.' || v_notes_line,
      'Vedi ordine', '/ordine?id=' || v_order);
  END LOOP;

  DELETE FROM cart_items WHERE company_id = v_company;
  RETURN jsonb_build_object(
    'orders', to_jsonb(v_orders),
    'held_orders', to_jsonb(v_held_orders),
    'payins', to_jsonb(v_payins),
    'count', coalesce(array_length(v_orders,1),0),
    'total', round(v_total, 2)
  );
END; $function$;

REVOKE EXECUTE ON FUNCTION public.place_order(text,text,jsonb,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.place_order(text,text,jsonb,jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.place_order(text,text,jsonb,jsonb) TO authenticated;

-- record_payment_held: aggiunge la notifica "pagamento confermato — spedisci" al
-- fornitore, SOLO quando l'ordine passa davvero pending_payment -> paid (una volta
-- sola) e in blocco protetto: un errore nella notifica non deve MAI far fallire la
-- registrazione dell'incasso. Resta service_role-only (webhook).
CREATE OR REPLACE FUNCTION public.record_payment_held(p_order uuid, p_amount numeric, p_provider text, p_ref text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_id uuid; v_changed int; v_name text; v_buyer text; v_supplier uuid; v_product uuid;
begin
  insert into payments (order_id, amount, provider, provider_ref, status, held_at)
  values (p_order, p_amount, p_provider, p_ref, 'held', now())
  returning id into v_id;

  update orders set status = 'paid', updated_at = now()
  where id = p_order and status = 'pending_payment';
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  if v_changed > 0 then
    begin
      select o.supplier_company_id, o.product_id, p.canonical_name, bc.legal_name
        into v_supplier, v_product, v_name, v_buyer
      from orders o join products p on p.id = o.product_id
      join companies bc on bc.id = o.buyer_company_id
      where o.id = p_order;
      insert into notifications (company_id, type, product_id, pool_id, title, body, action_label, action_url)
      values (v_supplier, 'order_update', v_product, NULL,
        'Pagamento confermato — spedisci l''ordine',
        'Il pagamento in garanzia per l''ordine da ' || coalesce(v_buyer,'un cliente BulkStrike') ||
          ' (' || coalesce(v_name,'prodotto') || ') è stato incassato. Puoi procedere alla spedizione.',
        'Vedi ordine', '/ordine?id=' || p_order);
    exception when others then null; -- la notifica non deve mai bloccare l'incasso
    end;
  end if;
  return v_id;
end; $function$;

REVOKE EXECUTE ON FUNCTION public.record_payment_held(uuid,numeric,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_payment_held(uuid,numeric,text,text) TO service_role;
