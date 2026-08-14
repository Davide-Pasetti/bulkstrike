-- Aggiunge registration_macro_area_id (macro-area scelta in registrazione) alle
-- RPC di creazione azienda. Parsing sicuro + verifica esistenza in macro_areas.
-- I grant vengono riapplicati (CREATE OR REPLACE li resetta).

create or replace function public.register_company(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid          uuid := auth.uid();
  new_company  uuid;
  v_type       text := coalesce(nullif(payload->>'account_type',''), case when (payload->>'is_supplier')::boolean then 'supplier' else 'buyer' end);
  is_supplier  boolean := v_type = 'supplier';
  is_carrier   boolean := v_type = 'carrier';
  is_buyer     boolean := true;
  mat          jsonb;
  pid          uuid;
  sec_text     text;
  sid          uuid;
  v_macro      uuid;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if exists (select 1 from profiles where id = uid and company_id is not null) then
    raise exception 'ALREADY_REGISTERED';
  end if;

  -- macro-area di registrazione: parsing sicuro, ignorata se non valida/inesistente
  begin
    v_macro := nullif(payload->>'registration_macro_area_id','')::uuid;
  exception when others then
    v_macro := null;
  end;
  if v_macro is not null and not exists (select 1 from macro_areas where id = v_macro) then
    v_macro := null;
  end if;

  insert into companies (
    legal_name, vat, country, city, address, phone, website, contact_name,
    is_buyer, is_supplier, is_carrier, supplier_type, carrier_pricing_mode, carrier_lead_time_days,
    email_mgmt, email_admin, pec, sdi,
    erp_system, erp_system_other,
    iban_holder, iban, bic, production_capacity, countries_served,
    registration_macro_area_id,
    status
  ) values (
    payload->>'legal_name',
    nullif(payload->>'vat',''),
    coalesce(nullif(payload->>'country',''), 'Italia'),
    nullif(payload->>'city',''),
    nullif(payload->>'address',''),
    nullif(payload->>'phone',''),
    nullif(payload->>'website',''),
    nullif(payload->>'contact_name',''),
    is_buyer,
    is_supplier,
    is_carrier,
    case when is_supplier then nullif(payload->>'supplier_type','')::supplier_type else null end,
    case when is_carrier then coalesce(nullif(payload->>'carrier_pricing_mode',''), 'zone') else null end,
    case when is_carrier then nullif(payload->>'carrier_lead_time_days','')::integer else null end,
    nullif(payload->>'email_mgmt',''),
    nullif(payload->>'email_admin',''),
    nullif(payload->>'pec',''),
    nullif(payload->>'sdi',''),
    nullif(payload->>'erp_system',''),
    case when payload->>'erp_system' = 'Altro' then nullif(payload->>'erp_system_other','') else null end,
    case when is_supplier or is_carrier then nullif(payload->>'iban_holder','') else null end,
    case when is_supplier or is_carrier then nullif(payload->>'iban','')        else null end,
    case when is_supplier or is_carrier then nullif(payload->>'bic','')         else null end,
    case when is_supplier then nullif(payload->>'production_capacity','') else null end,
    case when is_supplier
         then coalesce((select array_agg(value) from jsonb_array_elements_text(payload->'countries_served')), '{}')
         else '{}' end,
    v_macro,
    case when is_supplier or is_carrier then 'pending'::company_status else 'verified'::company_status end
  )
  returning id into new_company;

  insert into profiles (id, company_id, full_name, email, role)
  values (uid, new_company, nullif(payload->>'contact_name',''), payload->>'email', 'owner')
  on conflict (id) do update set company_id = excluded.company_id;

  for mat in select * from jsonb_array_elements(coalesce(payload->'materials', '[]'::jsonb))
  loop
    pid := (select id from products where lower(canonical_name) = lower(mat->>'name') limit 1);
    if pid is null then
      pid := (select product_id from product_synonyms where lower(synonym) = lower(mat->>'name') limit 1);
    end if;

    insert into watched_materials (
      company_id, product_id, custom_name,
      alert_pool, alert_price, alert_new_supplier, alert_closing, alert_request, alert_outbid
    ) values (
      new_company, pid, case when pid is null then mat->>'name' else null end,
      coalesce((mat->>'alert_pool')::boolean, true), coalesce((mat->>'alert_price')::boolean, false),
      coalesce((mat->>'alert_new_supplier')::boolean, false), coalesce((mat->>'alert_closing')::boolean, true),
      coalesce((mat->>'alert_request')::boolean, false), coalesce((mat->>'alert_outbid')::boolean, false)
    )
    on conflict do nothing;
  end loop;

  for sec_text in select * from jsonb_array_elements_text(coalesce(payload->'sectors', '[]'::jsonb))
  loop
    begin
      sid := sec_text::uuid;
    exception when others then
      sid := null;
    end;

    continue when sid is null;
    continue when not exists (select 1 from sectors where id = sid);

    insert into sector_follows (buyer_company_id, sector_id)
    values (new_company, sid)
    on conflict (buyer_company_id, sector_id) do nothing;

    insert into product_follows (buyer_company_id, product_id)
    select new_company, ps.product_id
    from product_sectors ps
    where ps.sector_id = sid
    on conflict (buyer_company_id, product_id) do nothing;

    insert into supplier_follows (buyer_company_id, supplier_company_id)
    select new_company, sp.supplier_company_id
    from supplier_products sp
    join product_sectors ps on ps.product_id = sp.product_id
    where ps.sector_id = sid and sp.active = true
    on conflict (buyer_company_id, supplier_company_id) do nothing;
  end loop;

  return new_company;
end;
$function$;

create or replace function public.complete_claimed_company(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_company uuid;
  mat jsonb;
  pid uuid;
  v_macro uuid;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select company_id into v_company from profiles where id = uid;
  if v_company is null then raise exception 'NO_COMPANY_LINKED'; end if;

  if not exists (select 1 from companies
                  where id = v_company and claim_status = 'approved'
                    and claimed_by_profile_id = uid and deleted_at is null) then
    raise exception 'NOT_CLAIMED_BY_YOU';
  end if;

  begin
    v_macro := nullif(payload->>'registration_macro_area_id','')::uuid;
  exception when others then
    v_macro := null;
  end;
  if v_macro is not null and not exists (select 1 from macro_areas where id = v_macro) then
    v_macro := null;
  end if;

  update companies set
    email_mgmt  = coalesce(nullif(payload->>'email_mgmt',''),  email_mgmt),
    email_admin = coalesce(nullif(payload->>'email_admin',''), email_admin),
    pec         = coalesce(nullif(payload->>'pec',''),         pec),
    sdi         = coalesce(nullif(payload->>'sdi',''),         sdi),
    iban_holder = coalesce(nullif(payload->>'iban_holder',''), iban_holder),
    iban        = coalesce(nullif(payload->>'iban',''),        iban),
    bic         = coalesce(nullif(payload->>'bic',''),         bic),
    production_capacity = coalesce(nullif(payload->>'production_capacity',''), production_capacity),
    countries_served = case
      when jsonb_array_length(coalesce(payload->'countries_served','[]'::jsonb)) > 0
      then (select array_agg(value) from jsonb_array_elements_text(payload->'countries_served'))
      else countries_served end,
    contact_name = coalesce(nullif(payload->>'contact_name',''), contact_name),
    registration_macro_area_id = coalesce(v_macro, registration_macro_area_id),
    updated_at = now()
  where id = v_company;

  update profiles
     set full_name = coalesce(nullif(payload->>'contact_name',''), full_name),
         email = coalesce(nullif(payload->>'email',''), email)
   where id = uid;

  for mat in select * from jsonb_array_elements(coalesce(payload->'materials', '[]'::jsonb))
  loop
    pid := (select id from products where lower(canonical_name) = lower(mat->>'name') limit 1);
    if pid is null then
      pid := (select product_id from product_synonyms where lower(synonym) = lower(mat->>'name') limit 1);
    end if;
    insert into watched_materials (
      company_id, product_id, custom_name,
      alert_pool, alert_price, alert_new_supplier, alert_closing, alert_request, alert_outbid
    ) values (
      v_company, pid, case when pid is null then mat->>'name' else null end,
      coalesce((mat->>'alert_pool')::boolean, true), coalesce((mat->>'alert_price')::boolean, false),
      coalesce((mat->>'alert_new_supplier')::boolean, false), coalesce((mat->>'alert_closing')::boolean, false),
      coalesce((mat->>'alert_request')::boolean, false), coalesce((mat->>'alert_outbid')::boolean, false)
    ) on conflict do nothing;
  end loop;

  return v_company;
end $function$;

revoke all on function public.register_company(jsonb) from public, anon;
grant execute on function public.register_company(jsonb) to authenticated, service_role;
revoke all on function public.complete_claimed_company(jsonb) from public, anon;
grant execute on function public.complete_claimed_company(jsonb) to authenticated, service_role;
