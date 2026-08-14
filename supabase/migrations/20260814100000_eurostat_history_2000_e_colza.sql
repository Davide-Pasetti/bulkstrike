-- Rifiniture indicatori.
-- 1) Eurostat: raddoppia lo storico portando l'inizio serie da 2015-01 a 2000-01
--    (i dati italiani sts_inppd_m esistono dal 2000 per quasi tutte le serie).
--    La data di inizio effettiva varia per serie: C2442 (alluminio) parte dal 2011
--    perche' il 2004-2010 e' soppresso — l'ingestion lo gestisce da sola (Eurostat
--    restituisce solo i periodi disponibili). Dopo questa modifica va rilanciata
--    l'edge function ingest-market-indicators-eurostat per il backfill completo.
update public.market_indicators
set serie_ref = jsonb_set(serie_ref, '{since}', '"2000-01"'::jsonb)
where serie_ref->>'source' = 'eurostat';

-- 2) Colza (DG-AGRI): riattivata per allineare il conteggio (21 serie DG-AGRI).
--    NB: la serie italiana e' sparsa e ferma al 2023; la scheda mostra la data
--    dell'ultimo dato, quindi la staleness resta trasparente.
update public.market_indicators set attivo = true where slug = 'agri-oil-colza';
