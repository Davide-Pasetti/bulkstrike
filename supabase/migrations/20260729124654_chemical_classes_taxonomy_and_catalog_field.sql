-- Tassonomia chimica ("Tipo di sostanza"): classi non esclusive (un prodotto può
-- averne più d'una), in AGGIUNTA alla tassonomia merceologica per settore d'uso
-- (macro_areas/sectors). Due gruppi: 'Famiglia chimica' e 'Tipo di materiale'.
-- Contratto DAV-43. Tutto idempotente.

-- ── Tabelle ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chemical_classes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  "group"     text NOT NULL CHECK ("group" IN ('famiglia-chimica','tipo-materiale')),
  ord         int  NOT NULL DEFAULT 0,
  description text
);
CREATE TABLE IF NOT EXISTS public.product_chemical_classes (
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  chemical_class_id uuid NOT NULL REFERENCES public.chemical_classes(id) ON DELETE CASCADE,
  UNIQUE (product_id, chemical_class_id)
);
CREATE INDEX IF NOT EXISTS idx_pcc_product ON public.product_chemical_classes (product_id);
CREATE INDEX IF NOT EXISTS idx_pcc_class   ON public.product_chemical_classes (chemical_class_id);
ALTER TABLE public.chemical_classes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_chemical_classes ENABLE ROW LEVEL SECURITY;
-- RLS attiva senza policy: lettura solo dalle RPC SECURITY DEFINER (get_catalog,
-- get_chemical_classes), mai in lettura diretta.

-- ── Seed delle 21 classi ─────────────────────────────────────────────────────
INSERT INTO public.chemical_classes (slug, name, "group", ord) VALUES
  ('acidi','Acidi','famiglia-chimica',1),
  ('basi-idrossidi','Basi e idrossidi','famiglia-chimica',2),
  ('sali','Sali','famiglia-chimica',3),
  ('alcoli-glicoli','Alcoli e glicoli','famiglia-chimica',4),
  ('esteri','Esteri','famiglia-chimica',5),
  ('ammine-azotati','Ammine e composti azotati','famiglia-chimica',6),
  ('aldeidi-chetoni','Aldeidi e chetoni','famiglia-chimica',7),
  ('eteri','Eteri','famiglia-chimica',8),
  ('grassi-oli','Grassi, oli e acidi grassi','famiglia-chimica',9),
  ('zuccheri-carboidrati','Zuccheri e carboidrati','famiglia-chimica',10),
  ('proteine-aminoacidi','Proteine, aminoacidi e derivati','famiglia-chimica',11),
  ('tensioattivi-emulsionanti','Tensioattivi ed emulsionanti','famiglia-chimica',12),
  ('enzimi','Enzimi','famiglia-chimica',13),
  ('vitamine-integratori','Vitamine e integratori','famiglia-chimica',14),
  ('polimeri-resine','Polimeri, resine ed elastomeri','tipo-materiale',1),
  ('solventi','Solventi','tipo-materiale',2),
  ('gas-tecnici','Gas tecnici e industriali','tipo-materiale',3),
  ('metalli-leghe','Metalli, leghe e ferroleghe','tipo-materiale',4),
  ('pigmenti-coloranti','Pigmenti e coloranti','tipo-materiale',5),
  ('materie-agricole-grezze','Materie prime agricole grezze','tipo-materiale',6),
  ('api-farmaceutici','Principi attivi farmaceutici (API)','tipo-materiale',7)
ON CONFLICT (slug) DO NOTHING;

