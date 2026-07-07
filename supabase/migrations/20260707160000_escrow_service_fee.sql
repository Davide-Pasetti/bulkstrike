-- Trigger: applica "Costi di servizio escrow" su ordini escrow_sepa <= 10.000€
create or replace function public.apply_escrow_service_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee numeric := 0.35;
  v_service_name text := 'Costi di servizio escrow';
  v_threshold numeric := 10000;
begin
  if new.payment_method = 'escrow_sepa' and new.total_amount <= v_threshold then
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

drop trigger if exists trg_apply_escrow_service_fee on public.orders;

create trigger trg_apply_escrow_service_fee
after insert or update of payment_method, total_amount
on public.orders
for each row
execute function public.apply_escrow_service_fee();

-- Funzione: totale reale da mostrare/incassare (total_amount + eventuali service charges)
create or replace function public.get_order_grand_total(p_order_id uuid)
returns numeric
language sql
stable
as $$
  select o.total_amount + coalesce(sum(osc.fee), 0)
  from public.orders o
  left join public.order_service_charges osc on osc.order_id = o.id
  where o.id = p_order_id
  group by o.id, o.total_amount;
$$;
