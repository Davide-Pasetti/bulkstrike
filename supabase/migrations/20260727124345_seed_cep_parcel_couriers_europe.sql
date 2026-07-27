-- Corrieri espresso / pacchi (CEP) famosi operanti in Europa. I 146 corrieri
-- gia' in anagrafica sono trasportatori di RINFUSE (cisterne, silo, tank, treni,
-- navi): mancavano del tutto i corrieri parcel/espresso di rete. Aggiunta una
-- categoria dedicata 'espresso_pacchi' e le 16 aziende piu' note (ricerca di
-- mercato, quota CEP EU dominata da DHL, poi DPD/GLS/UPS/Hermes-Evri + poste
-- nazionali). Tutte aziende reali, copertura Europa geografica (region 'Europa').
-- status='pending' (convenzione DAV-33: import non ancora verificato da admin).

-- 1) Nuova categoria nell'enum CHECK di carrier_transport_modes.
alter table carrier_transport_modes drop constraint carrier_transport_modes_mode_check;
alter table carrier_transport_modes add constraint carrier_transport_modes_mode_check
  check (mode = any (array['strada_ftl','groupage_ltl','espresso_pacchi','mare','ferrovia','multimodale']));

-- 2) Aziende. Marker in verification_notes per ritrovarle in modo idempotente
--    nei due insert successivi (coverage + modes), senza UUID hardcoded.
insert into companies (legal_name, is_carrier, is_supplier, is_buyer, status, import_source,
                       country, country_iso2, city, website, carrier_pricing_mode, verification_notes)
select v.legal_name, true, false, false, 'pending'::company_status, 'import',
       v.country, v.iso2, v.city, v.website, 'zone', '[CEP seed 2026-07-27]'
from (values
  ('DHL Group',                    'Germania',      'DE', 'Bonn',    'www.dhl.com'),
  ('UPS (United Parcel Service)',  'Stati Uniti',   'US', 'Atlanta', 'www.ups.com'),
  ('FedEx Express',                'Stati Uniti',   'US', 'Memphis', 'www.fedex.com'),
  ('GLS (General Logistics Systems)','Paesi Bassi', 'NL', 'Amsterdam','www.gls-group.com'),
  ('DPDgroup',                     'Francia',       'FR', null,      'www.dpd.com'),
  ('BRT Corriere Espresso (Bartolini)','Italia',    'IT', 'Bologna', 'www.brt.it'),
  ('SDA Express Courier',          'Italia',        'IT', null,      'www.sda.it'),
  ('Poste Italiane',               'Italia',        'IT', 'Roma',    'www.poste.it'),
  ('Chronopost',                   'Francia',       'FR', null,      'www.chronopost.fr'),
  ('Colissimo',                    'Francia',       'FR', null,      'www.colissimo.fr'),
  ('PostNL',                       'Paesi Bassi',   'NL', null,      'www.postnl.nl'),
  ('Evri (ex Hermes UK)',          'Regno Unito',   'GB', 'Leeds',   'www.evri.com'),
  ('InPost',                       'Polonia',       'PL', 'Cracovia','www.inpost.pl'),
  ('Parcelforce Worldwide (Royal Mail)','Regno Unito','GB','Londra', 'www.parcelforce.com'),
  ('Correos',                      'Spagna',        'ES', 'Madrid',  'www.correos.es'),
  ('PostNord',                     'Svezia',        'SE', null,      'www.postnord.com')
) as v(legal_name, country, iso2, city, website)
where not exists (select 1 from companies c where lower(c.legal_name) = lower(v.legal_name));

-- 3) Copertura: Europa geografica (una riga region per ciascuno).
insert into carrier_coverage (carrier_company_id, area_type, area_value)
select c.id, 'region', 'Europa'
from companies c
where c.verification_notes = '[CEP seed 2026-07-27]'
  and not exists (select 1 from carrier_coverage cc where cc.carrier_company_id = c.id
                  and cc.area_type = 'region' and cc.area_value = 'Europa');

-- 4) Categoria di trasporto: corriere espresso / pacchi.
insert into carrier_transport_modes (carrier_company_id, mode)
select c.id, 'espresso_pacchi'
from companies c
where c.verification_notes = '[CEP seed 2026-07-27]'
  and not exists (select 1 from carrier_transport_modes m where m.carrier_company_id = c.id
                  and m.mode = 'espresso_pacchi');
