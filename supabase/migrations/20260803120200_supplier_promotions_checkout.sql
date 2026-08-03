-- DAV-76 — Bacheca Promozioni: integrazione nel carrello/checkout.
-- Una promozione "viaggia" sulla riga di carrello (cart_items.promotion_id): il
-- prezzo scontato scorre nel flusso di checkout esistente. Il comportamento per
-- le righe NON promozionali resta identico a prima.
-- sold_kg viene incrementato SOLO quando l'ordine diventa 'paid' (trigger).

-- ── Aggiunta di una promozione al carrello ───────────────────────────────────
create or replace function public.add_promotion_to_cart(p_promotion_id uuid, p_quantity numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid := auth_company_id();
  v_pr supplier_promotions%rowtype;
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;

  select * into v_pr from supplier_promotions where id = p_promotion_id for share;
  if v_pr.id is null then raise exception 'Promozione non trovata.'; end if;
  if v_pr.status <> 'active' or v_pr.ends_at <= now() then
    raise exception 'PROMOZIONE_NON_ATTIVA';
  end if;
  if v_pr.available_kg is not null and (v_pr.sold_kg + p_quantity) > v_pr.available_kg then
    raise exception 'Quantita'' in promozione non piu'' disponibile (restano % kg).',
      to_char(greatest(v_pr.available_kg - v_pr.sold_kg, 0), 'FM999999990.##');
  end if;

  insert into cart_items (company_id, product_id, supplier_company_id, quantity_kg, promotion_id)
  values (v_company, v_pr.product_id, v_pr.supplier_company_id, p_quantity, p_promotion_id)
  on conflict (company_id, product_id, supplier_company_id)
  do update set quantity_kg = excluded.quantity_kg,
                promotion_id = excluded.promotion_id,
                updated_at = now();
end;
$function$;

-- ── upsert_cart_item: acquisto NORMALE azzera l'eventuale promo sulla riga ────
create or replace function public.upsert_cart_item(p_product uuid, p_supplier uuid, p_quantity numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_company uuid := auth_company_id();
begin
  if v_company is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
  if not exists (select 1 from supplier_products sp where sp.product_id = p_product
                 and sp.supplier_company_id = p_supplier and sp.active) then
    raise exception 'NO_SUPPLIER_AVAILABLE';
  end if;
  insert into cart_items (company_id, product_id, supplier_company_id, quantity_kg, promotion_id)
  values (v_company, p_product, p_supplier, p_quantity, null)
  on conflict (company_id, product_id, supplier_company_id)
  do update set quantity_kg = excluded.quantity_kg, promotion_id = null, updated_at = now();
end;
$function$;

-- ── get_cart: prezzo scontato + flag promo sulle righe interessate ────────────
create or replace function public.get_cart()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_company uuid := auth_company_id();
begin
  if v_company is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'product_id', ci.product_id,
      'supplier_company_id', ci.supplier_company_id,
      'quantity_kg', ci.quantity_kg,
      'product_name', p.canonical_name,
      'e_number', p.e_number,
      'supplier_name', sc.legal_name,
      'supplier_country', sc.country,
      'min_order_kg', sp.min_order_kg,
      'lead_time_days', sp.lead_time_days,
      'unit_price', case
        when ci.promotion_id is not null then
          (select discounted_price_per_kg from supplier_promotions where id = ci.promotion_id)
        else (
          select pt.price_per_kg from price_tiers pt
          where pt.supplier_product_id = sp.id
            and pt.min_kg <= ci.quantity_kg
            and (pt.max_kg is null or ci.quantity_kg <= pt.max_kg)
          order by pt.price_per_kg asc limit 1
        ) end,
      'offer_active', coalesce(sp.active, false),
      'promotion_id', ci.promotion_id,
      'is_promotion', ci.promotion_id is not null
    ) order by ci.created_at)
    from cart_items ci
    join products p on p.id = ci.product_id
    join companies sc on sc.id = ci.supplier_company_id
    left join supplier_products sp on sp.product_id = ci.product_id
      and sp.supplier_company_id = ci.supplier_company_id
    where ci.company_id = v_company
  ), '[]'::jsonb);
end;
$function$;

