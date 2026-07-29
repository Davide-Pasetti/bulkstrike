-- Rimozione delle due RPC di checkout sostituite da place_order: il frontend non
-- le usa più (checkout one-page), nessuna funzione DB le referenzia (solo commenti).
DROP FUNCTION IF EXISTS public.checkout_cart(text, text, jsonb);
DROP FUNCTION IF EXISTS public.stamp_order_payment_methods(jsonb);
