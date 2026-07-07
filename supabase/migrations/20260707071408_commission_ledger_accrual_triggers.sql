-- ============================================================
-- BulkStrike — Trigger di accrual per commission_ledger
-- Destinazione: supabase/migrations/20260707071408_commission_ledger_accrual_triggers.sql
-- (già applicata sul progetto uufueekpxboygcotqvhu il 07/07/2026 e registrata
-- nello storico remoto come 20260707071408 commission_ledger_accrual_triggers;
-- questo file è solo per lo storico/versionamento nel repo — NON rieseguire)
--
-- Risolve: commission_ledger non veniva mai popolata da nulla — né
-- trigger né codice applicativo scrivevano righe, la pipeline ricevute
-- leggeva una tabella vuota.
--
-- Due trigger, uno per flusso:
--  - traditional: accrual quando l'ordine entra per la prima volta in
--    uno stato "consegnato o oltre" (delivered/accepted/completed).
--    Il rischio di credito e la fattura sono decoupled dal pagamento
--    del buyer (deciso in chat: "non mi interessa se il cliente non
--    paga"), quindi l'accrual segue la CONSEGNA, non l'incasso.
--  - escrow: accrual quando payments.status passa a 'released'
--    (stesso momento in cui il transfer Stripe trattiene il 5%).
--
-- Idempotenza: unique(order_id) su commission_ledger + on conflict
-- do nothing, così un ordine non accresce mai due volte anche se lo
-- stato oscilla o il trigger viene richiamato più volte.
-- ============================================================

alter table commission_ledger
  add constraint uq_commission_ledger_order unique (order_id);

create or replace function fn_accrue_commission_traditional()
returns trigger language plpgsql as $$
begin
  if new.status in ('delivered','accepted','completed')
     and (old.status is null or old.status not in ('delivered','accepted','completed'))
     and new.payment_method in ('bonifico_anticipato','termini_dilazionati')
     and new.carrier_company_id is not null
     and new.shipping_amount is not null then
    insert into commission_ledger
      (order_id, carrier_id, flow_type, shipping_amount, commission_rate, commission_amount, status)
    values
      (new.id, new.carrier_company_id, 'traditional', new.shipping_amount, 0.05,
       round(new.shipping_amount * 0.05, 2), 'accrued')
    on conflict (order_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_accrue_commission_traditional on orders;
create trigger trg_accrue_commission_traditional
  after update on orders
  for each row execute function fn_accrue_commission_traditional();

create or replace function fn_accrue_commission_escrow()
returns trigger language plpgsql as $$
declare
  v_order orders%rowtype;
begin
  if new.status = 'released' and (old.status is distinct from 'released') then
    select * into v_order from orders where id = new.order_id;
    if v_order.payment_method in ('escrow_sepa','escrow_premium')
       and v_order.carrier_company_id is not null
       and v_order.shipping_amount is not null then
      insert into commission_ledger
        (order_id, carrier_id, flow_type, shipping_amount, commission_rate,
         commission_amount, status, psp_reference, settled_at)
      values
        (v_order.id, v_order.carrier_company_id, 'escrow', v_order.shipping_amount, 0.05,
         round(v_order.shipping_amount * 0.05, 2), 'settled', new.provider_ref, now())
      on conflict (order_id) do nothing;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_accrue_commission_escrow on payments;
create trigger trg_accrue_commission_escrow
  after update on payments
  for each row execute function fn_accrue_commission_escrow();
