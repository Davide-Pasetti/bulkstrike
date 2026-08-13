-- Fase 5 — popolamento di product_indicators dalla proposta validata.
-- La proposta (prodotto → indicatore primario + benchmark, con confidenza e
-- motivazione) e' costruita da una vista classificatrice deterministica basata su
-- chemical_classes + merch_classes + nome, poi rivista e approvata, e conservata
-- nella tabella di staging public.product_indicator_proposal (audit/re-review).
-- Qui si promuovono le righe approvate. Idempotente (ON CONFLICT DO NOTHING).
insert into public.product_indicators (product_id, indicator_id, ruolo)
select p.product_id, mi.id, 'primario'
from public.product_indicator_proposal p
join public.market_indicators mi on mi.slug = p.primario
on conflict (product_id, indicator_id, ruolo) do nothing;

insert into public.product_indicators (product_id, indicator_id, ruolo)
select p.product_id, mi.id, 'benchmark'
from public.product_indicator_proposal p
join public.market_indicators mi on mi.slug = p.benchmark
where p.benchmark is not null
on conflict (product_id, indicator_id, ruolo) do nothing;

-- Staging conservata come audit; bloccata (RLS senza policy, niente grant).
alter table public.product_indicator_proposal enable row level security;
revoke all on public.product_indicator_proposal from anon, authenticated;
