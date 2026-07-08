-- Email CLIENTE alla consegna: riepilogo + link documenti (omessi se assenti) +
-- descrittore allegato CSV (materializzato dal futuro modulo Resend). Idempotente.
CREATE OR REPLACE FUNCTION public._queue_delivery_email(p_order uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare o record; v_supplier text; v_ref text; v_links text := ''; v_cert record; v_unit text;
begin
  select ord.*, c.legal_name as buyer_name, p.canonical_name as product_name,
         p.default_unit, p.scheda_sicurezza_url as sds, p.scheda_tecnica_url as tds
    into o
  from orders ord join companies c on c.id = ord.buyer_company_id
  join products p on p.id = ord.product_id
  where ord.id = p_order;
  if not found then return; end if;
  if exists (select 1 from emails_outbox where order_id = p_order and kind = 'delivery_confirmation') then return; end if;

  select legal_name into v_supplier from companies where id = o.supplier_company_id;
  v_ref := upper(left(p_order::text, 8));
  v_unit := coalesce(o.default_unit, 'kg');

  if o.sds is not null then v_links := v_links || '<li><a href="' || o.sds || '">Scheda di sicurezza (SDS)</a></li>'; end if;
  if o.tds is not null then v_links := v_links || '<li><a href="' || o.tds || '">Scheda tecnica</a></li>'; end if;
  for v_cert in
    select cert_type, label, file_url from product_certificates
    where product_id = o.product_id and (expiry_date is null or expiry_date >= current_date)
    order by cert_type
  loop
    v_links := v_links || '<li><a href="' || v_cert.file_url || '">Certificato ' || coalesce(nullif(v_cert.label,''), v_cert.cert_type) || '</a></li>';
  end loop;
  if v_links = '' then v_links := '<li>Nessun documento disponibile per questo prodotto.</li>'; end if;

  insert into emails_outbox (kind, to_company_id, order_id, subject, body_html, body_text, attachments)
  values (
    'delivery_confirmation', o.buyer_company_id, p_order,
    'Conferma ricezione ordine ' || v_ref,
    '<p>Ciao ' || coalesce(o.buyer_name,'') || ',</p>'
      || '<p>Confermiamo la ricezione dell''ordine <b>' || v_ref || '</b>.</p>'
      || '<p><b>Prodotto ricevuto</b></p><ul>'
      || '<li>Prodotto: ' || coalesce(o.product_name,'—') || '</li>'
      || '<li>Quantità: ' || o.quantity_kg || ' ' || v_unit || '</li>'
      || '<li>Lotto: ' || coalesce(nullif(o.lot_number,''),'—') || '</li>'
      || '<li>Fornitore: ' || coalesce(v_supplier,'—') || '</li></ul>'
      || '<p>In allegato trovi un file CSV con gli stessi dati, pronto per l''import nel tuo gestionale.</p>'
      || '<p><b>Documenti</b></p><ul>' || v_links || '</ul>'
      || '<p><a href="/ordine?id=' || p_order || '">Apri l''ordine in piattaforma</a></p>',
    'Conferma ricezione ordine ' || v_ref || '. Prodotto: ' || coalesce(o.product_name,'—')
      || '; Quantità: ' || o.quantity_kg || ' ' || v_unit || '; Lotto: ' || coalesce(nullif(o.lot_number,''),'—')
      || '; Fornitore: ' || coalesce(v_supplier,'—') || '. In allegato il CSV per l''import.',
    jsonb_build_array(jsonb_build_object('type','csv','kind','delivery_items','order_id', p_order))
  );
end $function$;
REVOKE ALL ON FUNCTION public._queue_delivery_email(uuid) FROM public;

-- Email FORNITORE alla creazione ordine: etichetta QR per il DDT. Idempotente.
CREATE OR REPLACE FUNCTION public._queue_order_qr_email(p_order uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare o record; v_ref text; v_qr_url text;
begin
  select ord.id, ord.supplier_company_id, ord.receipt_token, p.canonical_name as product_name
    into o from orders ord join products p on p.id = ord.product_id where ord.id = p_order;
  if not found then return; end if;
  if exists (select 1 from emails_outbox where order_id = p_order and kind = 'order_qr_supplier') then return; end if;
  v_ref := upper(left(p_order::text, 8));
  v_qr_url := 'https://bulkstrike.com/ricezione/' || p_order || '/' || o.receipt_token;
  insert into emails_outbox (kind, to_company_id, order_id, subject, body_html, body_text, attachments)
  values (
    'order_qr_supplier', o.supplier_company_id, p_order,
    'Nuovo ordine ' || v_ref || ' — etichetta QR per il DDT',
    '<p>Hai un nuovo ordine <b>' || v_ref || '</b> (' || coalesce(o.product_name,'prodotto') || ').</p>'
      || '<p>In allegato l''etichetta QR dell''ordine. <b>Ti chiediamo di applicare questa etichetta sul DDT di spedizione.</b></p>'
      || '<p>Puoi scaricarla anche dalla tua area ordini in piattaforma.</p>',
    'Nuovo ordine ' || v_ref || '. In allegato l''etichetta QR: applicala sul DDT di spedizione. Scaricabile anche dall''area ordini.',
    jsonb_build_array(jsonb_build_object('type','qr','order_id', p_order, 'url', v_qr_url))
  );
end $function$;
REVOKE ALL ON FUNCTION public._queue_order_qr_email(uuid) FROM public;

-- Trigger: consegna → email cliente (fonte-agnostico)
CREATE OR REPLACE FUNCTION public.trg_order_delivered_email()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if new.status = 'delivered' and (old.status is distinct from 'delivered') then
    perform _queue_delivery_email(new.id);
  end if;
  return new;
end $function$;
DROP TRIGGER IF EXISTS order_delivered_email ON public.orders;
CREATE TRIGGER order_delivered_email AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_delivered_email();

-- Trigger: creazione ordine → QR al fornitore
CREATE OR REPLACE FUNCTION public.trg_order_created_qr_email()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  perform _queue_order_qr_email(new.id);
  return new;
end $function$;
DROP TRIGGER IF EXISTS order_created_qr_email ON public.orders;
CREATE TRIGGER order_created_qr_email AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_created_qr_email();
