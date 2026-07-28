-- Ruoli multipli per fornitore + esposizione `roles` in tutte le RPC che
-- mostrano il badge tipo-fornitore.
--
-- Contesto: la tabella company_supplier_roles e il relativo seed erano stati
-- applicati al DB in una sessione precedente ma NON committati come migration
-- (nessun file .sql). Inoltre get_suppliers_directory/get_supplier_profile
-- avrebbero dovuto già esporre `roles` ma in produzione non lo facevano (il
-- frontend cadeva sempre sul badge singolo). Questa migration ricostruisce
-- tutto in modo idempotente e riproducibile:
--   1) tabella company_supplier_roles (+ indici, RLS, grant)
--   2) seed: ruolo primario = supplier_type per ogni fornitore, + il ruolo
--      "distributore" aggiuntivo per i 22 importatori con doppia classificazione
--   3) le 5 RPC (directory, scheda pubblica, coda admin lista+dettaglio,
--      candidati prodotto) con il campo `roles`
--
-- RLS abilitata SENZA policy: la tabella è leggibile solo dalle funzioni
-- SECURITY DEFINER (che bypassano RLS), mai in lettura diretta da anon/auth.

-- ── 1) Tabella ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_supplier_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('producer','distributor','importer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, role)
);
CREATE INDEX IF NOT EXISTS idx_company_supplier_roles_company ON public.company_supplier_roles (company_id);
CREATE INDEX IF NOT EXISTS idx_company_supplier_roles_role    ON public.company_supplier_roles (role);
ALTER TABLE public.company_supplier_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.company_supplier_roles TO anon, authenticated;
GRANT ALL    ON public.company_supplier_roles TO service_role;

-- ── 2) Seed ──────────────────────────────────────────────────────────────────
-- Ruolo primario = supplier_type di ogni fornitore.
INSERT INTO public.company_supplier_roles (company_id, role)
SELECT c.id, c.supplier_type::text
FROM public.companies c
WHERE c.is_supplier = true
  AND c.supplier_type::text IN ('producer','distributor','importer')
ON CONFLICT (company_id, role) DO NOTHING;

-- Ruolo aggiuntivo "distributor" per i 22 importatori con doppia
-- classificazione (importatore che rivende anche in Italia).
INSERT INTO public.company_supplier_roles (company_id, role)
SELECT c.id, 'distributor'
FROM public.companies c
WHERE c.legal_name IN (
  'BloomchemAG',
  'Bussetti & Co GmbH',
  'Cathay Industries Europe N.V.',
  'Cefetra B.V.',
  'Chargeurs Wool / Chargeurs PCC',
  'Claus Nitsche & Sohn GmbH',
  'Contraeve Trading',
  'Dragon Alfa Cement Ltd',
  'ECSA Chemicals AG',
  'Euro-Chemicals Group B.V.',
  'Feed & Food Trading B.V.',
  'Fennec Group Ltd',
  'Flarer S.A.',
  'Gustav Kindt Agri Trading GmbH',
  'IMR Metallurgical Resources AG',
  'InterAmerican Coffee Europe',
  'Kremer Pigmente GmbH & Co. KG',
  'Mathiesen Europa SLU',
  'NCT Group (NCT Holland B.V.)',
  'Rives SAS',
  'Rotterdam Chemicals Group',
  'Tedora International'
)
ON CONFLICT (company_id, role) DO NOTHING;

-- ── 3) RPC con il campo `roles` ──────────────────────────────────────────────

-- 3.1) Directory /fornitori
CREATE OR REPLACE FUNCTION public.get_suppliers_directory()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'name'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', c.id,
      'name', c.legal_name,
      'logo_url', c.logo_url,
      'supplier_type', c.supplier_type,
      'roles', COALESCE((SELECT jsonb_agg(r.role ORDER BY r.role) FROM company_supplier_roles r WHERE r.company_id = c.id), '[]'::jsonb),
      'status', c.status,
      'country', c.country,
      'country_iso2', c.country_iso2,
      'city', c.city,
      'rating', c.rating,
      'reviews_count', c.reviews_count,
      'countries_served', COALESCE(c.countries_served, '{}'),
      'product_count', (SELECT count(*) FROM supplier_products sp WHERE sp.supplier_company_id = c.id AND sp.active),
      'certifications', COALESCE((
        SELECT jsonb_agg(DISTINCT cert)
        FROM supplier_products sp, unnest(sp.certifications) cert
        WHERE sp.supplier_company_id = c.id AND sp.active
      ), '[]'::jsonb),
      'sectors', COALESCE((
        SELECT jsonb_agg(DISTINCT s.slug)
        FROM supplier_products sp
        JOIN product_sectors ps ON ps.product_id = sp.product_id
        JOIN sectors s ON s.id = ps.sector_id
        WHERE sp.supplier_company_id = c.id AND sp.active
      ), '[]'::jsonb),
      'sector_names', COALESCE((
        SELECT jsonb_agg(DISTINCT jsonb_build_object('name', s.name, 'slug', s.slug, 'icon', s.icon))
        FROM supplier_products sp
        JOIN product_sectors ps ON ps.product_id = sp.product_id
        JOIN sectors s ON s.id = ps.sector_id
        WHERE sp.supplier_company_id = c.id AND sp.active
      ), '[]'::jsonb),
      'macros', COALESCE((
        SELECT jsonb_agg(DISTINCT m.slug)
        FROM supplier_products sp
        JOIN product_sectors ps ON ps.product_id = sp.product_id
        JOIN sectors s ON s.id = ps.sector_id
        JOIN macro_areas m ON m.id = s.macro_area_id
        WHERE sp.supplier_company_id = c.id AND sp.active
      ), '[]'::jsonb)
    ) AS row_data
    FROM companies c
    WHERE c.is_supplier = true
      AND c.deleted_at IS NULL
      AND c.hidden_from_public = false
      AND (c.status = 'verified'
           OR (c.status = 'pending' AND c.import_source IN ('import','europages')))
  ) sub;