-- ── preview_checkout: usa il prezzo promozionale quando presente ──────────────
create or replace function public.preview_checkout(p_shipping_address text DEFAULT NULL::text, p_carrier_selections jsonb DEFAULT '{}'::jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
DECLARE
  v_company uuid := auth_company_id();
  v_line record;
  v_price numeric;
  v_goods numeric;
  v_supplier_qty_total numeric;
  v_supplier_country text;
  v_carrier_id uuid;
  v_supplier_ship_total numeric;
  v_line_shipping numeric;
  v_vat numeric;
  v_is_hold boolean;
  v_lines jsonb := '[]'::jsonb;
  v_goods_total numeric := 0;
  v_shipping_total numeric := 0;
  v_vat_total numeric := 0;
  v_has_hold boolean := false;
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  FOR v_line IN SELECT * FROM cart_items WHERE company_id = v_company ORDER BY created_at LOOP
    IF v_line.promotion_id IS NOT NULL THEN
      SELECT discounted_price_per_kg INTO v_price FROM supplier_promotions
      WHERE id = v_line.promotion_id AND status = 'active' AND ends_at > now();
      IF v_price IS NULL THEN RAISE EXCEPTION 'PROMOZIONE_NON_ATTIVA'; END IF;
    ELSE
      SELECT pt.price_per_kg INTO v_price
      FROM price_tiers pt JOIN supplier_products sp ON sp.id = pt.supplier_product_id
      WHERE sp.supplier_company_id = v_line.supplier_company_id AND sp.product_id = v_line.product_id AND sp.active
        AND pt.min_kg <= v_line.quantity_kg AND (pt.max_kg IS NULL OR v_line.quantity_kg <= pt.max_kg)
      ORDER BY pt.price_per_kg ASC LIMIT 1;
      IF v_price IS NULL THEN RAISE EXCEPTION 'NO_SUPPLIER_AVAILABLE'; END IF;
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

    v_goods := round(v_line.quantity_kg * v_price, 2);
    IF v_is_hold THEN
      v_has_hold := true;
      v_line_shipping := 0;
      v_vat := round(v_goods * 0.22, 2);
    ELSE
      v_line_shipping := round(v_supplier_ship_total * (v_line.quantity_kg / v_supplier_qty_total), 2);
      v_vat := round((v_goods + v_line_shipping) * 0.22, 2);
    END IF;

    v_lines := v_lines || jsonb_build_object(
      'product_id', v_line.product_id, 'supplier_company_id', v_line.supplier_company_id,
      'goods_subtotal', v_goods, 'shipping_amount', v_line_shipping, 'vat_amount', v_vat, 'is_hold', v_is_hold,
      'is_promotion', v_line.promotion_id IS NOT NULL
    );
    v_goods_total := v_goods_total + v_goods;
    v_shipping_total := v_shipping_total + v_line_shipping;
    v_vat_total := v_vat_total + v_vat;
  END LOOP;

  RETURN jsonb_build_object(
    'lines', v_lines,
    'has_hold', v_has_hold,
    'by_supplier', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'supplier_company_id', g.supplier_company_id,
        'supplier_name', g.legal_name,
        'product_count', g.product_count,
        'total_qty', g.total_qty,
        'shipping_amount', COALESCE(_carrier_price_for(g.carrier_id, g.country, g.total_qty), 0),
        'is_hold', g.carrier_id IS NULL OR _carrier_price_for(g.carrier_id, g.country, g.total_qty) IS NULL
      ))
      FROM (
        SELECT ci.supplier_company_id, c.legal_name, c.country, COUNT(*) AS product_count, SUM(ci.quantity_kg) AS total_qty,
               NULLIF(p_carrier_selections->>(ci.supplier_company_id::text), '')::uuid AS carrier_id
        FROM cart_items ci JOIN companies c ON c.id = ci.supplier_company_id
        WHERE ci.company_id = v_company
        GROUP BY ci.supplier_company_id, c.legal_name, c.country
      ) g
    ), '[]'::jsonb),
    'goods_subtotal', round(v_goods_total, 2),
    'shipping_amount', round(v_shipping_total, 2),
    'vat_amount', round(v_vat_total, 2),
    'total', round(v_goods_total + v_shipping_total + v_vat_total, 2)
  );
END; $function$;

