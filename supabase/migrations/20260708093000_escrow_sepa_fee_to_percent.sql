-- Le fee di elaborazione pagamento dipendono SOLO dal metodo (tariffa del gestore
-- Stripe), non dalla soglia €10.000: è la RPC get_available_payment_methods a
-- decidere QUALE metodo è offerto in base alla soglia. Chiavare i trigger sul solo
-- metodo elimina il caso-limite (escrow_sepa con lordo > €10.000 riceveva 0 fee).
-- SEPA Direct Debit = 0,8% + €0,35 (placeholder: nessun tetto — DA CONFERMARE Stripe).
-- Carta = 1,5% + €0,25. Base: total_amount (merce+spedizione+IVA).
-- Tenere ALLINEATO con STRIPE_FEES in lib/payments/paymentConfig.js.

CREATE OR REPLACE FUNCTION public.apply_escrow_service_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
declare
  v_rate numeric := 0.008;   -- 0,8% SEPA Direct Debit (Stripe)
  v_fixed numeric := 0.35;   -- componente fissa (placeholder: nessun tetto)
  v_service_name text := 'Costi di servizio escrow';
  v_fee numeric;
begin
  if new.payment_method = 'escrow_sepa' then
    v_fee := round(new.total_amount * v_rate + v_fixed, 2);
    if not exists (
      select 1 from public.order_service_charges
      where order_id = new.id and service_name = v_service_name
    ) then
      insert into public.order_service_charges (order_id, service_name, fee)
      values (new.id, v_service_name, v_fee);
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_escrow_premium_service_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
declare
  v_rate numeric := 0.015;   -- 1,5% carte standard SEE (Stripe)
  v_fixed numeric := 0.25;
  v_service_name text := 'Costi di servizio escrow premium';
  v_fee numeric;
begin
  if new.payment_method = 'escrow_premium' then
    v_fee := round(new.total_amount * v_rate + v_fixed, 2);
    if not exists (
      select 1 from public.order_service_charges
      where order_id = new.id and service_name = v_service_name
    ) then
      insert into public.order_service_charges (order_id, service_name, fee)
      values (new.id, v_service_name, v_fee);
    end if;
  end if;
  return new;
end;
$function$;

-- Riallinea le fee SEPA già registrate (demo) a 0,8% + €0,35 del lordo.
UPDATE public.order_service_charges osc
SET fee = round(o.total_amount * 0.008 + 0.35, 2)
FROM public.orders o
WHERE o.id = osc.order_id
  AND osc.service_name = 'Costi di servizio escrow'
  AND o.payment_method = 'escrow_sepa';
