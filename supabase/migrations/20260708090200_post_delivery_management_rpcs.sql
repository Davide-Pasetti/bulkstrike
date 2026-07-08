-- Chi può gestire i documenti di un prodotto: admin OPPURE un fornitore con una
-- variante attiva di quel prodotto.
CREATE OR REPLACE FUNCTION public._can_manage_product_docs(p_product uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM companies WHERE id = auth_company_id() AND is_platform_admin)
      OR EXISTS (SELECT 1 FROM supplier_products sp WHERE sp.product_id = p_product
                 AND sp.supplier_company_id = auth_company_id() AND sp.active);
$function$;

CREATE OR REPLACE FUNCTION public.set_product_documents(p_product uuid, p_sds text, p_tds text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if auth_company_id() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not _can_manage_product_docs(p_product) then raise exception 'NOT_ALLOWED'; end if;
  update products set scheda_sicurezza_url = nullif(p_sds,''), scheda_tecnica_url = nullif(p_tds,'') where id = p_product;
  if not found then raise exception 'UNKNOWN_PRODUCT'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.add_product_certificate(p_product uuid, p_cert_type text, p_label text, p_file_url text, p_expiry date)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if auth_company_id() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not _can_manage_product_docs(p_product) then raise exception 'NOT_ALLOWED'; end if;
  if p_cert_type not in ('alimentare','iso','bio','kosher','halal','altro') then raise exception 'INVALID_CERT_TYPE'; end if;
  if coalesce(p_file_url,'') = '' then raise exception 'FILE_REQUIRED'; end if;
  insert into product_certificates (product_id, cert_type, label, file_url, expiry_date)
  values (p_product, p_cert_type, nullif(p_label,''), p_file_url, p_expiry) returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.delete_product_certificate(p_cert_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_product uuid;
begin
  select product_id into v_product from product_certificates where id = p_cert_id;
  if v_product is null then return; end if;
  if not _can_manage_product_docs(v_product) then raise exception 'NOT_ALLOWED'; end if;
  delete from product_certificates where id = p_cert_id;
end $function$;

-- Il fornitore dell'ordine imposta il numero di lotto.
CREATE OR REPLACE FUNCTION public.set_order_lot(p_order uuid, p_lot text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if auth_company_id() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update orders set lot_number = nullif(p_lot,'') where id = p_order and supplier_company_id = auth_company_id();
  if not found then raise exception 'NOT_YOUR_ORDER'; end if;
end $function$;

-- Admin: reinvio manuale (rimette in coda) + elenco email di un ordine.
CREATE OR REPLACE FUNCTION public.admin_resend_order_email(p_order uuid, p_kind text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from companies where id = auth_company_id() and is_platform_admin) then raise exception 'NOT_ADMIN'; end if;
  update emails_outbox set status = 'queued', sent_at = null where order_id = p_order and kind = p_kind;
  if not found then raise exception 'EMAIL_NOT_FOUND'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_list_order_emails(p_order uuid)
 RETURNS TABLE (id uuid, kind text, subject text, status text, created_at timestamptz, sent_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from companies where id = auth_company_id() and is_platform_admin) then raise exception 'NOT_ADMIN'; end if;
  return query select e.id, e.kind, e.subject, e.status, e.created_at, e.sent_at
    from emails_outbox e where e.order_id = p_order order by e.created_at desc;
end $function$;

REVOKE ALL ON FUNCTION public.set_product_documents(uuid,text,text) FROM public;
REVOKE ALL ON FUNCTION public.add_product_certificate(uuid,text,text,text,date) FROM public;
REVOKE ALL ON FUNCTION public.delete_product_certificate(uuid) FROM public;
REVOKE ALL ON FUNCTION public.set_order_lot(uuid,text) FROM public;
REVOKE ALL ON FUNCTION public.admin_resend_order_email(uuid,text) FROM public;
REVOKE ALL ON FUNCTION public.admin_list_order_emails(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.set_product_documents(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_product_certificate(uuid,text,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_product_certificate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_lot(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resend_order_email(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_order_emails(uuid) TO authenticated;

-- Storage: upload/update nel bucket product-docs per autenticati (read pubblica dal bucket).
DROP POLICY IF EXISTS "product-docs insert" ON storage.objects;
CREATE POLICY "product-docs insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-docs');
DROP POLICY IF EXISTS "product-docs update" ON storage.objects;
CREATE POLICY "product-docs update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-docs');
