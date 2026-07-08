-- Sezione admin "Fornitori da verificare": lista + conteggio badge + azioni
-- (verifica/scarta), singole o bulk. Tutte gated su _is_admin(). Le mutazioni
-- sono ristrette a status='pending' AND import_source='europages': questa sezione
-- non può mai toccare aziende reali/verificate. Nessun automatismo: 'verified'
-- avviene solo su azione esplicita dell'admin. suppliers_public NON è modificata
-- (mostra is_supplier=true AND status='verified'; i pending hanno già is_supplier=true).

CREATE OR REPLACE FUNCTION public.admin_list_pending_suppliers()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not _is_admin() then raise exception 'NOT_ADMIN'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'legal_name', c.legal_name,
      'sector_hint', c.sector_hint,
      'country', c.country,
      'employee_count_range', c.employee_count_range,
      'supplier_type', c.supplier_type,
      'europages_url', c.europages_url,
      'vat_pending', not c.vat_verified,
      'raw_material_supplier', coalesce(c.raw_material_supplier, false)
    ) order by c.sector_hint nulls last, c.legal_name), '[]'::jsonb)
    from companies c
    where c.status = 'pending' and c.import_source = 'europages'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_count_pending_suppliers()
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not _is_admin() then return 0; end if;
  return (select count(*)::int from companies
          where status = 'pending' and import_source = 'europages');
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_verify_suppliers(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  if not _is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then return 0; end if;
  update companies set status = 'verified', updated_at = now()
  where id = any(p_ids) and status = 'pending' and import_source = 'europages';
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_discard_suppliers(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  if not _is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then return 0; end if;
  delete from companies
  where id = any(p_ids) and status = 'pending' and import_source = 'europages';
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_pending_suppliers() FROM public;
REVOKE ALL ON FUNCTION public.admin_count_pending_suppliers() FROM public;
REVOKE ALL ON FUNCTION public.admin_verify_suppliers(uuid[]) FROM public;
REVOKE ALL ON FUNCTION public.admin_discard_suppliers(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_suppliers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_count_pending_suppliers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_suppliers(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_discard_suppliers(uuid[]) TO authenticated;
