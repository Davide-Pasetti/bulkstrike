-- Mappatura products.market_index_nace — TRANCHE 1: aree a copertura zero (58 prodotti)
-- Solo UPDATE della colonna market_index_nace (oggi NULL su questi prodotti).
-- Non distruttivo e reversibile; non tocca view/funzioni ristrette → nessun GRANT
-- da riapplicare. Scoping: solo prodotti senza indice E senza prezzo diretto.
--
-- Decisioni di prodotto (Davide, 14/7/2026):
--   - Integratori & nutraceutica → C21 (attivi salutistici, vicini al farmaceutico)
--   - Oil & gas chemicals → C20 (chimica speciality, non prodotti petroliferi)
--   - Additivi calcestruzzo / malte & adesivi edili → C23 (coerenza di filiera)
--
-- NB: i NACE C19/C21/C23 iniziano a comparire nello screener solo dopo che
-- l'edge function ingest-market-prices-eurostat (estesa con C10/C19/C21/C23) è
-- stata deployata ed eseguita almeno una volta. C20 ha già dati storici.

-- 1) Edilizia, Ceramica & Vetro → C23 (28)
update public.products p set market_index_nace = 'C23'
where p.market_index_nace is null
  and p.id not in (select distinct product_id from public.market_price_history)
  and exists (
    select 1 from public.product_sectors ps
      join public.sectors s on s.id = ps.sector_id
      join public.macro_areas ma on ma.id = s.macro_area_id
    where ps.product_id = p.id and ma.name = 'Edilizia, Ceramica & Vetro');

-- 2) Energia — Oil & gas chemicals → C20 (4). PRIMA dell'update C19 di area:
--    il guard market_index_nace IS NULL evita che il passo 3 li sovrascriva.
update public.products p set market_index_nace = 'C20'
where p.market_index_nace is null
  and p.id not in (select distinct product_id from public.market_price_history)
  and exists (
    select 1 from public.product_sectors ps
      join public.sectors s on s.id = ps.sector_id
      join public.macro_areas ma on ma.id = s.macro_area_id
    where ps.product_id = p.id
      and ma.name = 'Energia, Lubrificanti & Combustibili'
      and s.name = 'Oil & gas chemicals');

-- 3) Energia — combustibili & biocarburanti + lubrificanti & grassi → C19 (10)
update public.products p set market_index_nace = 'C19'
where p.market_index_nace is null
  and p.id not in (select distinct product_id from public.market_price_history)
  and exists (
    select 1 from public.product_sectors ps
      join public.sectors s on s.id = ps.sector_id
      join public.macro_areas ma on ma.id = s.macro_area_id
    where ps.product_id = p.id and ma.name = 'Energia, Lubrificanti & Combustibili');

-- 4) Farmaceutica & Nutraceutica → C21 (16, inclusa nutraceutica)
update public.products p set market_index_nace = 'C21'
where p.market_index_nace is null
  and p.id not in (select distinct product_id from public.market_price_history)
  and exists (
    select 1 from public.product_sectors ps
      join public.sectors s on s.id = ps.sector_id
      join public.macro_areas ma on ma.id = s.macro_area_id
    where ps.product_id = p.id and ma.name = 'Farmaceutica & Nutraceutica');
