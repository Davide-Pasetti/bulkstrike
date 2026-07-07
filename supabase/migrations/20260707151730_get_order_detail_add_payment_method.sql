-- Espone payment_method e terms_days nel dettaglio ordine (per il buyer/supplier
-- dell'ordine). NON espone alcun dato bancario: l'IBAN resta solo in
-- get_supplier_iban_for_order (gated, non tra i tool dell'AI).
CREATE OR REPLACE FUNCTION public.get_order_detail(p_order uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_company uuid := auth_company_id();
BEGIN
  IF v_company IS NULL THEN RETURN NULL; END IF;
  RETURN (
    SELECT jsonb_build_object(
      'id', o.id, 'role', CASE WHEN o.buyer_company_id = v_company THEN 'buyer' ELSE 'supplier' END,
      'buyer_name', bc.legal_name, 'supplier_id', o.supplier_company_id, 'supplier_name', sc.legal_name, 'supplier_country', sc.country,
      'product_id', o.product_id, 'product_name', p.canonical_name, 'e_number', p.e_number, 'cas_number', p.cas_number,
      'mode', o.mode, 'quantity_kg', o.quantity_kg, 'unit_price_per_kg', o.unit_price_per_kg,
      'goods_subtotal', o.goods_subtotal, 'shipping_amount', o.shipping_amount, 'vat_amount', o.vat_amount,
      'total_amount', o.total_amount, 'commission_amount', o.commission_amount, 'status', o.status,
      'payment_method', o.payment_method, 'terms_days', o.terms_days,
      'created_at', o.created_at, 'updated_at', o.updated_at, 'paid_at', o.paid_at, 'shipped_at', o.shipped_at,
      'shipping_address', o.shipping_address, 'shipping_notes', o.shipping_notes,
      'dispute_reason', o.dispute_reason, 'disputed_at', o.disputed_at,
      'auto_release_at', CASE WHEN o.shipped_at IS NOT NULL THEN o.shipped_at + interval '7 days' ELSE NULL END,
      'reviewed', EXISTS (SELECT 1 FROM reviews r WHERE r.order_id = o.id)
    )
    FROM orders o JOIN products p ON p.id = o.product_id
    JOIN companies sc ON sc.id = o.supplier_company_id JOIN companies bc ON bc.id = o.buyer_company_id
    WHERE o.id = p_order AND (o.buyer_company_id = v_company OR o.supplier_company_id = v_company)
  );
END; $function$;
