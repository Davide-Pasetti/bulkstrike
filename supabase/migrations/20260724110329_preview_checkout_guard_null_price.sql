-- preview_checkout mostrava un'anteprima anche quando il prezzo del fornitore
-- mancava: la riga aveva goods NULL e contribuiva 0 al totale (COALESCE), quindi
-- il totale d'anteprima era sotto il reale. checkout_cart alza gia'
-- NO_SUPPLIER_AVAILABLE in questo caso; qui si allinea, cosi' il client gestisce
-- l'errore con la stessa mappatura (POOL_ERRORS.NO_SUPPLIER_AVAILABLE).
-- Il client blocca gia' queste righe a monte (hasUnpricedLines); questa e' la
-- rete server-side, coerente con l'altro percorso.
CREATE OR REPLACE FUNCTION public.preview_checkout(p_shipping_address text DEFAULT NULL::text, p_carrier_selections jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT pt.price_per_kg INTO v_price
    FROM price_tiers pt JOIN supplier_products sp ON sp.id = pt.supplier_product_id
    WHERE sp.supplier_company_id = v_line.supplier_company_id AND sp.product_id = v_line.product_id AND sp.active
      AND pt.min_kg <= v_line.quantity_kg AND (pt.max_kg IS NULL OR v_line.quantity_kg <= pt.max_kg)
    ORDER BY pt.price_per_kg ASC LIMIT 1;

    -- Prezzo mancante: nessuna anteprima con un totale falsato. Stesso codice
    -- errore di checkout_cart, cosi' il client lo gestisce allo stesso modo.
    IF v_price IS NULL THEN RAISE EXCEPTION 'NO_SUPPLIER_AVAILABLE'; END IF;

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
      'goods_subtotal', v_goods, 'shipping_amount', v_line_shipping, 'vat_amount', v_vat, 'is_hold', v_is_hold
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

-- CREATE OR REPLACE azzera i grant ai default: riapplicare (revoke da PUBLIC).
REVOKE ALL ON FUNCTION public.preview_checkout(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.preview_checkout(text, jsonb) TO authenticated, service_role;
