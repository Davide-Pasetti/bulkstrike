-- Mappatura products.market_index_nace — TRANCHE 2: Alimentare & Bevande (119 prodotti)
-- Split validato da Davide (14/7/2026):
--   C10 (manifattura alimentare vera): farine/semole, amidi, zuccheri, oli vegetali,
--       lattiero (latte/siero in polvere, lattosio, caseinati), proteine/gelatine,
--       cacao, malto/luppolo, MCR, sale alimentare, inulina. → 32 prodotti.
--   C20 (chimica fine/additivi/coadiuvanti): tutto il resto (acidi, dolcificanti,
--       conservanti, coloranti, gomme, enzimi/fermenti/lieviti, coadiuvanti
--       enologici, gas alimentari, sali inorganici, aiuti raffinazione). → 87 prodotti.
-- Solo UPDATE della colonna (oggi NULL). Non distruttivo; nessun GRANT da riapplicare.
-- C10 e C20 hanno già dati storici in market_index_history → visibili subito.

-- 1) C10 — lista esplicita di 32 commodity alimentari (per id)
update public.products set market_index_nace = 'C10'
where market_index_nace is null
  and id in (
    '4f41db82-c241-4d84-9a8d-d26151829563', -- Farina di frumento
    'fccc7831-83ef-4646-b7a6-1ea1829bf449', -- Semola di grano duro
    'c9651add-ca1e-49c0-88f8-7af01ed9808f', -- Amido di mais
    '159a54f1-13f9-4bbd-855a-d25cf418ab3b', -- Amido di patata
    '18da6bc8-348e-41eb-914d-7597ba2b666c', -- Amido modificato
    'd735de19-5c22-48fa-a363-e8ecb4466f41', -- Saccarosio
    '63bda001-1525-46e7-925d-9718fb329a92', -- Glucosio (destrosio)
    'f0e58b36-7868-45a5-90d0-1313dcb6a582', -- Fruttosio
    'fb33cbf6-0bcd-486a-b98b-335763bce3d2', -- Maltosio
    '01c4ddc7-7859-4204-8d46-f52c6a5b207c', -- Sciroppo di glucosio
    '6df8d9bb-06dc-41d7-9a84-1a345bb087dd', -- Maltodestrina
    '9cba5a43-ceee-411e-9250-04bce3f321f6', -- Olio di cocco
    'a986b25f-71a5-4cda-b429-92b682976870', -- Olio di colza
    'a3c39eb5-b15c-4a51-87a0-f3ddd43c287d', -- Olio di girasole
    '9bfa1aad-9df6-421a-8548-85d704f781cc', -- Olio di palma
    '819fcfa8-d422-4539-93aa-cf1f2d2ab48d', -- Latte scremato in polvere
    '9efe209f-57fb-4d1f-a7b3-c68a7ba4387c', -- Siero di latte in polvere
    'a17fe7b2-c2e9-401c-93f6-6e198379615a', -- Lattosio
    'fae25c12-86eb-45b9-b8ec-7921cba88ee3', -- Caseinato di sodio
    '6da668b6-849a-403d-8fa8-dd605e8f22f4', -- Caseinato di potassio
    'f4a85439-471d-497c-851e-bbe0e00ddac7', -- Glutine di frumento
    '4b7cb644-d689-4dde-a75d-e3bbe4020545', -- Proteine della soia (isolato)
    '8ff786ab-4d45-4aed-8ad6-5da7088d6857', -- Proteine vegetali (pisello)
    'fd64b3d2-7f84-4b57-891f-f06812850eb1', -- Albumina d'uovo
    '602dc48c-b528-4149-a0d3-ada2ba1e01ce', -- Gelatina alimentare
    '3a916403-afd6-4a6b-87b7-95659794d8bf', -- Cacao in polvere
    'f752bf59-9375-4fcd-8643-c0f34163bf5a', -- Burro di cacao
    '65731462-32bd-4b92-aa29-65ed968a4d6d', -- Malto d'orzo
    '8199527e-0688-4672-a049-fb48b96dc479', -- Luppolo in pellet
    'f1deee6a-d3c4-4be1-8c7f-679ae296e731', -- Mosto concentrato rettificato (MCR)
    '1004e208-ba5c-41ba-b46f-a1f96539ea50', -- Sale alimentare (cloruro di sodio)
    '28995167-26ed-4bc1-a9d1-01b089474040'  -- Inulina
  );

-- 2) C20 — tutto il resto degli scoperti in Alimentare & Bevande (catch-all).
--    Il guard market_index_nace IS NULL evita di sovrascrivere i C10 del passo 1.
update public.products p set market_index_nace = 'C20'
where p.market_index_nace is null
  and p.id not in (select distinct product_id from public.market_price_history)
  and exists (
    select 1 from public.product_sectors ps
      join public.sectors s on s.id = ps.sector_id
      join public.macro_areas ma on ma.id = s.macro_area_id
    where ps.product_id = p.id and ma.name = 'Alimentare & Bevande');