-- ── place_order: prezzo promozionale + validazione + orders.promotion_id ──────
create or replace function public.place_order(p_shipping_address text, p_shipping_notes text DEFAULT NULL::text, p_carrier_selections jsonb DEFAULT '{}'::jsonb, p_payment_methods jsonb DEFAULT '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  v_promo supplier_promotions%rowtype;
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_shipping_address IS NULL OR TRIM(p_shipping_address) = '' THEN RAISE EXCEPTION 'SHIPPING_ADDRESS_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cart_items WHERE company_id = v_company) THEN RAISE EXCEPTION 'CART_EMPTY'; END IF;

  SELECT legal_name INTO v_buyer_name FROM companies WHERE id = v_company;
  v_notes_line := CASE WHEN p_shipping_notes IS NOT NULL AND TRIM(p_shipping_notes) <> '' THEN ' Note del cliente: ' || TRIM(p_shipping_notes) || '.' ELSE '' END;

  FOR v_line IN SELECT * FROM cart_items WHERE company_id = v_company ORDER BY created_at LOOP
    -- Prezzo: promozione (se la riga la referenzia) oppure min tier applicabile.
    IF v_line.promotion_id IS NOT NULL THEN
      SELECT * INTO v_promo FROM supplier_promotions WHERE id = v_line.promotion_id FOR UPDATE;
      IF v_promo.id IS NULL OR v_promo.status <> 'active' OR v_promo.ends_at <= now() THEN
        RAISE EXCEPTION 'PROMOZIONE_NON_ATTIVA';
      END IF;
      IF v_promo.available_kg IS NOT NULL AND (v_promo.sold_kg + v_line.quantity_kg) > v_promo.available_kg THEN
        RAISE EXCEPTION 'Quantita'' in promozione non piu'' disponibile (restano % kg).',
          to_char(greatest(v_promo.available_kg - v_promo.sold_kg, 0), 'FM999999990.##');
      END IF;
      v_price := v_promo.discounted_price_per_kg;
    ELSE
      SELECT pt.price_per_kg INTO v_price
      FROM price_tiers pt JOIN supplier_products sp ON sp.id = pt.supplier_product_id
      WHERE sp.supplier_company_id = v_line.supplier_company_id AND sp.product_id = v_line.product_id AND sp.active
        AND pt.min_kg <= v_line.quantity_kg AND (pt.max_kg IS NULL OR v_line.quantity_kg <= pt.max_kg)
      ORDER BY pt.price_per_kg ASC LIMIT 1;
      IF v_price IS NULL THEN RAISE EXCEPTION 'NO_SUPPLIER_AVAILABLE'; END IF;
    END IF;
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
                        carrier_company_id, payment_method, terms_days, paid_at, release_scheduled_at, promotion_id)
    VALUES (v_company, v_line.supplier_company_id, v_line.product_id, 'instant', v_line.quantity_kg, v_price,
            v_goods, v_line_shipping, v_vat, v_status, TRIM(p_shipping_address), NULLIF(TRIM(p_shipping_notes), ''),
            CASE WHEN v_is_hold THEN NULL ELSE v_carrier_id END,
            v_method, CASE WHEN v_method = 'termini_dilazionati' THEN v_terms ELSE NULL END,
            NULL, v_release, v_line.promotion_id)
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
        v_payins := v_payins || v_order;
      ELSIF v_method = 'bonifico_anticipato' THEN
        PERFORM _queue_bonifico_email(v_order);
      END IF;
    END IF;

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

-- ── Trigger: incrementa sold_kg quando l'ordine promo diventa 'paid' ─────────
create or replace function public._promo_increment_sold_on_paid()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update supplier_promotions
     set sold_kg = sold_kg + new.quantity_kg, updated_at = now()
   where id = new.promotion_id;
  return new;
end;
$function$;

drop trigger if exists trg_promo_increment_sold on public.orders;
create trigger trg_promo_increment_sold
  after update of status on public.orders
  for each row
  when (new.promotion_id is not null and new.status = 'paid' and old.status is distinct from 'paid')
  execute function public._promo_increment_sold_on_paid();

-- ── Grant (riapplicati dopo ogni CREATE OR REPLACE) ──────────────────────────
-- I function nuovi ereditano il grant anon dai DEFAULT PRIVILEGES: revoco anon.
revoke execute on function public.add_promotion_to_cart(uuid,numeric) from public, anon;
grant  execute on function public.add_promotion_to_cart(uuid,numeric) to authenticated, service_role;

revoke execute on function public.upsert_cart_item(uuid,uuid,numeric) from public;
grant  execute on function public.upsert_cart_item(uuid,uuid,numeric) to authenticated, service_role;

revoke execute on function public.get_cart() from public;
grant  execute on function public.get_cart() to authenticated, service_role;

revoke execute on function public.preview_checkout(text,jsonb) from public, anon;
grant  execute on function public.preview_checkout(text,jsonb) to authenticated, service_role;

revoke execute on function public.place_order(text,text,jsonb,jsonb) from public, anon;
grant  execute on function public.place_order(text,text,jsonb,jsonb) to authenticated, service_role;

revoke execute on function public._promo_increment_sold_on_paid() from public;
