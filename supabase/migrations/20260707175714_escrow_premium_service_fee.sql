-- Trigger: applica "Costi di servizio escrow premium" su ordini escrow_premium > 10.000€
-- (pagamento con carta). Stripe non ha un fisso come per la SEPA: 1,5% + €0,25 per
-- carte standard SEE (1,9% + €0,25 per le premium). Non conoscendo in anticipo il tipo
-- di carta del buyer si usa la tariffa carte standard SEE come stima; da rivedere
-- quando si conoscerà la distribuzione reale standard/premium dei buyer.
create or replace function public.apply_escrow_premium_service_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate numeric := 0.015;  -- 1,5% carte standard SEE (Stripe)
  v_fixed numeric := 0.25;
  v_service_name text := 'Costi di servizio escrow premium';
  v_threshold numeric := 10000;
  v_fee numeric;
begin
  if new.payment_method = 'escrow_premium' and new.total_amount > v_threshold then
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
$$;

drop trigger if exists trg_apply_escrow_premium_service_fee on public.orders;

create trigger trg_apply_escrow_premium_service_fee
after insert or update of payment_method, total_amount
on public.orders
for each row
execute function public.apply_escrow_premium_service_fee();

-- Nessuna modifica a get_order_grand_total: somma già tutte le righe di
-- order_service_charges indipendentemente dal service_name.
