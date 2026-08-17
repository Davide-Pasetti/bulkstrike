-- ============================================================================
-- QUANTITÀ INDICATIVA nella riga di apertura dell'email
--
-- L'apertura diventa comune ai tre tipi: "vi contatto perché sono interessato
-- all'acquisto di {quantità} {prodotto}." La quantità è un campo a sé nel box
-- "Richiesta", non una frase da indovinare dentro il messaggio libero; se manca,
-- {quantita} sparisce e la frase si chiude sul solo nome del prodotto.
-- Il preventivo perde "quantità minima ordinabile": ora la quantità la diciamo
-- noi in apertura.
--
-- Testo libero e non numero+unità: "1000 kg", "2 pallet", "un autotreno" sono
-- tutte risposte legittime e finiscono comunque dentro una frase, non in un
-- calcolo. Limite 100 caratteri perché è una riga di lettera, non un campo note.
-- ============================================================================

alter table public.sample_requests            add column if not exists quantita_indicativa text;
alter table public.supplier_contact_requests  add column if not exists quantita_indicativa text;
comment on column public.sample_requests.quantita_indicativa is
  'Quantita che interessa al cliente, testo libero come lo scrive lui ("1000 kg"). Va nella riga di apertura dell''email al fornitore. Da non confondere con quantity_l, che e'' il volume del campione.';
comment on column public.supplier_contact_requests.quantita_indicativa is
  'Quantita che interessa al cliente, testo libero come lo scrive lui ("1000 kg"). Va nella riga di apertura dell''email al fornitore.';

-- ── Testi ───────────────────────────────────────────────────────────────────
create or replace function public.email_richiesta_testi(p_lingua text default 'it')
returns jsonb
language sql
immutable
as $fn$
  -- Un solo dizionario finché la lingua è una. Per aggiungere l'inglese basta
  -- avvolgere il tutto in un case su p_lingua.
  select jsonb_build_object(
      'oggetto_campione',   $t$Richiesta di campionatura$t$,
      'oggetto_preventivo', $t$Richiesta di preventivo$t$,
      'oggetto_contatto',   $t$Richiesta di contatto$t$,
      'saluto',             $t$Buongiorno {fornitore},$t$,
      'interesse',          $t$vi contatto perché sono interessato all'acquisto di {quantita}{prodotto}.$t$,
      'richiesta_campione', $t$Con la presente si chiede gentilmente la disponibilità all'invio di un campione del prodotto, al fine di valutarne le caratteristiche tecniche e la conformità alle nostre specifiche.$t$,
      'richiesta_preventivo', $t$Con la presente si chiede gentilmente di ricevere un preventivo per la fornitura del prodotto in oggetto, con indicazione di prezzo, tempi di consegna e condizioni di pagamento.$t$,
      'richiesta_contatto', $t$Con la presente si chiede gentilmente di essere ricontattati per valutare insieme una possibile fornitura del prodotto in oggetto.$t$,
      'note',               $t$Note del cliente: {messaggio}$t$,
      'specifiche_titolo',  $t$Specifiche richieste$t$,
      'spese_campione',     $t$Le spese di spedizione del campione sono a carico del cliente. I dettagli di spedizione (quantità, indirizzo) verranno concordati direttamente con il cliente dopo l'accettazione della richiesta.$t$,
      'pannello',           $t$Puoi accettare o rifiutare la richiesta dal tuo pannello BulkStrike.$t$,
      'chiusura',           $t$Restando in attesa di un Vostro cortese riscontro, porgo cordiali saluti.$t$,
      'piede_generata',     $t$Questa email è stata generata da un agente AI del sito BulkStrike.com per conto di {cliente}.$t$,
      'piede_iscrizione',   $t$Vi invitiamo a iscrivervi al link {url_registrati} per ricevere direttamente le richieste dai clienti.$t$,
      'piede_info',         $t$Per maggiori informazioni scrivere alla mail davide@bulkstrike.com.$t$,
      'piede_disiscrizione_html', $t$Se non si desidera più ricevere email, <a href="{url_unsub}" style="color:#64748B">cliccare qui</a>.$t$,
      'piede_disiscrizione_txt',  $t$Se non si desidera più ricevere email: {url_unsub}$t$
  );
$fn$;
revoke all on function public.email_richiesta_testi(text) from public, anon;

-- ── Render: nuovo parametro p_quantita ──────────────────────────────────────
-- Il drop serve perché aggiungere un parametro a un CREATE OR REPLACE creerebbe
-- un OVERLOAD, lasciando in giro anche la vecchia versione a 10 argomenti.
drop function if exists public.email_richiesta_render(text,text,text,text,text,text,text,boolean,text,text);

