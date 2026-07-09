-- Pre-popolazione (BOZZA) del tipo prodotto a partire dal file di
-- classificazione preparato a mano (BulkStrike_classificazione_liquidi_gas.xlsx).
-- - 67 "Liquidi - alta confidenza" + 17 "Liquidi - da confermare" -> default_unit = 'L'
-- - i 17 "da confermare" vengono marcati unit_needs_review = true ("da verificare"
--   nella UI admin), cosi' Davide sa quali controllare per primi.
-- I 29 prodotti "Gas (caso speciale)" e i 497 "Solidi" NON vengono toccati:
-- restano default_unit = 'kg', coerente con lo stato attuale. Match esatto su
-- canonical_name verificato: 84/84 (nessun nome mancante).

-- ── Liquidi (alta confidenza + da confermare) -> Liquido / L ──────────────────
update public.products set default_unit = 'L'
where canonical_name in (
  '2-Butossietanolo (butilglicole)','Acetato di butile','Acetato di etile','Acetone','Acetonitrile',
  'Acido acetico glaciale','Acido cloridrico','Acido fosforico','Acido fosforico alimentare','Acido fosforico tecnico',
  'Acido nitrico','Acido nitrico tecnico','Acido peracetico','Acido solforico','Alcool etilico per profumeria',
  'Anidride acetica','Antischiuma per fluidi','Biodiesel FAME','Bioetanolo','Caglio liquido',
  'Diclorometano (DCM)','Dimetilformammide (DMF)','Dimetilsolfossido (DMSO)','Etanolo industriale/denaturato',
  'Fluido sintetico per rettifica','Formaldeide (formalina)','Glicerina','Glicerina (glicerolo)','Glicerina grezza',
  'Glicole dietilenico (DEG)','Glicole etilenico (MEG)','Glicole propilenico (MPG)','Glicole propilenico metiletere (PGME)',
  'Glicole trietilenico TEG','Glutaraldeide','HVO olio vegetale idrogenato','Ipoclorito di sodio','Ipoclorito di sodio (candeggina)',
  'Isobutanolo','Isopropanolo (IPA)','Metanolo','Metiletilchetone (MEK)','Metilisobutilchetone (MIBK)',
  'N-Metilpirrolidone (NMP)','Olio base minerale SN500','Olio base sintetico PAO','Olio da taglio emulsionabile',
  'Olio di cocco','Olio di colza','Olio di girasole','Olio di jojoba','Olio di palma','Olio essenziale di lavanda',
  'Olio idraulico ISO 46','Olio intero per lavorazioni','Olio minerale bianco agricolo','Percloroetilene',
  'Perossido di idrogeno','Soluzione UAN','Solvente nafta aromatico (Solvesso)','Tetraidrofurano (THF)','Toluene',
  'White spirit / ragia minerale','Xilene (miscela)','n-Butanolo','n-Eptano','n-Esano',
  -- da confermare
  'Additivo antiusura ZDDP','Additivo per gasolio','Adesivo a base solvente (SBR)','Adesivo in dispersione acquosa',
  'Assorbente per idrocarburi','Ausiliario di tintura','Biocida oilfield','Biocida per lubrorefrigeranti','Demulsionante',
  'Distaccante per stampi','Flussante per brasatura','Fosfatante antiruggine','Ingrassante per cuoio','Inibitore di corrosione',
  'Sgrassante alcalino','Sgrassante per pelli','Solvente per inchiostri'
);

-- ── "Liquidi - da confermare" -> segnalati "da verificare" ────────────────────
update public.products set unit_needs_review = true
where canonical_name in (
  'Additivo antiusura ZDDP','Additivo per gasolio','Adesivo a base solvente (SBR)','Adesivo in dispersione acquosa',
  'Assorbente per idrocarburi','Ausiliario di tintura','Biocida oilfield','Biocida per lubrorefrigeranti','Demulsionante',
  'Distaccante per stampi','Flussante per brasatura','Fosfatante antiruggine','Ingrassante per cuoio','Inibitore di corrosione',
  'Sgrassante alcalino','Sgrassante per pelli','Solvente per inchiostri'
);