$function$;

-- 3.2) Scheda pubblica fornitore
CREATE OR REPLACE FUNCTION public.get_supplier_profile(p_company uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', c.id,
    'name', c.legal_name,
    'logo_url', c.logo_url,
    'description', c.description,
    'supplier_type', c.supplier_type,
    'roles', coalesce((select jsonb_agg(r.role order by r.role) from company_supplier_roles r where r.company_id = c.id), '[]'::jsonb),
    'status', c.status,
    'country', c.country,
    'country_iso2', c.country_iso2,
    'city', c.city,
    'website', c.website,
    'contacts_visible', rv.ok,
    'phone', case when rv.ok then c.phone end,
    'support_email', case when rv.ok then c.support_email end,
    'contact_name', case when rv.ok then c.contact_name end,
    'address', case when rv.ok then c.address end,
    'countries_served', coalesce(c.countries_served, '{}'),
    'rating', c.rating,
    'reviews_count', c.reviews_count,
    'member_since', to_char(c.created_at, 'YYYY'),
    'site_rank', (select r.rk from (
        select id, rank() over (order by rating desc nulls last, reviews_count desc nulls last) rk
        from companies where is_supplier = true and deleted_at is null and not hidden_from_public
          and (status = 'verified' or (status = 'pending' and import_source in ('import','europages')))
      ) r where r.id = c.id),
    'suppliers_total', (select count(*) from companies where is_supplier = true and deleted_at is null and not hidden_from_public
          and (status = 'verified' or (status = 'pending' and import_source in ('import','europages')))),
    'sectors', coalesce((
      select jsonb_agg(distinct jsonb_build_object('name', s.name, 'slug', s.slug, 'icon', s.icon,
                                                   'macro', m.name, 'macro_slug', m.slug))
      from supplier_products sp
      join product_sectors ps on ps.product_id = sp.product_id
      join sectors s on s.id = ps.sector_id
      left join macro_areas m on m.id = s.macro_area_id
      where sp.supplier_company_id = c.id and sp.active
    ), '[]'::jsonb),
    'certifications', coalesce((
      select jsonb_agg(distinct cert)
      from supplier_products sp, unnest(sp.certifications) cert
      where sp.supplier_company_id = c.id and sp.active
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', p.id,
        'name', p.canonical_name,
        'e_number', p.e_number,
        'cas_number', p.cas_number,
        'grade', sp.grade,
        'min_order_kg', sp.min_order_kg,
        'lead_time_days', sp.lead_time_days,
        'certifications', coalesce(sp.certifications, '{}'),
        'best_price', case when c.manually_verified
                           then (select min(pt.price_per_kg) from price_tiers pt where pt.supplier_product_id = sp.id)
                      end,
        'has_pool', exists (select 1 from pools po where po.product_id = p.id and po.status in ('open','final_phase')),
        'sector', (select s2.name from product_sectors ps2 join sectors s2 on s2.id = ps2.sector_id
                   where ps2.product_id = p.id order by s2.name limit 1)
      ) order by p.canonical_name)
      from supplier_products sp
      join products p on p.id = sp.product_id
      where sp.supplier_company_id = c.id and sp.active
    ), '[]'::jsonb)
  )
  from companies c
  cross join lateral (
    select (public.has_confirmed_order_between(public.auth_company_id(), c.id)
            or public.auth_company_id() = c.id) as ok
  ) rv
  where c.id = p_company and public.is_visible_supplier(c.id);
$function$;