create or replace function public.email_richiesta_render(
  p_tipo            text,
  p_fornitore       text,
  p_prodotto        text,
  p_cliente         text,
  p_messaggio       text default null,
  p_specifiche_html text default null,
  p_specifiche_txt  text default null,
  p_registrato      boolean default false,
  p_unsub_url       text default null,
  p_lingua          text default 'it',
  p_quantita        text default null
) returns jsonb
language plpgsql
immutable
as $fn$
declare
  t        jsonb := public.email_richiesta_testi(p_lingua);
  v_forn   text := coalesce(nullif(btrim(coalesce(p_fornitore, '')), ''), 'Spett.le Azienda');
  v_prod   text := coalesce(nullif(btrim(coalesce(p_prodotto, '')), ''), 'prodotto');
  v_cli    text := coalesce(nullif(btrim(coalesce(p_cliente, '')), ''), 'un cliente BulkStrike');
  v_msg    text := nullif(btrim(coalesce(p_messaggio, '')), '');
  v_qta    text := nullif(btrim(coalesce(p_quantita, '')), '');
  v_reg    boolean := coalesce(p_registrato, false);
  v_apertura text;
  v_corpo  text;
  v_ogg    text;
  v_html   text;
  v_txt    text;
  v_piede_html text;
  v_piede_txt  text;
  v_note_txt   text;
begin
  v_ogg := case p_tipo
             when 'campione'   then t->>'oggetto_campione'
             when 'preventivo' then t->>'oggetto_preventivo'
             else                   t->>'oggetto_contatto'
           end || ' — ' || v_prod;

  -- Quantità facoltativa: se manca, {quantita} sparisce e non resta un doppio
  -- spazio in mezzo alla frase.
  v_apertura := replace(
                  replace(t->>'interesse', '{quantita}', case when v_qta is null then '' else v_qta || ' ' end),
                  '{prodotto}', v_prod);

  v_corpo := case p_tipo
               when 'campione'   then t->>'richiesta_campione'
               when 'preventivo' then t->>'richiesta_preventivo'
               else                   t->>'richiesta_contatto'
             end;

  v_note_txt := case when v_msg is null then null
                     else replace(t->>'note', '{messaggio}', v_msg) end;

  v_html :=
    '<p>' || replace(t->>'saluto', '{fornitore}', v_forn) || '</p>' ||
    '<p>' || v_apertura || '</p>' ||
    '<p>' || v_corpo || '</p>' ||
    coalesce(p_specifiche_html, '') ||
    case when v_note_txt is null then ''
         else '<p>' || replace(v_note_txt, chr(10), '<br>') || '</p>' end ||
    case when p_tipo = 'campione' then '<p>' || (t->>'spese_campione') || '</p>' else '' end ||
    case when p_tipo = 'campione' and v_reg then '<p>' || (t->>'pannello') || '</p>' else '' end ||
    '<p>' || (t->>'chiusura') || '</p>';

  v_txt :=
    replace(t->>'saluto', '{fornitore}', v_forn) || chr(10) || chr(10) ||
    v_apertura || chr(10) || chr(10) ||
    v_corpo || chr(10) || chr(10) ||
    coalesce(p_specifiche_txt || chr(10) || chr(10), '') ||
    coalesce(v_note_txt || chr(10) || chr(10), '') ||
    case when p_tipo = 'campione' then (t->>'spese_campione') || chr(10) || chr(10) else '' end ||
    case when p_tipo = 'campione' and v_reg then (t->>'pannello') || chr(10) || chr(10) else '' end ||
    (t->>'chiusura');

  v_piede_html :=
    '<p>' || replace(t->>'piede_generata', '{cliente}', v_cli) || '</p>' ||
    case when v_reg then ''
         else '<p>' || replace(t->>'piede_iscrizione', '{url_registrati}',
              '<a href="https://www.bulkstrike.com/registrati" style="color:#64748B">https://www.bulkstrike.com/registrati</a>') || '</p>' end ||
    '<p>' || (t->>'piede_info') || '</p>' ||
    case when p_unsub_url is null then ''
         else '<p>' || replace(t->>'piede_disiscrizione_html', '{url_unsub}', p_unsub_url) || '</p>' end;

  v_piede_txt :=
    replace(t->>'piede_generata', '{cliente}', v_cli) || chr(10) ||
    case when v_reg then ''
         else replace(t->>'piede_iscrizione', '{url_registrati}', 'https://www.bulkstrike.com/registrati') || chr(10) end ||
    (t->>'piede_info') ||
    case when p_unsub_url is null then ''
         else chr(10) || replace(t->>'piede_disiscrizione_txt', '{url_unsub}', p_unsub_url) end;

  return jsonb_build_object(
    'subject', v_ogg,
    'html', v_html ||
      '<hr style="border:none;border-top:1px solid #E2E8F0;margin:22px 0 12px">' ||
      '<div style="font-size:11.5px;line-height:1.6;color:#94A3B8">' || v_piede_html || '</div>',
    'text', v_txt || chr(10) || chr(10) || '---' || chr(10) || v_piede_txt
  );
