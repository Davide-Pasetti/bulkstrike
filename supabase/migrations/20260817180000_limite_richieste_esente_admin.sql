-- ============================================================================
-- LIMITE 5 RICHIESTE / 24H — esenzione per gli admin di piattaforma
--
-- Il controllo viveva duplicato in due punti (_validate_sample_request per il
-- campione, request_supplier_contact_bulk per preventivo/contatto), ognuno col
-- suo `>= 5`. Qui la decisione passa a UNA funzione, così i due percorsi non
-- possono divergere alla prossima modifica.
--
-- _richieste_24h resta un contatore onesto: continua a contare anche per gli
-- admin, semplicemente non blocca. Le richieste degli admin vengono salvate e
-- notificate come tutte le altre.
--
-- Il flag esce anche da get_product_sampling: il piede del box "Richiedi" deve
-- poter dire la verità a chi lo legge, e la verità la stabilisce il DB — un
-- controllo solo lato client non conterebbe niente comunque.
-- ============================================================================

create or replace function public._limite_richieste_esente(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select coalesce((select c.is_platform_admin from companies c where c.id = p_company), false);
$fn$;
revoke all on function public._limite_richieste_esente(uuid) from public, anon;

create or replace function public._limite_richieste_superato(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select not public._limite_richieste_esente(p_company)
     and public._richieste_24h(p_company) >= 5;
$fn$;
revoke all on function public._limite_richieste_superato(uuid) from public, anon;

-- ── Campione: il trigger usa il nuovo gate ─────────────────────────────────
-- Rispetto alla versione precedente cambia solo il blocco del limite: via la
-- variabile v_recent, dentro _limite_richieste_superato().
create or replace function public._validate_sample_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mode      text;
  v_supplier  uuid;
  v_product   uuid;
  v_active    boolean;
  v_sp_ok     boolean;
  v_prod_ok   boolean;
  v_comp_ok   boolean;
begin
  select sp.supplier_company_id, sp.product_id, sp.active, sp.samples_enabled,
         p.listing_mode, p.samples_allowed, c.samples_enabled
    into v_supplier, v_product, v_active, v_sp_ok, v_mode, v_prod_ok, v_comp_ok
  from public.supplier_products sp
  join public.products  p on p.id = sp.product_id
  join public.companies c on c.id = sp.supplier_company_id
  where sp.id = new.supplier_product_id;

  if v_supplier is null then
    raise exception 'Listino fornitore inesistente.' using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    if not v_active then
      raise exception 'Questo listino non e'' piu'' attivo.' using errcode = 'check_violation';
    end if;
    if not coalesce(v_prod_ok, true) then
      raise exception 'Per questo prodotto non e'' possibile richiedere campioni.'
        using errcode = 'check_violation';
    end if;
    if not coalesce(v_comp_ok, true) then
      raise exception 'Questo fornitore non fornisce campioni.' using errcode = 'check_violation';
    end if;
    if not coalesce(v_sp_ok, true) then
      raise exception 'Questo fornitore non fornisce campioni per questo prodotto.'
        using errcode = 'check_violation';
    end if;

    new.supplier_company_id := v_supplier;
    new.product_id := v_product;

    if v_mode is distinct from 'sample_only' then
      new.quantity_l              := null;
      new.spec_colore             := null;
      new.spec_lavorazione        := null;
      new.spec_refrigerato        := false;
      new.spec_so2_libera_mg_l    := null;
      new.spec_grado_min          := null;
      new.spec_grado_max          := null;
      new.spec_varieta            := null;
      new.spec_prezzo_max_litro   := null;
      new.spec_denominazione_tipo := null;
      new.spec_denominazione      := null;
      new.spec_annata             := null;
      new.spec_quantita_partita_hl := null;
    else
      new.quantity_l := coalesce(new.quantity_l, 0.75);
    end if;

    if new.buyer_company_id = v_supplier then
      raise exception 'Non puoi richiedere un campione a te stesso.' using errcode = 'check_violation';
    end if;

    -- Limite cumulativo 5/24h, con esenzione per gli admin di piattaforma.
    if public._limite_richieste_superato(new.buyer_company_id) then
      raise exception 'Hai raggiunto il limite di 5 richieste nelle ultime 24 ore.'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status in ('accepted','declined','shipped') then
      new.responded_at := coalesce(new.responded_at, now());
    end if;
    if new.status = 'shipped' then
      new.shipped_at := coalesce(new.shipped_at, now());
    end if;
  end if;

  return new;
end;
$function$;
revoke all on function public._validate_sample_request() from public, anon;

-- ── Preventivo/contatto: stesso gate, ricontrollato a ogni fornitore ────────
create or replace function public.request_supplier_contact_bulk(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_buyer uuid := auth_company_id();
  v_type  text := coalesce(nullif(btrim(payload->>'request_type'), ''), 'preventivo');
  v_msg   text := nullif(btrim(coalesce(payload->>'message','')), '');
  v_qta   text := nullif(btrim(coalesce(payload->>'quantita_indicativa','')), '');
  v_product uuid := nullif(payload->>'product_id','')::uuid;
  v_buyer_name text;
  v_product_name text;
  v_target uuid;
  v_target_row companies%rowtype;
  v_new_id uuid;
  v_dup int;
  v_label text;
  v_results jsonb := '[]'::jsonb;
  v_reg   boolean;
  v_dest  text;
  v_token text;
  v_unsub text;
  v_mail  jsonb;
begin
  if v_buyer is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_type not in ('preventivo','contatto') then
    raise exception 'TIPO_NON_VALIDO';
  end if;
  if v_msg is not null and length(v_msg) > 2000 then
    raise exception 'MESSAGGIO_TROPPO_LUNGO';
  end if;
  if v_qta is not null and length(v_qta) > 100 then
    raise exception 'QUANTITA_INDICATIVA_TROPPO_LUNGA';
  end if;
  if v_product is null or not exists (select 1 from products where id = v_product) then
    raise exception 'PRODOTTO_INESISTENTE';
  end if;
  if payload->'target_company_ids' is null
     or jsonb_typeof(payload->'target_company_ids') <> 'array'
     or jsonb_array_length(payload->'target_company_ids') = 0 then
    raise exception 'NESSUN_FORNITORE_SELEZIONATO';
  end if;

  v_label := case v_type when 'preventivo' then 'Preventivo' else 'Contatto' end;
  select legal_name into v_buyer_name from companies where id = v_buyer;
  select canonical_name into v_product_name from products where id = v_product;

  for v_target in
    select distinct jsonb_array_elements_text(payload->'target_company_ids')::uuid
  loop
    begin
      -- Ricontrollato a ogni giro perché ogni fornitore consuma una richiesta.
      -- Gli admin di piattaforma sono esenti.
      if public._limite_richieste_superato(v_buyer) then
        raise exception 'LIMITE_24H_RAGGIUNTO';
      end if;

      select * into v_target_row from companies where id = v_target and deleted_at is null;
      if v_target_row.id is null then
        raise exception 'FORNITORE_INESISTENTE';
      end if;
      if v_target = v_buyer then
        raise exception 'NON_PUOI_CONTATTARE_TE_STESSO';
      end if;

      select count(*) into v_dup
      from supplier_contact_requests
      where buyer_company_id = v_buyer and target_company_id = v_target
        and product_id = v_product and request_type = v_type
        and created_at > now() - interval '30 days';
      if v_dup > 0 then
        raise exception 'RICHIESTA_GIA_INVIATA';
      end if;

      insert into supplier_contact_requests
        (buyer_company_id, product_id, target_company_id, message, consent, status, notified_at, request_type, quantita_indicativa)
      values (v_buyer, v_product, v_target, v_msg, true, 'pending', now(), v_type, v_qta)
      returning id into v_new_id;

      v_reg   := public._company_registrata(v_target);
      v_dest  := public.resolve_company_email(v_target, 'acquisti');
      v_token := public._unsubscribe_token(v_dest);
      v_unsub := case when v_token is null then null
                      else 'https://www.bulkstrike.com/disiscrizione?t=' || v_token end;
      v_mail := public.email_richiesta_render(
        v_type, v_target_row.legal_name, v_product_name, v_buyer_name, v_msg,
        null, null, v_reg, v_unsub, 'it', v_qta);

      perform public._queue_plain_email(
        'supplier_contact_request_' || v_type, v_target, 'acquisti',
        v_mail->>'subject', v_mail->>'html', v_mail->>'text');

      insert into emails_outbox (kind, to_company_id, to_email, subject, body_text, body_html, status)
      values (
        'supplier_contact_request_admin', null, 'davide@bulkstrike.com',
        '[BulkStrike] Richiesta di ' || v_label || ' - ' || coalesce(v_target_row.legal_name,'fornitore') ||
          ' (' || coalesce(v_product_name,'prodotto') || ')',
        coalesce(v_buyer_name,'Un cliente') || ' ha inviato la seguente richiesta di ' || v_label ||
          ' al fornitore ' || coalesce(v_target_row.legal_name,'-') ||
          ' per il prodotto ' || coalesce(v_product_name,'-') || '.' ||
          case when v_qta is null then '' else chr(10) || 'Quantita indicativa: ' || v_qta end ||
          case when v_msg is null then '' else chr(10) || chr(10) || 'Messaggio: ' || v_msg end ||
          chr(10) || chr(10) || 'Inviata a: ' || coalesce(v_dest, 'nessun indirizzo noto') ||
          chr(10) || 'Richiesta interna #' || v_new_id,
        '<p>' || coalesce(v_buyer_name,'Un cliente') || ' ha inviato la seguente richiesta di <b>' || v_label ||
          '</b> al fornitore <b>' || coalesce(v_target_row.legal_name,'-') ||
          '</b> per il prodotto <b>' || coalesce(v_product_name,'-') || '</b>.</p>' ||
          case when v_qta is null then '' else '<p>Quantita indicativa: <b>' || v_qta || '</b></p>' end ||
          case when v_msg is null then ''
               else '<p><b>Messaggio:</b><br>' || replace(v_msg, chr(10), '<br>') || '</p>' end ||
          '<p style="color:#888;font-size:12px">Inviata a: ' || coalesce(v_dest, 'nessun indirizzo noto') ||
          '<br>Richiesta interna #' || v_new_id || '</p>',
        'queued');

      v_results := v_results || jsonb_build_object(
        'target_company_id', v_target, 'status', 'created', 'request_id', v_new_id);
    exception when others then
      v_results := v_results || jsonb_build_object(
        'target_company_id', v_target, 'status', 'error', 'error_message', sqlerrm);
    end;
  end loop;

  return v_results;
end;
$function$;
revoke all on function public.request_supplier_contact_bulk(jsonb) from public, anon;
grant execute on function public.request_supplier_contact_bulk(jsonb) to authenticated, service_role;

-- ── Il flag arriva al frontend ─────────────────────────────────────────────
-- get_product_sampling resta eseguibile da anon come la sua gemella
-- get_product_suppliers_for_sampling: la scheda prodotto è pubblica. Per un
-- anonimo auth_company_id() è null e limite_esente viene false.
create or replace function public.get_product_sampling(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_nome text; v_mode text; v_ok boolean; v_forn jsonb;
  v_esente boolean := public._limite_richieste_esente(auth_company_id());
begin
  select p.canonical_name, p.listing_mode, p.samples_allowed
    into v_nome, v_mode, v_ok
  from products p where p.id = p_product_id;

  if v_nome is null then
    return jsonb_build_object(
      'consentito', false,
      'motivo', 'PRODOTTO_INESISTENTE',
      'messaggio', 'Prodotto non trovato: la richiesta di campioni non e'' disponibile.',
      'richiede_specifiche', false,
      'limite_24h', 5,
      'limite_esente', v_esente,
      'fornitori', '[]'::jsonb,
      'totale_fornitori', 0);
  end if;

  if not coalesce(v_ok, false) then
    return jsonb_build_object(
      'consentito', false,
      'motivo', 'MERCE_NON_CAMPIONABILE',
      'messaggio', 'Per questa merce non e'' possibile richiedere campioni per vincoli di trasporto o sicurezza.',
      'richiede_specifiche', false,
      'limite_24h', 5,
      'limite_esente', v_esente,
      'fornitori', '[]'::jsonb,
      'totale_fornitori', 0);
  end if;

  v_forn := public.get_product_suppliers_for_sampling(p_product_id);

  return jsonb_build_object(
    'consentito', jsonb_array_length(v_forn) > 0,
    'motivo', case when jsonb_array_length(v_forn) = 0 then 'NESSUN_FORNITORE_DISPONIBILE' end,
    'messaggio', case when jsonb_array_length(v_forn) = 0
                      then 'Nessun fornitore di questo prodotto fornisce campioni al momento.' end,
    'richiede_specifiche', (v_mode = 'sample_only'),
    'limite_24h', 5,
    'limite_esente', v_esente,
    'fornitori', v_forn,
    'totale_fornitori', jsonb_array_length(v_forn));
end;
$function$;
revoke all on function public.get_product_sampling(uuid) from public;
grant execute on function public.get_product_sampling(uuid) to anon, authenticated, service_role;
