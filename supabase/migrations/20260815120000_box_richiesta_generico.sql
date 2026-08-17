-- Box "Richiesta" generico sulla scheda prodotto: un solo modulo per tre tipi di
-- richiesta (Campione / Preventivo / Essere ricontattato), al posto del box
-- campionatura in colonna destra e del link "Richiedi un preventivo" per riga.
--
-- Cosa cambia lato dati:
--  1. supplier_contact_requests porta il tipo di richiesta e accetta messaggio vuoto
--     (nel nuovo box il messaggio e' facoltativo per tutti i tipi).
--  2. sample_requests.shipping_address diventa opzionale: il box non chiede piu'
--     ne' quantita' ne' indirizzo, i dettagli si concordano col fornitore dopo.
--  3. Il limite di 5 richieste / 24 h diventa CUMULATIVO fra i tre tipi: prima
--     campioni e preventivi avevano due contatori separati da 5 ciascuno.
--  4. Nuova RPC request_supplier_contact_bulk per l'invio in batch di
--     preventivi/contatti (l'equivalente di request_samples_bulk per i campioni).

-- ---------------------------------------------------------------- 1. schema
alter table public.supplier_contact_requests
  add column if not exists request_type text not null default 'preventivo';

alter table public.supplier_contact_requests
  drop constraint if exists supplier_contact_requests_request_type_check;
alter table public.supplier_contact_requests
  add constraint supplier_contact_requests_request_type_check
  check (request_type in ('preventivo', 'contatto'));

alter table public.supplier_contact_requests alter column message drop not null;
alter table public.sample_requests alter column shipping_address drop not null;

-- ------------------------------------------------- 2. contatore condiviso 24h
-- Unico punto di verita' del limite: campioni + preventivi + contatti insieme.
-- Ogni fornitore selezionato in un invio conta come una richiesta a se'.
create or replace function public._richieste_24h(p_company uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select (
    (select count(*) from public.sample_requests
      where buyer_company_id = p_company and created_at > now() - interval '24 hours')
    +
    (select count(*) from public.supplier_contact_requests
      where buyer_company_id = p_company and created_at > now() - interval '24 hours')
  )::int;
$$;
revoke all on function public._richieste_24h(uuid) from public, anon;
grant execute on function public._richieste_24h(uuid) to authenticated, service_role;

-- --------------------------------------------- 3. validazione richiesta campione
-- Identica a prima, tranne: il conteggio del limite ora e' quello condiviso, e
-- l'indirizzo non e' piu' obbligatorio (il box non lo chiede).
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
  v_recent    integer;
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

    -- denormalizzazione coerente, non ci si fida del client
    new.supplier_company_id := v_supplier;
    new.product_id := v_product;

    -- Le specifiche dettagliate restano solo dove servono davvero, cioe'
    -- vini e mosti sfusi. Sulle materie prime industriali basta la nota.
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

    v_recent := public._richieste_24h(new.buyer_company_id);
    if v_recent >= 5 then
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

-- ------------------------------------------- 4. campioni senza indirizzo/quantita
-- request_samples_bulk continuava a pretendere un indirizzo (dal payload o dalla
-- sede registrata). Ora che il box non lo chiede piu', se non c'e' si prosegue
-- lo stesso: i dettagli di spedizione si concordano col fornitore dopo.
create or replace function public.request_samples_bulk(payload jsonb)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_buyer   uuid := auth_company_id();
  v_qty     numeric := nullif(payload->>'quantity_l','')::numeric;
  v_addr    text := nullif(btrim(coalesce(payload->>'shipping_address','')), '');
  v_msg     text := nullif(btrim(coalesce(payload->>'note', payload->>'message', '')), '');
  v_paese   text := nullif(btrim(coalesce(payload->>'destination_country','')), '');
  v_regione text := nullif(btrim(coalesce(payload->>'destination_region','')), '');
  v_peso    numeric := coalesce(nullif((payload->>'weight_kg')::numeric, 0), _peso_campione_default());
  v_carriers jsonb := coalesce(payload->'carrier_selections', '{}'::jsonb);
  v_colore  text := nullif(payload->>'spec_colore','');
  v_lavor   text := nullif(payload->>'spec_lavorazione','');
  v_refrig  boolean := coalesce((payload->>'spec_refrigerato')::boolean, false);
  v_so2     numeric := nullif(payload->>'spec_so2_libera_mg_l','')::numeric;
  v_grado_min numeric := nullif(payload->>'spec_grado_min','')::numeric;
  v_grado_max numeric := nullif(payload->>'spec_grado_max','')::numeric;
  v_varieta text := nullif(btrim(coalesce(payload->>'spec_varieta','')), '');
  v_prezzo  numeric := nullif(payload->>'spec_prezzo_max_litro','')::numeric;
  v_denom_tipo text := nullif(payload->>'spec_denominazione_tipo','');
  v_denom      text := nullif(btrim(coalesce(payload->>'spec_denominazione','')), '');
  v_annata     smallint := nullif(payload->>'spec_annata','')::smallint;
  v_partita_hl numeric := nullif(payload->>'spec_quantita_partita_hl','')::numeric;
  v_sp_id   uuid;
  v_product uuid;
  v_supplier uuid;
  v_paese_partenza text;
  v_carrier uuid;
  v_quote   numeric;
  v_new_id  uuid;
  v_results jsonb := '[]'::jsonb;
begin
  if v_buyer is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if v_qty is not null and (v_qty <= 0 or v_qty > 20) then
    raise exception 'QUANTITA_NON_VALIDA';
  end if;

  if v_msg is not null and length(v_msg) > 2000 then
    raise exception 'NOTE_TROPPO_LUNGHE';
  end if;

  if v_peso <= 0 or v_peso > 50 then
    raise exception 'PESO_NON_VALIDO';
  end if;

  -- L'indirizzo resta utile quando c'e' (vecchio flusso con pagina di spedizione
  -- e corriere), ma non e' piu' un requisito: se manca si va avanti con null.
  if v_addr is null then
    select nullif(btrim(concat_ws(', ',
             nullif(btrim(coalesce(c.address, '')), ''),
             nullif(btrim(coalesce(c.city, '')), ''),
             nullif(btrim(coalesce(c.region, '')), ''),
             nullif(btrim(coalesce(c.country, '')), ''))), '')
    into v_addr
    from companies c where c.id = v_buyer;
  end if;

  if v_paese is null or v_regione is null then
    select coalesce(v_paese, nullif(btrim(coalesce(c.country,'')),'')),
           coalesce(v_regione, nullif(btrim(coalesce(c.region,'')),''))
      into v_paese, v_regione
    from companies c where c.id = v_buyer;
  end if;

  if payload->'supplier_product_ids' is null
     or jsonb_typeof(payload->'supplier_product_ids') <> 'array'
     or jsonb_array_length(payload->'supplier_product_ids') = 0 then
    raise exception 'NESSUN_FORNITORE_SELEZIONATO';
  end if;

  if v_colore is not null and v_colore not in ('bianco','rosato','rosso') then
    raise exception 'COLORE_NON_VALIDO';
  end if;
  if v_lavor is not null and v_lavor not in ('mosto_torbido','mosto_limpido','vnf') then
    raise exception 'LAVORAZIONE_NON_VALIDA';
  end if;
  if v_prezzo is not null and (v_prezzo <= 0 or v_prezzo > 1000) then
    raise exception 'PREZZO_NON_VALIDO';
  end if;
  if (v_grado_min is not null and (v_grado_min <= 0 or v_grado_min > 25))
     or (v_grado_max is not null and (v_grado_max <= 0 or v_grado_max > 25))
     or (v_grado_min is not null and v_grado_max is not null and v_grado_min > v_grado_max) then
    raise exception 'GRADAZIONE_NON_VALIDA';
  end if;
  if v_denom_tipo is not null and v_denom_tipo not in ('na_nc','varietale','igp','atto_dop','atto_docg') then
    raise exception 'DENOMINAZIONE_NON_VALIDA';
  end if;
  if v_annata is not null and (v_annata < 1990 or v_annata > extract(year from now())::int + 1) then
    raise exception 'ANNATA_NON_VALIDA';
  end if;
  if v_partita_hl is not null and (v_partita_hl <= 0 or v_partita_hl > 100000) then
    raise exception 'QUANTITA_PARTITA_NON_VALIDA';
  end if;

  for v_sp_id in
    select distinct jsonb_array_elements_text(payload->'supplier_product_ids')::uuid
  loop
    begin
      v_product := null; v_supplier := null; v_carrier := null; v_quote := null; v_paese_partenza := null;

      select sp.product_id, sp.supplier_company_id
        into v_product, v_supplier
      from supplier_products sp where sp.id = v_sp_id;

      if v_product is null then
        raise exception 'Listino fornitore inesistente.' using errcode = 'check_violation';
      end if;

      select c.country into v_paese_partenza from companies c where c.id = v_supplier;

      v_carrier := coalesce(
        nullif(v_carriers->>(v_sp_id::text), '')::uuid,
        nullif(v_carriers->>(v_supplier::text), '')::uuid);

      if v_carrier is not null then
        select round(r.base_fee + r.per_kg_fee * v_peso, 2) into v_quote
        from carrier_rates r
        where r.carrier_company_id = v_carrier
          and r.zone_area = v_paese_partenza
          and v_peso >= r.weight_min_kg
          and (r.weight_max_kg is null or v_peso <= r.weight_max_kg)
        order by (r.base_fee + r.per_kg_fee * v_peso) asc
        limit 1;

        if v_quote is null then
          raise exception 'Il corriere selezionato non copre la partenza dal paese del fornitore (%).', coalesce(v_paese_partenza, 'sconosciuto')
            using errcode = 'check_violation';
        end if;
      end if;

      insert into sample_requests (
        supplier_product_id, product_id, buyer_company_id, supplier_company_id,
        quantity_l, shipping_address, message, status,
        carrier_company_id, shipping_quote_amount, shipping_weight_kg,
        destination_country, destination_region,
        spec_colore, spec_lavorazione, spec_refrigerato,
        spec_so2_libera_mg_l, spec_grado_min, spec_grado_max, spec_varieta, spec_prezzo_max_litro,
        spec_denominazione_tipo, spec_denominazione, spec_annata, spec_quantita_partita_hl)
      values (
        v_sp_id, v_product, v_buyer, v_supplier,
        v_qty, v_addr, v_msg, 'pending',
        v_carrier, v_quote, v_peso,
        v_paese, v_regione,
        v_colore, v_lavor, v_refrig,
        v_so2, v_grado_min, v_grado_max, v_varieta, v_prezzo,
        v_denom_tipo, v_denom, v_annata, v_partita_hl)
      returning id into v_new_id;

      v_results := v_results || jsonb_build_object(
        'supplier_product_id', v_sp_id,
        'supplier_company_id', v_supplier,
        'status', 'created',
        'sample_request_id', v_new_id,
        'preventivo_spedizione', v_quote);

    exception when others then
      v_results := v_results || jsonb_build_object(
        'supplier_product_id', v_sp_id,
        'status', 'error',
        'error_message', sqlerrm);
    end;
  end loop;

  return v_results;
end;
$function$;
revoke all on function public.request_samples_bulk(jsonb) from public, anon;
grant execute on function public.request_samples_bulk(jsonb) to authenticated, service_role;

-- ------------------------------------ 5. email campione senza indirizzo fisso
create or replace function public.trg_sample_request_emails()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_product  text;
  v_buyer    text;
  v_supplier text;
  v_lines    text[] := array[]::text[];
  v_specs_html text := '';
  v_specs_txt  text := '';
  v_grado_label text;
  v_grado_txt   text;
  v_fmt_min text;
  v_fmt_max text;
  v_denom_txt text;
  v_partita_html text := '';
  v_partita_txt  text := '';
  v_fmt_partita text;
  v_qty_html text := '';
  v_qty_txt  text := '';
  v_addr_html text;
  v_addr_txt  text;
begin
  if not coalesce((select enabled from feature_flags where key = 'sample_request_emails'), true) then
    return new;
  end if;

  select p.canonical_name into v_product  from products  p where p.id = new.product_id;
  select c.legal_name     into v_buyer    from companies c where c.id = new.buyer_company_id;
  select c.legal_name     into v_supplier from companies c where c.id = new.supplier_company_id;

  if tg_op = 'INSERT' then
    if new.quantity_l is not null then
      v_qty_html := ' (' || trim(trailing '.' from trim(trailing '0' from to_char(new.quantity_l, 'FM990.99'))) || ' L)';
      v_qty_txt  := v_qty_html;
    end if;

    -- Il box generico non raccoglie piu' l'indirizzo: quando manca si dice
    -- esplicitamente al fornitore che va concordato, invece di lasciare il vuoto.
    if coalesce(btrim(new.shipping_address), '') = '' then
      v_addr_html := '<p>Quantita e indirizzo di spedizione non sono stati indicati: vanno concordati direttamente con il cliente.</p>';
      v_addr_txt  := 'Quantita e indirizzo di spedizione da concordare direttamente con il cliente. ';
    else
      v_addr_html := '<p>Indirizzo di spedizione:<br>' || replace(new.shipping_address, chr(10), '<br>') || '</p>';
      v_addr_txt  := 'Indirizzo: ' || new.shipping_address || '. ';
    end if;

    if new.spec_quantita_partita_hl is not null then
      v_fmt_partita := trim(trailing '.' from trim(trailing '0' from to_char(new.spec_quantita_partita_hl, 'FM999999990.99')));
      v_partita_html := '<p><b>Quantita di interesse per l''acquisto: ' || v_fmt_partita ||
        ' hl</b><br>Il campione richiesto e indipendente da questa quantita: se non hai scorta sufficiente puoi comunque rispondere indicando quanto hai disponibile.</p>';
      v_partita_txt := ' Quantita di interesse per l''acquisto: ' || v_fmt_partita ||
        ' hl (il fornitore puo rispondere indicando la quantita realmente disponibile).';
    end if;

    if new.spec_colore is not null then
      v_lines := v_lines || ('Colore: ' || initcap(new.spec_colore))::text;
    end if;
    if new.spec_lavorazione is not null then
      v_lines := v_lines || ('Lavorazione: ' || case new.spec_lavorazione
        when 'mosto_torbido' then 'Mosto torbido'
        when 'mosto_limpido' then 'Mosto limpido'
        when 'vnf'           then 'VNF (vino nuovo in fermentazione)'
        else new.spec_lavorazione end)::text;
    end if;
    if new.spec_refrigerato then
      v_lines := v_lines || 'Refrigerato: si'::text;
    end if;
    if new.spec_so2_libera_mg_l is not null then
      v_lines := v_lines || ('Solforosa libera richiesta: ' ||
        trim(trailing '.' from trim(trailing '0' from to_char(new.spec_so2_libera_mg_l, 'FM999990.99'))) || ' mg/l')::text;
    end if;

    v_grado_label := case when new.product_id = '10013620-617b-4dc4-8205-850afdce1413'
                           then 'Gradazione alcolica'
                           else 'Gradazione alcolica potenziale' end;

    if new.spec_grado_min is not null or new.spec_grado_max is not null then
      v_fmt_min := trim(trailing '.' from trim(trailing '0' from to_char(new.spec_grado_min, 'FM990.99')));
      v_fmt_max := trim(trailing '.' from trim(trailing '0' from to_char(new.spec_grado_max, 'FM990.99')));
      v_grado_txt := case
        when new.spec_grado_min is not null and new.spec_grado_max is not null then v_fmt_min || ' - ' || v_fmt_max
        when new.spec_grado_min is not null then 'da ' || v_fmt_min
        else 'fino a ' || v_fmt_max
      end;
      v_lines := v_lines || (v_grado_label || ': ' || v_grado_txt || ' % vol')::text;
    end if;

    if new.spec_varieta is not null then
      v_lines := v_lines || ('Varieta: ' || new.spec_varieta)::text;
    end if;

    if new.spec_denominazione_tipo is not null or new.spec_denominazione is not null then
      v_denom_txt := case new.spec_denominazione_tipo
        when 'na_nc'     then 'NA/NC'
        when 'varietale' then 'Varietale'
        when 'igp'       then 'IGP'
        when 'atto_dop'  then 'Atto a DOP'
        when 'atto_docg' then 'Atto a DOCG'
        else null end;
      v_lines := v_lines || ('Denominazione: ' ||
        concat_ws(' — ', v_denom_txt, new.spec_denominazione))::text;
    end if;

    if new.spec_annata is not null then
      v_lines := v_lines || ('Annata: ' || new.spec_annata)::text;
    end if;

    if new.spec_prezzo_max_litro is not null then
      v_lines := v_lines || ('Prezzo massimo indicato: ' ||
        trim(trailing '.' from trim(trailing '0' from to_char(new.spec_prezzo_max_litro, 'FM999990.99'))) || ' EUR/litro')::text;
    end if;

    if array_length(v_lines, 1) is not null then
      v_specs_html := '<p><b>Specifiche richieste</b><br>' || array_to_string(v_lines, '<br>') || '</p>';
      v_specs_txt  := ' Specifiche richieste: ' || array_to_string(v_lines, '; ') || '.';
    end if;

    perform public._queue_plain_email(
      'sample_request_supplier', new.supplier_company_id, 'acquisti',
      'Nuova richiesta di campionatura: ' || coalesce(v_product, 'prodotto'),
      '<p>' || coalesce(v_buyer, 'Un acquirente') || ' ha richiesto un campione di <b>' ||
        coalesce(v_product, 'prodotto') || '</b>' || v_qty_html || '.</p>' ||
        v_partita_html ||
        v_specs_html ||
        v_addr_html ||
        case when coalesce(new.message, '') = '' then ''
             else '<p>Messaggio:<br>' || replace(new.message, chr(10), '<br>') || '</p>' end ||
        '<p>Le spese di spedizione del campione sono a carico del cliente.</p>' ||
        '<p>Puoi accettare o rifiutare la richiesta dal tuo pannello BulkStrike.</p>',
      coalesce(v_buyer, 'Un acquirente') || ' ha richiesto un campione di ' ||
        coalesce(v_product, 'prodotto') || v_qty_txt || '.' || v_partita_txt || v_specs_txt || ' ' ||
        v_addr_txt ||
        'Le spese di spedizione sono a carico del cliente. ' ||
        'Rispondi dal tuo pannello BulkStrike.');

    perform public._queue_plain_email(
      'sample_request_buyer_ack', new.buyer_company_id, 'acquisti',
      'Richiesta di campionatura inviata: ' || coalesce(v_product, 'prodotto'),
      '<p>Abbiamo inoltrato la tua richiesta di campionatura di <b>' || coalesce(v_product, 'prodotto') ||
        '</b> a ' || coalesce(v_supplier, 'il fornitore') || '.</p>' ||
        v_partita_html ||
        v_specs_html ||
        '<p>Riceverai una comunicazione appena il fornitore risponde. ' ||
        'La campionatura e un servizio gratuito: la trattativa prosegue direttamente con il fornitore.</p>',
      'Richiesta di campionatura di ' || coalesce(v_product, 'prodotto') || ' inoltrata a ' ||
        coalesce(v_supplier, 'il fornitore') || '.' || v_partita_txt || v_specs_txt ||
        ' Riceverai una comunicazione appena risponde.');

  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'accepted' then
      perform public._queue_plain_email(
        'sample_request_accepted', new.buyer_company_id, 'acquisti',
        'Campionatura accettata: ' || coalesce(v_product, 'prodotto'),
        '<p>' || coalesce(v_supplier, 'Il fornitore') || ' ha accettato la tua richiesta di campionatura di <b>' ||
          coalesce(v_product, 'prodotto') || '</b>.</p>',
        coalesce(v_supplier, 'Il fornitore') || ' ha accettato la tua richiesta di campionatura di ' ||
          coalesce(v_product, 'prodotto') || '.');

    elsif new.status = 'shipped' then
      perform public._queue_plain_email(
        'sample_request_shipped', new.buyer_company_id, 'acquisti',
        'Campione spedito: ' || coalesce(v_product, 'prodotto'),
        '<p>' || coalesce(v_supplier, 'Il fornitore') || ' ha spedito il campione di <b>' ||
          coalesce(v_product, 'prodotto') || '</b>.</p>' ||
          case when coalesce(new.tracking_note, '') = '' then ''
               else '<p>Nota di spedizione: ' || new.tracking_note || '</p>' end,
        coalesce(v_supplier, 'Il fornitore') || ' ha spedito il campione di ' ||
          coalesce(v_product, 'prodotto') || '. ' || coalesce(new.tracking_note, ''));

    elsif new.status = 'declined' then
      perform public._queue_plain_email(
        'sample_request_declined', new.buyer_company_id, 'acquisti',
        'Campionatura non disponibile: ' || coalesce(v_product, 'prodotto'),
        '<p>' || coalesce(v_supplier, 'Il fornitore') || ' non puo dare seguito alla tua richiesta di campionatura di <b>' ||
          coalesce(v_product, 'prodotto') || '</b>.</p>' ||
          case when coalesce(new.decline_reason, '') = '' then ''
               else '<p>Motivo indicato: ' || new.decline_reason || '</p>' end,
        coalesce(v_supplier, 'Il fornitore') || ' non puo dare seguito alla richiesta di campionatura di ' ||
          coalesce(v_product, 'prodotto') || '. ' || coalesce(new.decline_reason, ''));
    end if;
  end if;

  return new;
end;
$function$;

-- ------------------------------- 6. preventivo / contatto, anche in batch
-- Un solo tipo per invio (quello scelto nella tendina), N fornitori. Come per i
-- campioni ogni fornitore e' indipendente: un errore su uno non annulla gli altri.
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
  v_product uuid := nullif(payload->>'product_id','')::uuid;
  v_buyer_name text;
  v_product_name text;
  v_target uuid;
  v_target_row companies%rowtype;
  v_new_id uuid;
  v_recent int;
  v_dup int;
  v_label text;
  v_results jsonb := '[]'::jsonb;
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
      -- Il limite e' condiviso con i campioni e va ricontrollato a ogni giro:
      -- ogni fornitore selezionato consuma una richiesta.
      v_recent := public._richieste_24h(v_buyer);
      if v_recent >= 5 then
        raise exception 'LIMITE_24H_RAGGIUNTO';
      end if;

      select * into v_target_row from companies where id = v_target and deleted_at is null;
      if v_target_row.id is null then
        raise exception 'FORNITORE_INESISTENTE';
      end if;
      if v_target = v_buyer then
        raise exception 'NON_PUOI_CONTATTARE_TE_STESSO';
      end if;

      -- Niente doppioni dello STESSO tipo allo stesso fornitore entro 30 giorni;
      -- tipi diversi restano possibili (prima un preventivo, poi un contatto).
      select count(*) into v_dup
      from supplier_contact_requests
      where buyer_company_id = v_buyer and target_company_id = v_target
        and product_id = v_product and request_type = v_type
        and created_at > now() - interval '30 days';
      if v_dup > 0 then
        raise exception 'RICHIESTA_GIA_INVIATA';
      end if;

      insert into supplier_contact_requests
        (buyer_company_id, product_id, target_company_id, message, consent, status, notified_at, request_type)
      values (v_buyer, v_product, v_target, v_msg, true, 'pending', now(), v_type)
      returning id into v_new_id;

      insert into emails_outbox (kind, to_company_id, to_email, subject, body_text, body_html, status)
      values (
        'supplier_contact_request_admin', null, 'davide@bulkstrike.com',
        '[BulkStrike] Richiesta di ' || v_label || ' — ' || coalesce(v_target_row.legal_name,'fornitore') ||
          ' (' || coalesce(v_product_name,'prodotto') || ')',
        coalesce(v_buyer_name,'Un cliente') || ' ha inviato la seguente richiesta di ' || v_label ||
          ' al fornitore ' || coalesce(v_target_row.legal_name,'—') ||
          ' per il prodotto ' || coalesce(v_product_name,'—') || '.' ||
          case when v_msg is null then '' else chr(10) || chr(10) || 'Messaggio: ' || v_msg end ||
          chr(10) || chr(10) || 'Richiesta interna #' || v_new_id,
        '<p>' || coalesce(v_buyer_name,'Un cliente') || ' ha inviato la seguente richiesta di <b>' || v_label ||
          '</b> al fornitore <b>' || coalesce(v_target_row.legal_name,'—') ||
          '</b> per il prodotto <b>' || coalesce(v_product_name,'—') || '</b>.</p>' ||
          case when v_msg is null then ''
               else '<p><b>Messaggio:</b><br>' || replace(v_msg, chr(10), '<br>') || '</p>' end ||
          '<p style="color:#888;font-size:12px">Richiesta interna #' || v_new_id || '</p>',
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

-- ------------------------- 7. la vecchia RPC singola resta, con limite condiviso
create or replace function public.request_supplier_contact(p_target_company_id uuid, p_product_id uuid, p_message text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return public.request_supplier_contact_bulk(jsonb_build_object(
    'target_company_ids', jsonb_build_array(p_target_company_id),
    'product_id', p_product_id,
    'message', p_message,
    'request_type', 'preventivo'));
end;
$function$;
revoke all on function public.request_supplier_contact(uuid, uuid, text) from public, anon;
grant execute on function public.request_supplier_contact(uuid, uuid, text) to authenticated, service_role;
