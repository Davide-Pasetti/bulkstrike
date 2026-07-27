-- DAV-33-bis (seguito): il dettaglio admin espone anche lo stato di
-- occultamento, così il toggle "Nascondi/Ripristina" nel pannello mostra la
-- verità del DB. Stessa funzione di prima + 3 campi (hidden_from_public,
-- hidden_reason, hidden_at). Re-grant nella stessa migration (regola di casa).
create or replace function public.admin_get_supplier_detail(p_company uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
end $$;
revoke execute on function public.admin_get_supplier_detail(uuid) from public, anon;
grant execute on function public.admin_get_supplier_detail(uuid) to authenticated, service_role;