end;
$fn$;
revoke all on function public.email_richiesta_render(text,text,text,text,text,text,text,boolean,text,text,text) from public, anon;

-- ── Chiamanti: salvano la quantità e la passano al render ───────────────────
-- Rispetto alle versioni precedenti cambiano solo tre cose in ciascuna:
-- lettura di quantita_indicativa dal payload, colonna in insert, e ultimo
-- argomento di email_richiesta_render.

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
  v_qta_ind text := nullif(btrim(coalesce(payload->>'quantita_indicativa','')), '');
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
  -- Testo libero, ma finisce dentro una frase dell'email: un romanzo la
  -- renderebbe illeggibile.
  if v_qta_ind is not null and length(v_qta_ind) > 100 then
    raise exception 'QUANTITA_INDICATIVA_TROPPO_LUNGA';
  end if;
  if v_peso <= 0 or v_peso > 50 then
    raise exception 'PESO_NON_VALIDO';
  end if;

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
      select sp.product_id, sp.supplier_company_id into v_product, v_supplier
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
        quantity_l, shipping_address, message, status, quantita_indicativa,
        carrier_company_id, shipping_quote_amount, shipping_weight_kg,
        destination_country, destination_region,
        spec_colore, spec_lavorazione, spec_refrigerato,
        spec_so2_libera_mg_l, spec_grado_min, spec_grado_max, spec_varieta, spec_prezzo_max_litro,
        spec_denominazione_tipo, spec_denominazione, spec_annata, spec_quantita_partita_hl)
      values (
        v_sp_id, v_product, v_buyer, v_supplier,
        v_qty, v_addr, v_msg, 'pending', v_qta_ind,
        v_carrier, v_quote, v_peso,
        v_paese, v_regione,
        v_colore, v_lavor, v_refrig,
        v_so2, v_grado_min, v_grado_max, v_varieta, v_prezzo,
        v_denom_tipo, v_denom, v_annata, v_partita_hl)
      returning id into v_new_id;

      v_results := v_results || jsonb_build_object(
        'supplier_product_id', v_sp_id, 'supplier_company_id', v_supplier,
        'status', 'created', 'sample_request_id', v_new_id, 'preventivo_spedizione', v_quote);
    exception when others then
      v_results := v_results || jsonb_build_object(
        'supplier_product_id', v_sp_id, 'status', 'error', 'error_message', sqlerrm);
    end;
  end loop;

  return v_results;
end;
$function$;
revoke all on function public.request_samples_bulk(jsonb) from public, anon;
grant execute on function public.request_samples_bulk(jsonb) to authenticated, service_role;

-- trg_sample_request_emails: identica alla versione di
-- 20260817120000_email_richiesta_formale.sql, con new.quantita_indicativa come
-- ultimo argomento di email_richiesta_render.
create or replace function public.trg_sample_request_emails()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_product  text; v_buyer text; v_supplier text;
  v_lines    text[] := array[]::text[];
  v_specs_html text := null; v_specs_txt text := null;
  v_grado_label text; v_grado_txt text; v_fmt_min text; v_fmt_max text; v_denom_txt text;
  v_fmt_partita text;
  v_reg      boolean;
  v_dest     text;
  v_token    text;
  v_unsub    text;
  v_mail     jsonb;
  v_testi    jsonb := public.email_richiesta_testi('it');
