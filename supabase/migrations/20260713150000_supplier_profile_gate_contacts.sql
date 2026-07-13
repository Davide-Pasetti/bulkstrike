-- Scheda profilo fornitore: i contatti diretti (phone/support_email/contact_name/
-- address) sono visibili SOLO se esiste un ordine confermato tra le due aziende
-- (riusa has_confirmed_order_between) o se il fornitore guarda la propria scheda.
-- I dati fiscali (vat/pec/sdi) NON vengono più restituiti da questo endpoint
-- pubblico in nessun caso: se servono (es. fatturazione di un ordine reale) devono
-- passare da un endpoint dedicato a quel flusso, non dalla scheda vetrina.
create or replace function public.get_supplier_profile(p_company uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.legal_name,
    'logo_url', c.logo_url,
    'description', c.description,
    'supplier_type', c.supplier_type,
    'status', c.status,
    'country', c.country,
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
        from companies where is_supplier = true and status = 'verified'
      ) r where r.id = c.id),
    'suppliers_total', (select count(*) from companies where is_supplier = true and status = 'verified'),
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
        'best_price', (select min(pt.price_per_kg) from price_tiers pt where pt.supplier_product_id = sp.id),
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
  where c.id = p_company and c.is_supplier = true and c.status = 'verified';
$$;
