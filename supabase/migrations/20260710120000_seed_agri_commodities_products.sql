-- FASE 1 — Materie prime agricole a catalogo (cereali, oleaginose, foraggere).
-- Prodotti REALI e vendibili come il resto del catalogo. Nessun fornitore finto:
-- l'associazione di fornitori reali è un lavoro commerciale separato (Davide).
--
-- Fonte prezzi (Fase 2, non in questa migration): Borsa Merci di Bologna (AGER)
-- per tutti tranne il grano duro, che dal 16/01/2026 ha la fonte nazionale unica
-- CUN Grano Duro (Commissione Unica Nazionale, decreto Masaf/MIMIT n. 20417).
--
-- Struttura dati identica agli altri prodotti. Cereali sfusi: 1 bancale/big-bag =
-- 1000 kg (pallet_kg default); niente "sacco"/"container" (non pertinenti allo
-- sfuso), così la pagina prodotto mostra solo Pallet + Kg personalizzati.
-- I "gradi" del grano tenero NON sono attributi di prodotto: nel modello esistente
-- le varianti vivono a livello di fornitore (supplier_products.grade /
-- variant_attributes) e, per lo storico prezzi, sulla riga di market_price_history
-- (Fase 2). Qui i gradi restano documentati in description.
-- Idempotente: rieseguibile senza duplicare (guardie NOT EXISTS, nessun UUID hardcoded).

-- 1) Nuovo settore "Cereali & seminativi" sotto la macro "Agricoltura & Ambiente".
insert into public.sectors (name, slug, macro_area_id, icon, sort_order)
select 'Cereali & seminativi', 'cereali-seminativi', m.id, '🌾', 90
from public.macro_areas m
where m.slug = 'agricoltura-ambiente'
  and not exists (select 1 from public.sectors s where s.slug = 'cereali-seminativi');

-- 2) Prodotti (materie prime agricole).
insert into public.products (canonical_name, description, merch_classes, default_unit, pallet_kg)
select v.canonical_name, v.description, v.merch_classes, 'kg', 1000
from (values
  ('Grano tenero',
   'Frumento tenero nazionale. Categorie merceologiche (Borsa Merci di Bologna): n.1 Speciali di Forza, n.2 Speciali, n.3 Fino, n.4 Buono Mercantile, n.5 Mercantile.',
   'Cereali, Panificazione, Uso zootecnico'),
  ('Grano duro',
   'Frumento duro nazionale. Quotazione di riferimento: CUN Grano Duro (Commissione Unica Nazionale), attiva dal 2026.',
   'Cereali, Semola, Pasta'),
  ('Granoturco (mais)',
   'Mais/granoturco nazionale, uso zootecnico (umidità di riferimento 14%).',
   'Cereali, Uso zootecnico, Amidi'),
  ('Sorgo',
   'Sorgo nazionale, uso zootecnico.',
   'Cereali, Uso zootecnico'),
  ('Semi di soia',
   'Semi di soia di produzione nazionale.',
   'Oleaginose, Uso zootecnico, Olio'),
  ('Farina di estrazione di soia',
   'Farina di estrazione di soia (panello proteico), uso mangimistico.',
   'Farine proteiche, Mangimi, Uso zootecnico'),
  ('Orzo',
   'Orzo nazionale, uso zootecnico e maltario.',
   'Cereali, Uso zootecnico, Malto'),
  ('Risone',
   'Risone (riso greggio) di produzione nazionale.',
   'Cereali, Riso')
) as v(canonical_name, description, merch_classes)
where not exists (select 1 from public.products p where p.canonical_name = v.canonical_name);

-- 3) Mapping prodotto → settore "Cereali & seminativi".
insert into public.product_sectors (product_id, sector_id)
select p.id, s.id
from public.products p
cross join public.sectors s
where s.slug = 'cereali-seminativi'
  and p.canonical_name in (
    'Grano tenero','Grano duro','Granoturco (mais)','Sorgo',
    'Semi di soia','Farina di estrazione di soia','Orzo','Risone')
  and not exists (
    select 1 from public.product_sectors ps
    where ps.product_id = p.id and ps.sector_id = s.id);

-- 4) Sinonimi per la ricerca (nomi comuni alternativi).
insert into public.product_synonyms (product_id, synonym, language)
select p.id, v.synonym, 'it'
from public.products p
join (values
  ('Grano tenero','frumento tenero'),
  ('Grano tenero','grano'),
  ('Grano duro','frumento duro'),
  ('Granoturco (mais)','mais'),
  ('Granoturco (mais)','granoturco'),
  ('Granoturco (mais)','frumentone'),
  ('Semi di soia','soia'),
  ('Farina di estrazione di soia','farina di soia'),
  ('Farina di estrazione di soia','panello di soia'),
  ('Risone','riso greggio')
) as v(canonical_name, synonym) on v.canonical_name = p.canonical_name
where not exists (
  select 1 from public.product_synonyms ps
  where ps.product_id = p.id and lower(ps.synonym) = lower(v.synonym));