-- ── Classificazione iniziale (basata su regole: nome IT + merch_classes +
-- flag legale agricolo). Precision-biased; i prodotti non riconosciuti restano
-- senza classe (il filtro è opzionale). Rivedibile: è tutto ricostruibile qui.
WITH p AS (
  SELECT id, lower(canonical_name) AS nm, lower(coalesce(merch_classes,'')) AS mc,
         coalesce(auction_restricted_by_law,false) AS agri
  FROM products
),
name_rules(slug, rx) AS (VALUES
  ('acidi','^acid[oi] '),
  ('basi-idrossidi','idrossido|soda caustica|potassa|\yammoniaca\y|calce spenta|calce viva|\ycalce\y|idrato di calcio'),
  ('sali','(solfato|nitrato|nitrito|cloruro|carbonato|bicarbonato|fosfato|difosfato|polifosfato|acetato|citrato|benzoato|sorbato|gluconato|lattato|tartrato|malato|propionato|silicato|borato|tetraborato|ioduro|bromuro|fluoruro|solfito|bisolfito|metabisolfito|molibdato|cromato|bicromato|permanganato|ipoclorito|glutammato|ascorbato) di (sodio|potassio|calcio|magnesio|ammonio|zinco|ferro|rame|alluminio|bario|manganese|piombo|stagno|litio|argento|cobalto|nichel)'),
  ('esteri','(acetato|stearato|palmitato|oleato|laurato|miristato|salicilato|adipato|sebacato|maleato) di (etile|metile|butile|propile|isopropile|isobutile|benzile|vinile|glicerile|cetile|stearile|etilesile)|ftalato|dietilftalato|dibutilftalato'),
  ('alcoli-glicoli','\yalcol|glicole|glicol |glicerolo|glicerina|etanolo|metanolo|isopropanolo|\ypropanolo|butanolo|sorbitolo|mannitolo|xilitolo|maltitolo|pentaeritritolo|neopentilglicole'),
  ('ammine-azotati','\yammina|ammide|\yurea\y|melam|anilina|etanolammina|trietanolammina|monoetanolammina|dietanolammina|guanidina|imidazolo|esametilentetrammina'),
  ('aldeidi-chetoni','aldeide|formaldeide|acetaldeide|glutaraldeide|benzaldeide|\yacetone\y|chetone|metiletilchetone|cicloesanone'),
  ('eteri','\yetere\y|dietiletere|dimetiletere|cellosolve'),
  ('grassi-oli','\yolio |\ygrasso|\ysego\y|lardo|strutto|acido stearico|acido oleico|acido palmitico|acido laurico|acido miristico|acido linoleico|lanolina|burro di|cera carnauba|cera d.api'),
  ('zuccheri-carboidrati','zucchero|saccarosio|glucosio|fruttosio|destrosio|lattosio|maltosio|maltodestrin|\yamido\y|fecola|inulina|destrina'),
  ('proteine-aminoacidi','proteina|amminoacido|aminoacido|\ylisina|metionina|\yglicina|treonina|glutammina|arginina|collagene|gelatina|caseina|siero di latte|\yglutine'),
  ('tensioattivi-emulsionanti','tensioattivo|emulsionante|laurilsolfato|lauril etere|betaina|cocamide|polisorbato|lecitina'),
  ('enzimi','\yenzima|amilasi|proteasi|\ylipasi|cellulasi|pectinasi|catalasi|\yfitasi|xilanasi|fosfolipasi'),
  ('vitamine-integratori','vitamina|acido ascorbico|tocoferolo|retinolo|colecalciferolo|niacina|niacinamide|riboflavina|tiamina|piridossina|biotina|acido folico|cobalamina|acido pantotenico'),
  ('polimeri-resine','\yresina|poli(etilene|propilene|stirene|ammide|carbonato|uretano|estere|vinil|acrilato|ossimetilene)|\ypvc\y|\ypet\y|\yabs\y|\ygomma|elastomero|lattice|silicone|siliconic|monomero|copolimero|acrilico'),
  ('solventi','solvente|toluene|\yxilene|\yxilolo|\yesano\y|eptano|acetato di etile|acetato di butile|white spirit|acquaragia|diclorometano|percloroetilene|tricloroetilene|metiletilchetone|glicole etilenico'),
  ('gas-tecnici','ossigeno|\yazoto|\yargon|\yelio\y|idrogeno|acetilene|anidride carbonica|protossido|\ypropano|\ybutano'),
  ('metalli-leghe','acciaio|\yghisa\y|\ylega |ferrolega|ferro(silicio|manganese|cromo|molibdeno|nichel|titanio|vanadio|boro|fosforo)|billett|vergella|lamiera|bramme|silicio metallo|magnesio (in pani|lingott|metallo)|titanio metallo|rame (catodico|catodi)|alluminio (primario|in pani|lingott|billett)|zinco (lingotto|shg|elettrolitico)|piombo (in pani|lingott)|stagno (in pani|lingott)|nichel (catodi|briquet|brichette)|inoculante'),
  ('pigmenti-coloranti','pigmento|colorante|biossido di titanio|ossido di ferro|ossido di zinco|carbon black|nerofumo|ftalocianina|ultramar|litopone'),
  ('materie-agricole-grezze','\y(grano|frumento|granoturco|risone|segale|sorgo)\y|\ymais\y|\yorzo\y|\yavena\y|\ymalto|crusca|panello|farina di estrazione|semi di (girasole|soia|lino|colza|sesamo|canapa)|fave di soia|soia integrale|erba medica|barbabietola da zucchero'),
  ('api-farmaceutici','paracetamolo|ibuprofene|\ycaffeina|acido acetilsalicilico|metformina|amoxicillina|principio attivo farmaceutico')
),
merch_rules(slug, rx) AS (VALUES
  ('solventi','solventi'),
  ('gas-tecnici','gas industriale'),
  ('metalli-leghe','metallo base|ferrolega|siderurgic'),
  ('pigmenti-coloranti','pigmento|colorante alimentare'),
  ('polimeri-resine','termoplastico|monomero|legante/resina|elastomero|resina adesiva|derivato cellulosico|pasta di cellulosa|riciclato'),
  ('grassi-oli','olio/grasso|emolliente/olio'),
  ('proteine-aminoacidi','protein|amminoacido'),
  ('tensioattivi-emulsionanti','tensioattivo|emulsionante'),
  ('vitamine-integratori','vitamina'),
  ('materie-agricole-grezze','cereali|seme oleoso|farina proteica|proteina vegetale|mangimi')
),
matches AS (
  SELECT DISTINCT pr.id AS product_id, r.slug FROM p pr JOIN name_rules r ON pr.nm ~ r.rx
  UNION
  SELECT DISTINCT pr.id, r.slug FROM p pr JOIN merch_rules r ON pr.mc ~ r.rx
  UNION
  SELECT pr.id, 'materie-agricole-grezze' FROM p pr WHERE pr.agri
)
INSERT INTO public.product_chemical_classes (product_id, chemical_class_id)
SELECT m.product_id, cc.id
FROM matches m JOIN public.chemical_classes cc ON cc.slug = m.slug
ON CONFLICT (product_id, chemical_class_id) DO NOTHING;

