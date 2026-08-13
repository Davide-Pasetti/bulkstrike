-- =====================================================================
-- Andamento prezzi — Fase 4: MIMIT Osservaprezzi carburanti (media nazionale
-- self-service, esclusi gli impianti autostradali). 3 serie in €/litro. Lo
-- snapshot MIMIT e' giornaliero e senza storico: la serie si costruisce in avanti,
-- con headline = media SETTIMANALE dei punti giornalieri (curva leggibile).
-- Licenza IODL 2.0.
-- =====================================================================
insert into public.market_indicators
  (slug, nome, famiglia, tipo, unita, valuta, frequenza, fonte, fonte_url, licenza, attribuzione, serie_ref, pubblico, attivo)
select
  slug, nome, 'energia_logistica', 'prezzo', '€/l', 'EUR', 'settimanale',
  'MIMIT', 'https://carburanti.mise.gov.it/ospzSearch/', 'IODL 2.0',
  'Fonte: MIMIT — Osservaprezzi carburanti, licenza IODL 2.0. Media nazionale self-service, esclusi impianti autostradali. Elaborazione BulkStrike.',
  jsonb_build_object('source','mimit','desc',desc_match), true, true
from (values
  ('mimit-benzina','Benzina (self, media nazionale) — Italia','Benzina'),
  ('mimit-gasolio','Gasolio (self, media nazionale) — Italia','Gasolio'),
  ('mimit-gpl','GPL (self, media nazionale) — Italia','GPL')
) as t(slug, nome, desc_match)
on conflict (slug) do update set
  nome=excluded.nome, famiglia=excluded.famiglia, tipo=excluded.tipo, unita=excluded.unita,
  valuta=excluded.valuta, frequenza=excluded.frequenza, fonte=excluded.fonte, fonte_url=excluded.fonte_url,
  licenza=excluded.licenza, attribuzione=excluded.attribuzione, serie_ref=excluded.serie_ref, attivo=true;