begin
  if not coalesce((select enabled from feature_flags where key = 'sample_request_emails'), true) then
    return new;
  end if;

  select p.canonical_name into v_product  from products  p where p.id = new.product_id;
  select c.legal_name     into v_buyer    from companies c where c.id = new.buyer_company_id;
  select c.legal_name     into v_supplier from companies c where c.id = new.supplier_company_id;

  if tg_op = 'INSERT' then
    if new.spec_quantita_partita_hl is not null then
      v_fmt_partita := trim(trailing '.' from trim(trailing '0' from to_char(new.spec_quantita_partita_hl, 'FM999999990.99')));
      v_lines := v_lines || ('Quantita di interesse per l''acquisto: ' || v_fmt_partita ||
        ' hl (il fornitore puo rispondere indicando la quantita realmente disponibile)')::text;
    end if;
    if new.quantity_l is not null then
      v_lines := v_lines || ('Quantita di campione richiesta: ' ||
        trim(trailing '.' from trim(trailing '0' from to_char(new.quantity_l, 'FM990.99'))) || ' L')::text;
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
                           then 'Gradazione alcolica' else 'Gradazione alcolica potenziale' end;
    if new.spec_grado_min is not null or new.spec_grado_max is not null then
      v_fmt_min := trim(trailing '.' from trim(trailing '0' from to_char(new.spec_grado_min, 'FM990.99')));
      v_fmt_max := trim(trailing '.' from trim(trailing '0' from to_char(new.spec_grado_max, 'FM990.99')));
      v_grado_txt := case
        when new.spec_grado_min is not null and new.spec_grado_max is not null then v_fmt_min || ' - ' || v_fmt_max
        when new.spec_grado_min is not null then 'da ' || v_fmt_min
        else 'fino a ' || v_fmt_max end;
      v_lines := v_lines || (v_grado_label || ': ' || v_grado_txt || ' % vol')::text;
    end if;
    if new.spec_varieta is not null then
      v_lines := v_lines || ('Varieta: ' || new.spec_varieta)::text;
    end if;
    if new.spec_denominazione_tipo is not null or new.spec_denominazione is not null then
      v_denom_txt := case new.spec_denominazione_tipo
        when 'na_nc' then 'NA/NC' when 'varietale' then 'Varietale' when 'igp' then 'IGP'
        when 'atto_dop' then 'Atto a DOP' when 'atto_docg' then 'Atto a DOCG' else null end;
      v_lines := v_lines || ('Denominazione: ' || concat_ws(' - ', v_denom_txt, new.spec_denominazione))::text;
    end if;
    if new.spec_annata is not null then
      v_lines := v_lines || ('Annata: ' || new.spec_annata)::text;
    end if;
    if new.spec_prezzo_max_litro is not null then
      v_lines := v_lines || ('Prezzo massimo indicato: ' ||
        trim(trailing '.' from trim(trailing '0' from to_char(new.spec_prezzo_max_litro, 'FM999990.99'))) || ' EUR/litro')::text;
    end if;
    if coalesce(btrim(new.shipping_address), '') <> '' then
      v_lines := v_lines || ('Indirizzo di spedizione indicato: ' || replace(new.shipping_address, chr(10), ', '))::text;
    end if;

    if array_length(v_lines, 1) is not null then
      v_specs_html := '<p><b>' || (v_testi->>'specifiche_titolo') || '</b><br>' || array_to_string(v_lines, '<br>') || '</p>';
      v_specs_txt  := (v_testi->>'specifiche_titolo') || ': ' || array_to_string(v_lines, '; ') || '.';
    end if;

    v_reg   := public._company_registrata(new.supplier_company_id);
    v_dest  := public.resolve_company_email(new.supplier_company_id, 'acquisti');
    v_token := public._unsubscribe_token(v_dest);
    v_unsub := case when v_token is null then null
                    else 'https://www.bulkstrike.com/disiscrizione?t=' || v_token end;

    v_mail := public.email_richiesta_render(
      'campione', v_supplier, v_product, v_buyer, new.message,
      v_specs_html, v_specs_txt, v_reg, v_unsub, 'it', new.quantita_indicativa);

    perform public._queue_plain_email(
      'sample_request_supplier', new.supplier_company_id, 'acquisti',
      v_mail->>'subject', v_mail->>'html', v_mail->>'text');

    perform public._queue_plain_email(
      'sample_request_buyer_ack', new.buyer_company_id, 'acquisti',
      'Richiesta di campionatura inviata: ' || coalesce(v_product, 'prodotto'),
      '<p>Abbiamo inoltrato la tua richiesta di campionatura di <b>' || coalesce(v_product, 'prodotto') ||
        '</b> a ' || coalesce(v_supplier, 'il fornitore') || '.</p>' || coalesce(v_specs_html, '') ||
        '<p>Riceverai una comunicazione appena il fornitore risponde. ' ||
        'La campionatura e un servizio gratuito: la trattativa prosegue direttamente con il fornitore.</p>',
      'Richiesta di campionatura di ' || coalesce(v_product, 'prodotto') || ' inoltrata a ' ||
        coalesce(v_supplier, 'il fornitore') || '. ' || coalesce(v_specs_txt, '') ||
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
revoke all on function public.trg_sample_request_emails() from public, anon;

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
  v_recent int;
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
