-- =====================================================================
-- Andamento prezzi — Fase 3: DG-AGRI Agri-food Data Portal (prezzi UE).
-- 21 serie italiane, settimanali (latte mensile), in EUR/t. Host nuovo
-- api.tech.ec.europa.eu. Media nazionale: fornita dall'API per cereali
-- (marketName='National Average') e olio (market='Average national price');
-- per gli oleosi la calcola l'ingestion come media tra le piazze rilevate.
-- Licenza: Decisione 2011/833/UE, CC BY 4.0.
-- =====================================================================
insert into public.market_indicators
  (slug, nome, famiglia, tipo, unita, valuta, frequenza, fonte, fonte_url, licenza, attribuzione, serie_ref, pubblico, attivo)
select
  slug, nome, 'agroalimentare', 'prezzo', '€/t', 'EUR', frequenza,
  'EU DG AGRI', 'https://agriculture.ec.europa.eu/data-and-analysis/markets/price-data/price-monitoring-sector_en',
  '2011/833/UE · CC BY 4.0',
  'Fonte: Commissione europea, DG AGRI — Agri-food Data Portal. Riuso ai sensi della Decisione 2011/833/UE, CC BY 4.0. Elaborazione BulkStrike.',
  serie_ref, true, true
from (values
  ('agri-cereal-frumento-tenero-pan','Frumento tenero panificabile — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','cereal','agg','row','since','2015',
      'match', jsonb_build_object('productName','Breadmaking common wheat','marketName','National Average'))),
  ('agri-cereal-frumento-duro','Frumento duro — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','cereal','agg','row','since','2015',
      'match', jsonb_build_object('productName','Durum wheat','marketName','National Average'))),
  ('agri-cereal-mais-foraggio','Mais da foraggio — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','cereal','agg','row','since','2015',
      'match', jsonb_build_object('productName','Feed maize','marketName','National Average'))),
  ('agri-cereal-orzo-foraggio','Orzo da foraggio — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','cereal','agg','row','since','2015',
      'match', jsonb_build_object('productName','Feed barley','marketName','National Average'))),
  ('agri-rice-carnaroli','Riso Carnaroli (risone) — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','rice','agg','row','since','2015',
      'match', jsonb_build_object('variety','Carnaroli','stage','Paddy'))),
  ('agri-rice-arborio','Riso Arborio (risone) — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','rice','agg','row','since','2015',
      'match', jsonb_build_object('variety','Arborio','stage','Paddy'))),
  ('agri-rice-baldo','Riso Baldo (risone) — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','rice','agg','row','since','2015',
      'match', jsonb_build_object('variety','Baldo','stage','Paddy'))),
  ('agri-rice-selenio','Riso Selenio (risone) — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','rice','agg','row','since','2015',
      'match', jsonb_build_object('variety','Selenio','stage','Paddy'))),
  ('agri-rice-roma','Riso Roma (risone) — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','rice','agg','row','since','2015',
      'match', jsonb_build_object('variety','Roma','stage','Paddy'))),
  ('agri-rice-sant-andrea','Riso Sant''Andrea (risone) — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','rice','agg','row','since','2015',
      'match', jsonb_build_object('variety','S. Andrea','stage','Paddy'))),
  ('agri-rice-japonica-media','Riso Japonica media (risone) — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','rice','agg','row','since','2015',
      'match', jsonb_build_object('variety','Avg','type','Japonica','stage','Paddy'))),
  ('agri-oil-farina-soia','Farina di soia — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','oilseeds','agg','avg_markets','since','2015',
      'match', jsonb_build_object('product','Soya meal'))),
  ('agri-oil-semi-soia','Semi di soia — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','oilseeds','agg','avg_markets','since','2015',
      'match', jsonb_build_object('product','Soya beans'))),
  ('agri-oil-colza','Colza (seme) — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','oilseeds','agg','avg_markets','since','2015',
      'match', jsonb_build_object('product','Rapeseed'))),
  ('agri-oil-girasole','Girasole (seme) — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','oilseeds','agg','avg_markets','since','2015',
      'match', jsonb_build_object('product','Sunflower seed'))),
  ('agri-oil-olio-soia-grezzo','Olio di soia grezzo — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','oilseeds','agg','avg_markets','since','2015',
      'match', jsonb_build_object('product','Crude soya bean oil'))),
  ('agri-olive-extra-vergine','Olio extra vergine di oliva — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','oliveOil','agg','row','since','2015',
      'match', jsonb_build_object('product','Extra virgin olive oil (up to 0.8%)','market','Average national price'))),
  ('agri-olive-lampante','Olio di oliva lampante — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','oliveOil','agg','row','since','2015',
      'match', jsonb_build_object('product','Lampante olive oil (2%)','market','Average national price'))),
  ('agri-olive-raffinato','Olio di oliva raffinato — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','oliveOil','agg','row','since','2015',
      'match', jsonb_build_object('product','Refined olive oil (up to 0.3%)','market','Average national price'))),
  ('agri-olive-sansa-raffinato','Olio di sansa di oliva raffinato — Italia','settimanale',
    jsonb_build_object('source','agrifood','endpoint','oliveOil','agg','row','since','2015',
      'match', jsonb_build_object('product','Refined olive-pomace oil (up to 0.3%)','market','Average national price'))),
  ('agri-raw-milk','Latte crudo — Italia','mensile',
    jsonb_build_object('source','agrifood','endpoint','rawMilk','agg','row','freq','monthly','since','2015',
      'match', jsonb_build_object('product','Raw milk')))
) as t(slug, nome, frequenza, serie_ref)
on conflict (slug) do update set
  nome=excluded.nome, famiglia=excluded.famiglia, tipo=excluded.tipo, unita=excluded.unita,
  valuta=excluded.valuta, frequenza=excluded.frequenza, fonte=excluded.fonte, fonte_url=excluded.fonte_url,
  licenza=excluded.licenza, attribuzione=excluded.attribuzione, serie_ref=excluded.serie_ref, attivo=true;

-- Colza: dati italiani DG-AGRI fermi al 2023 (pochi punti) → disattivata per non
-- esporre un prezzo vecchio come attuale. Riattivabile se la serie riprende.
update public.market_indicators set attivo = false where slug = 'agri-oil-colza';
