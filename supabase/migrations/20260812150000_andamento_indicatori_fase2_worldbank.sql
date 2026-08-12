-- =====================================================================
-- Andamento prezzi — Fase 2: World Bank Pink Sheet (prezzi mondiali mensili).
-- 16 serie. Vincolo LME (metalli a base LME): solo medie mensili, niente
-- download CSV/Excel o API pubblica su queste serie, niente marchio/logo LME,
-- attribuzione con "quotazioni di base LME". Il petrolio 'media' e' un calcolo
-- proprio World Bank (piu' sicuro); agroalimentari da fonti pubbliche.
-- Licenza dataset: CC BY 4.0.
-- =====================================================================
insert into public.market_indicators
  (slug, nome, famiglia, tipo, unita, valuta, frequenza, fonte, fonte_url, licenza, attribuzione, note_legali, serie_ref, pubblico, attivo)
select
  slug, nome, famiglia, 'prezzo', unita, 'USD', 'mensile',
  'World Bank', 'https://www.worldbank.org/en/research/commodity-markets',
  'CC BY 4.0', attribuzione, note_legali,
  jsonb_build_object('source','worldbank','base',base) || case when q is not null then jsonb_build_object('q',q) else '{}'::jsonb end || jsonb_build_object('since','2015-01'),
  true, true
from (values
  ('wb-aluminum','Alluminio — prezzo mondiale','metalli','$/mt','aluminum',null,
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili; quotazioni di base LME. Elaborazione BulkStrike.',
     'Serie a base LME: pubblicare solo medie mensili; non esporre come download CSV/Excel o API pubblica; non usare marchio o loghi LME.'),
  ('wb-copper','Rame — prezzo mondiale','metalli','$/mt','copper',null,
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili; quotazioni di base LME. Elaborazione BulkStrike.',
     'Serie a base LME: pubblicare solo medie mensili; non esporre come download CSV/Excel o API pubblica; non usare marchio o loghi LME.'),
  ('wb-zinc','Zinco — prezzo mondiale','metalli','$/mt','zinc',null,
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili; quotazioni di base LME. Elaborazione BulkStrike.',
     'Serie a base LME: pubblicare solo medie mensili; non esporre come download CSV/Excel o API pubblica; non usare marchio o loghi LME.'),
  ('wb-nickel','Nichel — prezzo mondiale','metalli','$/mt','nickel',null,
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili; quotazioni di base LME. Elaborazione BulkStrike.',
     'Serie a base LME: pubblicare solo medie mensili; non esporre come download CSV/Excel o API pubblica; non usare marchio o loghi LME.'),
  ('wb-lead','Piombo — prezzo mondiale','metalli','$/mt','lead',null,
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili; quotazioni di base LME. Elaborazione BulkStrike.',
     'Serie a base LME: pubblicare solo medie mensili; non esporre come download CSV/Excel o API pubblica; non usare marchio o loghi LME.'),
  ('wb-tin','Stagno — prezzo mondiale','metalli','$/mt','tin',null,
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili; quotazioni di base LME. Elaborazione BulkStrike.',
     'Serie a base LME: pubblicare solo medie mensili; non esporre come download CSV/Excel o API pubblica; non usare marchio o loghi LME.'),
  ('wb-iron-ore','Minerale di ferro — prezzo mondiale','metalli','$/dmtu','iron ore',null,
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili. Elaborazione BulkStrike.',
     'Pubblicare solo medie mensili; non esporre come download CSV/Excel o API pubblica.'),
  ('wb-urea','Urea — prezzo mondiale','chimica','$/mt','urea',null,
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili. Elaborazione BulkStrike.',
     'Pubblicare solo medie mensili; non esporre come download CSV/Excel o API pubblica.'),
  ('wb-dap','DAP (fosfato biammonico) — prezzo mondiale','chimica','$/mt','dap',null,
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili. Elaborazione BulkStrike.',
     'Pubblicare solo medie mensili; non esporre come download CSV/Excel o API pubblica.'),
  ('wb-potassium-chloride','Cloruro di potassio — prezzo mondiale','chimica','$/mt','potassium chloride',null,
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili. Elaborazione BulkStrike.',
     'Pubblicare solo medie mensili; non esporre come download CSV/Excel o API pubblica.'),
  ('wb-phosphate-rock','Fosfato naturale — prezzo mondiale','chimica','$/mt','phosphate rock',null,
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili. Elaborazione BulkStrike.',
     'Pubblicare solo medie mensili; non esporre come download CSV/Excel o API pubblica.'),
  ('wb-natural-gas-europe','Gas naturale Europa (TTF) — prezzo mondiale','energia_logistica','$/mmbtu','natural gas','europe',
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili. Elaborazione BulkStrike.', null),
  ('wb-crude-oil-average','Petrolio greggio (media) — prezzo mondiale','energia_logistica','$/bbl','crude oil','average',
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili. Elaborazione BulkStrike.', null),
  ('wb-sugar-world','Zucchero (mercato mondiale) — prezzo','agroalimentare','$/kg','sugar','world',
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili. Elaborazione BulkStrike.', null),
  ('wb-palm-oil','Olio di palma — prezzo mondiale','agroalimentare','$/mt','palm oil',null,
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili. Elaborazione BulkStrike.', null),
  ('wb-soybeans','Semi di soia — prezzo mondiale','agroalimentare','$/mt','soybeans',null,
     'Fonte: World Bank Commodity Price Data (Pink Sheet), medie mensili. Elaborazione BulkStrike.', null)
) as t(slug, nome, famiglia, unita, base, q, attribuzione, note_legali)
on conflict (slug) do update set
  nome=excluded.nome, famiglia=excluded.famiglia, tipo=excluded.tipo, unita=excluded.unita,
  valuta=excluded.valuta, fonte=excluded.fonte, fonte_url=excluded.fonte_url, licenza=excluded.licenza,
  attribuzione=excluded.attribuzione, note_legali=excluded.note_legali, serie_ref=excluded.serie_ref, attivo=true;