-- 3.3) Coda verifica admin (lista)
CREATE OR REPLACE FUNCTION public.admin_list_pending_suppliers()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not _is_admin() then raise exception 'NOT_ADMIN'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'legal_name', c.legal_name,
      'sector_hint', c.sector_hint,
      'country', c.country,
      'country_iso2', c.country_iso2,
      'employee_count_range', c.employee_count_range,
      'supplier_type', c.supplier_type,
      'roles', coalesce((select jsonb_agg(r.role order by r.role) from company_supplier_roles r where r.company_id = c.id), '[]'::jsonb),
      'europages_url', c.europages_url,
      'vat_pending', not c.vat_verified,
      'raw_material_supplier', coalesce(c.raw_material_supplier, false)
    ) order by c.sector_hint nulls last, c.legal_name), '[]'::jsonb)
    from companies c
    where c.status = 'pending' and c.import_source IN ('europages', 'import')
  );
end;
$function$;

-- 3.4) Coda verifica admin (dettaglio)
CREATE OR REPLACE FUNCTION public.admin_get_supplier_detail(p_company uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_result jsonb;
begin
  if not _is_admin() then raise exception 'NOT_ADMIN'; end if;

  select jsonb_build_object(
    'id', c.id,
    'legal_name', c.legal_name,
    'status', c.status,
    'import_source', c.import_source,
    'manually_verified', c.manually_verified,
    'verification_notes', c.verification_notes,
    'hidden_from_public', c.hidden_from_public,
    'hidden_reason', c.hidden_reason,
    'hidden_at', c.hidden_at,
    'vat', c.vat,
    'vat_verified', c.vat_verified,
    'vat_verification_source', c.vat_verification_source,
    'vat_verification_notes', c.vat_verification_notes,
    'ateco_code', c.ateco_code,
    'cciaa_status', c.cciaa_status,
    'country', c.country,
    'region', c.region,
    'city', c.city,
    'address', c.address,
    'latitude', c.latitude,
    'longitude', c.longitude,
    'phone', c.phone,
    'fax', c.fax,
    'website', c.website,
    'europages_url', c.europages_url,
    'linkedin_url', c.linkedin_url,
    'facebook_url', c.facebook_url,
    'contact_name', c.contact_name,
    'support_email', c.support_email,
    'email_admin', c.email_admin,
    'email_mgmt', c.email_mgmt,
    'pec', c.pec,
    'sdi', c.sdi,
    'iban_holder', c.iban_holder,
    'iban', c.iban,
    'bic', c.bic,
    'description', c.description,
    'sector_hint', c.sector_hint,
    'supplier_type', c.supplier_type,
    'roles', coalesce((select jsonb_agg(r.role order by r.role) from company_supplier_roles r where r.company_id = c.id), '[]'::jsonb),
    'raw_material_supplier', c.raw_material_supplier,
    'production_capacity', c.production_capacity,
    'countries_served', c.countries_served,
    'employee_count_range', c.employee_count_range,
    'founded_year', c.founded_year,
    'company_certifications', c.company_certifications,
    'logo_url', c.logo_url,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'candidate_products', coalesce((
      select jsonb_agg(jsonb_build_object(
               'supplier_product_id', sp.id,
               'product_id', sp.product_id,
               'product_name', pr.canonical_name,
               'active', sp.active,
               'grade', sp.grade,
               'has_price', exists (select 1 from price_tiers pt where pt.supplier_product_id = sp.id)
             ) order by pr.canonical_name)
      from supplier_products sp
      join products pr on pr.id = sp.product_id
      where sp.supplier_company_id = c.id
    ), '[]'::jsonb)
  )
  into v_result
  from companies c
  where c.id = p_company;

  if v_result is null then raise exception 'NOT_FOUND'; end if;
  return v_result;
end $function$;

-- 3.5) Candidati prodotto ("Fornitori individuati")
CREATE OR REPLACE FUNCTION public.get_product_candidate_suppliers(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'legal_name', c.legal_name,
    'country', c.country,
    'country_iso2', c.country_iso2,
    'supplier_type', c.supplier_type,
    'roles', coalesce((select jsonb_agg(r.role order by r.role) from company_supplier_roles r where r.company_id = c.id), '[]'::jsonb),
    'website', c.website,
    'logo_url', c.logo_url,
    'support_email', c.support_email
  ) order by c.legal_name), '[]'::jsonb)
  from supplier_products sp
  join companies c on c.id = sp.supplier_company_id
  where sp.product_id = p_product_id
    and sp.active = false
    and c.status <> 'verified'
    and c.is_supplier = true
    and c.deleted_at is null
    and not c.hidden_from_public;
$function$;

-- Grant (mai PUBLIC, solo authenticated come già in essere).
REVOKE EXECUTE ON FUNCTION public.get_suppliers_directory() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_supplier_profile(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_pending_suppliers() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_supplier_detail(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_product_candidate_suppliers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_suppliers_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_suppliers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_supplier_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_candidate_suppliers(uuid) TO authenticated;