-- Rimozione falsi positivi noti (oli/grassi lubrificanti non-lipidici; sali/ossidi
-- di metallo erroneamente in 'metalli'; poliammidi che sono polimeri).
DELETE FROM public.product_chemical_classes pcc USING public.products p, public.chemical_classes cc
 WHERE pcc.product_id=p.id AND pcc.chemical_class_id=cc.id AND cc.slug='grassi-oli'
   AND lower(p.canonical_name) ~ 'olio (per|minerale|lubrific|idraulico|motore|base|bianco|siliconic|dielettric|da taglio|per turbine|per ingranaggi|per compressori|per catene|per trasformatori)|estensore|grasso (lubrific|nlgi|al litio|alla poliurea|al calcio|al sapone|per cuscinetti|industriale|multiuso|al bario|al sodio)';
DELETE FROM public.product_chemical_classes pcc USING public.products p, public.chemical_classes cc
 WHERE pcc.product_id=p.id AND pcc.chemical_class_id=cc.id AND cc.slug='metalli-leghe'
   AND lower(p.canonical_name) ~ '^(solfato|cloruro|nitrato|idrossido|fosfato|carbonato|acetato|ossido|silicato|solfuro) di ';
DELETE FROM public.product_chemical_classes pcc USING public.products p, public.chemical_classes cc
 WHERE pcc.product_id=p.id AND pcc.chemical_class_id=cc.id AND cc.slug='ammine-azotati'
   AND lower(p.canonical_name) ~ 'poliammide';

