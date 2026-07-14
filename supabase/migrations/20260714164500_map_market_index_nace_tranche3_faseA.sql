-- Mappatura products.market_index_nace — TRANCHE 3 (Fase A): 314 prodotti su NACE
-- già ingeriti + C17 (carta, aggiunto in questa tranche). Scelte validate da Davide 14/7.
-- Solo UPDATE della colonna (NULL). Non distruttivo. C20 per ultimo (guard NULL).
-- Restano volutamente SCOPERTI 3 prodotti (Semi di soia, Farina di estrazione di
-- soia, Sorgo): candidati a un futuro PREZZO DIRETTO €/kg (ISMEA semi oleosi), non
-- a un indice — vedi piano p.6.2.

-- 1) C241 (siderurgici/ferrosi): rottame ferroso, elettrodi/filo di saldatura acciaio
update public.products set market_index_nace='C241' where market_index_nace is null and id in (
  'f8bc33d5-fdb9-40fb-8b68-e02a1ff91162','87fa9a8f-cd4e-42b9-a672-dbbddc1b9f01','059961da-19b3-4caf-b962-a9403ab94f87');

-- 2) C244 (metalli non ferrosi): rame, alluminio, titanio, lega brasante all'argento
update public.products set market_index_nace='C244' where market_index_nace is null and id in (
  '0347806a-95b4-4dc0-80de-2f9480d0f8d8','e2342442-201e-4452-a835-cc4598f19b70',
  'a094b057-e912-4daf-898a-0bdd03f81001','060dafe6-f80c-4b98-bea9-e515119c4f81',
  'f8b1c6e9-32b7-4cfa-84d4-6abe58ba6569','564e70ac-90aa-4b51-90f8-26dddd08593b');

-- 3) C23 (minerali non metalliferi): sabbia/bentonite da fonderia, fibra di vetro,
--    caolino da patinatura carta
update public.products set market_index_nace='C23' where market_index_nace is null and id in (
  'd3e025cd-0078-4bd0-ba51-e650011d7d4e','f59e3596-417d-4dd1-b477-95774be6b635',
  '1d04f2ee-d3d4-46eb-90d0-57a60e2c6788','6f91c7cf-665e-47f7-b2b6-9fef7a234c7f');

-- 4) C10 (pet food food-like): grasso animale idrolizzato, idrolizzato proteico animale
update public.products set market_index_nace='C10' where market_index_nace is null and id in (
  'cd03cb38-1dc6-4461-8ed0-3defae7bdb99','40a2cef8-20b1-4e06-a9a8-e936f4d17d28');

-- 5) C2016 (plastiche in forme primarie): Film BOPP, Gomma SBR (proxy polimero) +
--    tutto il settore "Plastiche & polimeri"
update public.products set market_index_nace='C2016' where market_index_nace is null and id in (
  '6dc68d65-441b-4dc2-bb48-1f654e421000','cee550b6-0550-4d10-a864-de15d154c419');
update public.products p set market_index_nace='C2016'
where p.market_index_nace is null
  and p.id not in (select distinct product_id from public.market_price_history)
  and exists (select 1 from public.product_sectors ps join public.sectors s on s.id=ps.sector_id
              where ps.product_id=p.id and s.name='Plastiche & polimeri');

-- 6) C17 (carta e prodotti di carta): carte, cartoni, cartoncini, paste, tissue
update public.products set market_index_nace='C17' where market_index_nace is null and id in (
  '4c3e4752-6590-4b3b-b32c-263fe0a69c6e','f299b145-c8e7-4007-8dd6-a9f4dc3e67e4',
  '3f5636a1-b25b-40b7-8f76-3dd753a8d43a','24f871db-4bff-4e79-a43d-f5b32982fbe1',
  'a546fa7b-725f-4b52-9e02-4ca221bd9d9f','21961310-8df2-47aa-be98-071f289b8a68',
  '29fd5cf4-7ff6-4e74-a3c9-05308c5409fb','fac53558-5bb8-45e9-89fd-c2b61d8ed143',
  '0ab42de5-928e-4390-86db-b31ac84fe1fe','b3967dd8-1cee-40c3-a3db-585af341f99a');

-- 7) C20 (chimica) — catch-all per tutti gli scoperti residui, ESCLUSI i 3 lasciati
--    volutamente scoperti (soia/sorgo). Il guard NULL protegge i passi 1-6.
update public.products p set market_index_nace='C20'
where p.market_index_nace is null
  and p.id not in (select distinct product_id from public.market_price_history)
  and p.id <> all (array[
    '560227d1-6a2b-4c8f-ad24-d440583f2a12', -- Semi di soia
    '444e4e58-fd8e-4105-aee9-49ae4033da6e', -- Farina di estrazione di soia
    'ee6b0c0e-fd88-444a-960b-e93a7a58864c'  -- Sorgo
  ]::uuid[]);