-- ── RPC: lista classi (annidata a 2 gruppi, solo classi con product_count>0) ──
CREATE OR REPLACE FUNCTION public.get_chemical_classes()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH counts AS (
    SELECT cc.slug, cc.name, cc."group", cc.ord,
           (SELECT count(*) FROM product_chemical_classes p WHERE p.chemical_class_id = cc.id) AS pc
    FROM chemical_classes cc
  ),
  grp(slug, name, ord) AS (
    VALUES ('famiglia-chimica','Famiglia chimica',1), ('tipo-materiale','Tipo di materiale',2)
  )
  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'slug', grp.slug, 'name', grp.name, 'ord', grp.ord,
             'classes', (
               SELECT jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'product_count', c.pc)
                                ORDER BY c.ord, c.name)
               FROM counts c WHERE c."group" = grp.slug AND c.pc > 0
             )
           ) ORDER BY grp.ord
         ) FILTER (WHERE EXISTS (SELECT 1 FROM counts c WHERE c."group" = grp.slug AND c.pc > 0)),
         '[]'::jsonb)
  FROM grp;
$function$;

-- ── RPC: catalogo — aggiunge chemical_classes:[slug] per prodotto ────────────
CREATE OR REPLACE FUNCTION public.get_catalog()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with prod as (
    select p.id, p.canonical_name, p.e_number, p.cas_number,
      (select count(*) from supplier_products sp where sp.product_id = p.id and sp.active) as supplier_count,
      (select min(pt.price_per_kg)
         from price_tiers pt
         join supplier_products sp on sp.id = pt.supplier_product_id
         where sp.product_id = p.id and sp.active) as best_price,
      exists(select 1 from pools po where po.product_id = p.id and po.status in ('open','final_phase')) as has_pool
    from products p
  ),
  secs as (
    select ps.product_id,
      jsonb_agg(distinct s.slug) as sector_slugs,
      jsonb_agg(distinct m.slug) filter (where m.slug is not null) as macro_slugs,
      (array_agg(s.name order by s.sort_order))[1] as primary_sector,
      (array_agg(s.icon order by s.sort_order))[1] as primary_icon,
      (array_agg(m.name order by m.sort_order))[1] as primary_macro
    from product_sectors ps
    join sectors s on s.id = ps.sector_id
    left join macro_areas m on m.id = s.macro_area_id
    group by ps.product_id
  ),
  chem as (
    select pcc.product_id, jsonb_agg(cc.slug order by cc.slug) as class_slugs
    from product_chemical_classes pcc
    join chemical_classes cc on cc.id = pcc.chemical_class_id
    group by pcc.product_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pr.id, 'name', pr.canonical_name, 'e_number', pr.e_number, 'cas_number', pr.cas_number,
    'supplier_count', pr.supplier_count, 'best_price', pr.best_price, 'has_pool', pr.has_pool,
    'sectors', coalesce(se.sector_slugs, '[]'::jsonb),
    'macros', coalesce(se.macro_slugs, '[]'::jsonb),
    'chemical_classes', coalesce(ch.class_slugs, '[]'::jsonb),
    'primary_sector', se.primary_sector, 'primary_icon', se.primary_icon, 'primary_macro', se.primary_macro
  ) order by pr.canonical_name), '[]'::jsonb)
  from prod pr
  left join secs se on se.product_id = pr.id
  left join chem ch on ch.product_id = pr.id;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_chemical_classes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chemical_classes() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_catalog() TO anon, authenticated;
