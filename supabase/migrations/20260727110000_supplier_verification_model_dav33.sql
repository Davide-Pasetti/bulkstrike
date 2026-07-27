-- ============================================================
-- DAV-33 — Nuovo modello di verifica fornitori
-- ------------------------------------------------------------
-- "verified" torna a significare "controllato e approvato da un admin",
-- non "importato/censito". Le aziende importate mai controllate passano a
-- 'pending' ma RESTANO visibili al pubblico come "non verificate": la
-- visibilità pubblica diventa
--     verified  OPPURE  (pending E import_source censito da noi)
-- così un'azienda auto-registrata NON compare finché un admin non la guarda
-- (anti-spam), mentre le censite dall'import restano in piattaforma.
--
-- Il gate prezzi (company_can_publish_prices, DAV-28) si SPOSTA dalla
-- scrittura alla lettura di price_tiers: il fornitore rivendicato compila
-- subito il listino (DAV-30), i prezzi restano invisibili al pubblico e
-- diventano pubblici DA SOLI quando l'admin approva. Niente stato "bozza".
--
-- "Segna verificata" diventa l'unica approvazione: imposta INSIEME
-- manually_verified e status='verified' (e viceversa alla revoca).
--
-- Notifiche via emails_outbox + pg_net + edge function send-outbox-email
-- (stesso pattern segreto condiviso app_secrets dei cron ISMEA/CUN):
--   - kind 'claim_request'     → avviso attivo all'admin a ogni rivendicazione
--   - kind 'unclaimed_contact' → cortesia al support_email quando un buyer
--     scrive a un'azienda non rivendicata (nessuno leggerebbe la campanella);
--     SENZA contatti del mittente né testo del messaggio (mascheramento
--     DAV-23), una sola volta per azienda.
--
-- ATTENZIONE GRANT (regola di casa): ogni oggetto ricreato ha il suo blocco
-- revoke/grant in QUESTA migration.
-- In coda: il flip dei dati, con assert di coerenza (rollback se fallisce).
-- ============================================================

-- ── 1. Predicato unico di visibilità pubblica di un fornitore ─────────────
create or replace function public.is_visible_supplier(p_company uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from companies c
    where c.id = p_company
      and c.is_supplier
      and c.deleted_at is null
      and (c.status = 'verified'
           or (c.status = 'pending' and c.import_source in ('import','europages')))
  );
$$;
revoke execute on function public.is_visible_supplier(uuid) from public;
grant execute on function public.is_visible_supplier(uuid) to anon, authenticated, service_role;

-- ── 2. suppliers_public: la vetrina include anche i pending censiti ───────
-- Stesse colonne e stesso mascheramento contatti di prima: cambia solo il
-- WHERE (più il filtro deleted_at, che mancava: i duplicati fusi dal claim
-- non devono riapparire in vetrina).
create or replace view public.suppliers_public as
 SELECT id,
    legal_name,
    logo_url,
    description,
    supplier_type,
    status,
    country,
    region,
    city,
        CASE
            WHEN has_confirmed_order_between(auth_company_id(), id) OR auth_company_id() = id THEN address
            ELSE NULL::text
        END AS address,
        CASE
            WHEN has_confirmed_order_between(auth_company_id(), id) OR auth_company_id() = id THEN phone
            ELSE NULL::text
        END AS phone,
        CASE
            WHEN has_confirmed_order_between(auth_company_id(), id) OR auth_company_id() = id THEN fax
            ELSE NULL::text
        END AS fax,
    website,
        CASE
            WHEN has_confirmed_order_between(auth_company_id(), id) OR auth_company_id() = id THEN support_email
            ELSE NULL::text
        END AS support_email,
    linkedin_url,
    facebook_url,
    rating,
    reviews_count,
    countries_served,
    production_capacity,
    employee_count_range,
    founded_year,
    company_certifications,
    latitude,
    longitude,
    europages_url,
    import_source,
    created_at
   FROM companies c
  WHERE is_supplier = true
    AND deleted_at IS NULL
    AND (status = 'verified'::company_status
         OR (status = 'pending'::company_status AND import_source IN ('import','europages')));
revoke all on public.suppliers_public from public, anon;
grant select on public.suppliers_public to authenticated, service_role;

-- ── 3. Directory /fornitori: include i pending, il badge lo decide status ─
create or replace function public.get_suppliers_directory()
returns jsonb
language sql stable security definer set search_path = public as $$
  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'name'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', c.id,
      'name', c.legal_name,
      'logo_url', c.logo_url,
      'supplier_type', c.supplier_type,
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
      AND (c.status = 'verified'
           OR (c.status = 'pending' AND c.import_source IN ('import','europages')))
  ) sub;
$$;
revoke execute on function public.get_suppliers_directory() from public, anon;
grant execute on function public.get_suppliers_directory() to authenticated, service_role;

-- ── 4. Scheda pubblica fornitore: raggiungibile anche da pending ──────────
-- site_rank/suppliers_total ora contano l'insieme VISIBILE (il rank resta
-- confrontabile con la directory che l'utente vede). best_price è esposto
-- SOLO se manually_verified: la funzione è SECURITY DEFINER e senza questo
-- guard mostrerebbe i listini-bozza dei rivendicati non ancora approvati.
create or replace function public.get_supplier_profile(p_company uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.legal_name,
    'logo_url', c.logo_url,
    'description', c.description,
    'supplier_type', c.supplier_type,
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
        from companies where is_supplier = true and deleted_at is null
          and (status = 'verified' or (status = 'pending' and import_source in ('import','europages')))
      ) r where r.id = c.id),
    'suppliers_total', (select count(*) from companies where is_supplier = true and deleted_at is null
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
$$;
revoke execute on function public.get_supplier_profile(uuid) from public, anon;
grant execute on function public.get_supplier_profile(uuid) to authenticated, service_role;

-- ── 5. Messaggistica: si può scrivere anche a un fornitore non verificato ─
-- ("Contatta fornitore" della sezione "Fornitori non verificati", DAV-33).
-- Resta invariato: un fornitore ricontatta un buyer solo con un ordine tra loro.
create or replace function public.start_or_get_thread(p_other_company uuid default null, p_order uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth_company_id();
  v_buyer uuid; v_supplier uuid; v_thread uuid;
  v_ord orders%rowtype;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;

  if p_order is not null then
    select * into v_ord from orders where id = p_order;
    if v_ord.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
    if v_me not in (v_ord.buyer_company_id, v_ord.supplier_company_id) then
      raise exception 'NOT_ALLOWED';
    end if;
    if p_other_company is not null
       and p_other_company not in (v_ord.buyer_company_id, v_ord.supplier_company_id) then
      raise exception 'NOT_ALLOWED';
    end if;
    v_buyer := v_ord.buyer_company_id;
    v_supplier := v_ord.supplier_company_id;
  else
    if p_other_company is null or p_other_company = v_me then
      raise exception 'INVALID_COMPANY';
    end if;
    -- Prima: solo fornitori status='verified'. Ora: qualunque fornitore
    -- pubblicamente visibile (verificato O censito in attesa di verifica).
    if public.is_visible_supplier(p_other_company) then
      v_buyer := v_me;
      v_supplier := p_other_company;
    else
      select o.buyer_company_id, o.supplier_company_id into v_buyer, v_supplier
      from orders o
      where (o.buyer_company_id = v_me and o.supplier_company_id = p_other_company)
         or (o.buyer_company_id = p_other_company and o.supplier_company_id = v_me)
      order by o.created_at desc limit 1;
      if v_buyer is null then raise exception 'SUPPLIER_NOT_AVAILABLE'; end if;
    end if;
  end if;

  insert into message_threads (buyer_company_id, supplier_company_id, order_id)
  values (v_buyer, v_supplier, p_order)
  on conflict (buyer_company_id, supplier_company_id)
  do update set order_id = coalesce(message_threads.order_id, excluded.order_id)
  returning id into v_thread;

  return v_thread;
end $$;
revoke execute on function public.start_or_get_thread(uuid, uuid) from public, anon;
grant execute on function public.start_or_get_thread(uuid, uuid) to authenticated, service_role;

-- ── 6. Segui fornitore: stesso allargamento ───────────────────────────────
create or replace function public.follow_supplier(p_supplier uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth_company_id();
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_supplier is null or p_supplier = v_me then raise exception 'INVALID_COMPANY'; end if;
  if not public.is_visible_supplier(p_supplier) then
    raise exception 'SUPPLIER_NOT_AVAILABLE';
  end if;
  insert into supplier_follows (buyer_company_id, supplier_company_id)
  values (v_me, p_supplier)
  on conflict (buyer_company_id, supplier_company_id) do nothing;
end $$;
revoke execute on function public.follow_supplier(uuid) from public, anon;
grant execute on function public.follow_supplier(uuid) to authenticated, service_role;

-- ── 7. send_message: email di cortesia alle aziende non rivendicate ───────
-- Se il destinatario è un fornitore SENZA profili collegati, la campanella
-- non la legge nessuno: una sola volta per azienda avvisiamo il support_email
-- di rivendicare il profilo. Niente contatti del mittente, niente testo del
-- messaggio (stesso principio di mascheramento di DAV-23).
create or replace function public.send_message(p_thread uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth_company_id();
  v_t message_threads%rowtype;
  v_other uuid;
  v_msg uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_had_unread boolean;
  v_my_name text;
  v_other_email text;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then raise exception 'INVALID_BODY'; end if;
  select * into v_t from message_threads where id = p_thread;
  if v_t.id is null or v_me not in (v_t.buyer_company_id, v_t.supplier_company_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  v_other := case when v_t.buyer_company_id = v_me then v_t.supplier_company_id else v_t.buyer_company_id end;

  -- una sola notifica per "sessione di lettura": se la controparte ha già
  -- messaggi non letti in questo thread, non ne accodiamo un'altra
  select exists (
    select 1 from thread_messages m
    where m.thread_id = p_thread and m.sender_company_id = v_me and m.read_at is null
  ) into v_had_unread;

  insert into thread_messages (thread_id, sender_company_id, body)
  values (p_thread, v_me, v_body)
  returning id into v_msg;

  update message_threads set last_message_at = now() where id = p_thread;

  if not v_had_unread then
    select legal_name into v_my_name from companies where id = v_me;
    insert into notifications (company_id, type, title, body, action_label, action_url)
    values (v_other, 'message',
            'Nuovo messaggio da ' || coalesce(v_my_name, 'un''azienda BulkStrike'),
            left(v_body, 160),
            'Apri i messaggi', '/messaggi?thread=' || p_thread);
  end if;

  -- Cortesia una tantum alle aziende non ancora rivendicate (nessun profilo
  -- collegato): senza questa email il messaggio resterebbe per sempre non letto.
  if not exists (select 1 from profiles pr where pr.company_id = v_other)
     and not exists (select 1 from emails_outbox e
                     where e.kind = 'unclaimed_contact' and e.to_company_id = v_other)
  then
    select support_email into v_other_email
      from companies where id = v_other and is_supplier and deleted_at is null;
    if v_other_email is not null then
      insert into emails_outbox (kind, to_company_id, to_email, subject, body_text, body_html)
      values ('unclaimed_contact', v_other, v_other_email,
        'Un''azienda vuole parlarti su BulkStrike',
        'Buongiorno,'
        || chr(10) || chr(10) ||
        'un''azienda registrata su BulkStrike (marketplace B2B di materie prime sfuse) ha provato a contattarvi tramite la messaggistica della piattaforma.'
        || chr(10) || chr(10) ||
        'Il vostro profilo aziendale e'' gia'' censito su BulkStrike ma non e'' ancora stato rivendicato: per leggere il messaggio e rispondere, registratevi con la vostra email aziendale e rivendicate il profilo:'
        || chr(10) || chr(10) ||
        'https://www.bulkstrike.com/registrati'
        || chr(10) || chr(10) ||
        'Il messaggio vi aspetta nella casella della piattaforma.'
        || chr(10) || chr(10) ||
        'BulkStrike — www.bulkstrike.com',
        '<p>Buongiorno,</p>'
        || '<p>un''azienda registrata su <b>BulkStrike</b> (marketplace B2B di materie prime sfuse) ha provato a contattarvi tramite la messaggistica della piattaforma.</p>'
        || '<p>Il vostro profilo aziendale &egrave; gi&agrave; censito su BulkStrike ma non &egrave; ancora stato rivendicato: per leggere il messaggio e rispondere, registratevi con la vostra email aziendale e rivendicate il profilo:</p>'
        || '<p><a href="https://www.bulkstrike.com/registrati">www.bulkstrike.com/registrati</a></p>'
        || '<p>Il messaggio vi aspetta nella casella della piattaforma.</p>'
        || '<p>BulkStrike &mdash; <a href="https://www.bulkstrike.com">www.bulkstrike.com</a></p>');
    end if;
  end if;

  return v_msg;
end $$;
revoke execute on function public.send_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text) to authenticated, service_role;

-- ── 8. Gate prezzi: dalla scrittura alla lettura ──────────────────────────
-- Il proprietario può SEMPRE salvare il proprio listino (anche appena
-- rivendicato); i prezzi sono pubblici solo quando l'admin approva
-- (company_can_publish_prices → manually_verified). All'approvazione i
-- listini già compilati appaiono da soli: nessun passo di "pubblicazione".
-- Le bozze non toccano aste/prezzi standard: _best_standard_price e
-- get_price_reference filtrano già sui fornitori status='verified'.
drop policy if exists tiers_owner on public.price_tiers;
create policy tiers_owner on public.price_tiers for all
  using (exists (
    select 1 from supplier_products sp
    where sp.id = price_tiers.supplier_product_id
      and sp.supplier_company_id = auth_company_id()))
  with check (exists (
    select 1 from supplier_products sp
    where sp.id = price_tiers.supplier_product_id
      and sp.supplier_company_id = auth_company_id()));

drop policy if exists tiers_read on public.price_tiers;
create policy tiers_read on public.price_tiers for select
  using (exists (
    select 1 from supplier_products sp
    where sp.id = price_tiers.supplier_product_id
      and (sp.supplier_company_id = auth_company_id()
           or company_can_publish_prices(sp.supplier_company_id))));

-- La policy di lettura gira anche per i visitatori anonimi (scheda prodotto):
-- serve EXECUTE sulla funzione del gate, finora concessa solo ad authenticated.
grant execute on function public.company_can_publish_prices(uuid) to anon;

-- ── 9. Notifiche email (claim + cortesia) via outbox → pg_net → edge fn ───
-- Ogni INSERT in emails_outbox dei due kind qui sotto spara net.http_post
-- alla edge function send-outbox-email (segreto condiviso app_secrets, come i
-- cron ISMEA/CUN), che invia via Resend e marca sent/failed. I kind esistenti
-- della coda ordini (delivery_confirmation, order_qr_supplier, ...) NON sono
-- toccati: restano drenati dal loro flusso.
create or replace function public._notify_claim_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into emails_outbox (kind, to_company_id, subject, body_text)
  select 'claim_request', new.company_id,
    '[BulkStrike] Richiesta di rivendicazione: ' || coalesce(c.legal_name, new.company_id::text),
    'Azienda: ' || coalesce(c.legal_name, new.company_id::text)
      || chr(10) || 'Richiedente: ' || coalesce(new.requester_email, '?')
      || chr(10) || 'Dominio email corrispondente al sito: ' || case when new.domain_match then 'SI''' else 'no' end
      || chr(10) || 'Esito automatico: ' || case when new.decision = 'approved'
             then 'collegamento auto-approvato (dominio corrispondente) — l''azienda resta comunque da verificare'
             else 'in coda per la tua revisione' end
      || chr(10) || chr(10) || 'Console: https://www.bulkstrike.com/admin/fornitori'
  from companies c where c.id = new.company_id;
  return new;
end $$;
revoke execute on function public._notify_claim_request() from public, anon, authenticated;

drop trigger if exists trg_claim_request_notify on public.company_claim_requests;
create trigger trg_claim_request_notify
  after insert on public.company_claim_requests
  for each row execute function public._notify_claim_request();

create or replace function public._dispatch_outbox_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://uufueekpxboygcotqvhu.supabase.co/functions/v1/send-outbox-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where key = 'ingest_cron_secret')
    ),
    body := jsonb_build_object('id', new.id),
    timeout_milliseconds := 20000
  );
  return new;
end $$;
revoke execute on function public._dispatch_outbox_email() from public, anon, authenticated;

drop trigger if exists trg_outbox_dispatch on public.emails_outbox;
create trigger trg_outbox_dispatch
  after insert on public.emails_outbox
  for each row
  when (new.kind in ('claim_request','unclaimed_contact') and new.status = 'queued')
  execute function public._dispatch_outbox_email();

-- ── 10. "Segna verificata" = unica approvazione (entrambi i flag) ─────────
create or replace function public.admin_set_manually_verified(p_company uuid, p_verified boolean default true, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not _is_admin() then raise exception 'NOT_ADMIN'; end if;

  update companies
     set manually_verified = coalesce(p_verified, true),
         manually_verified_at = case when coalesce(p_verified, true) then now() else null end,
         status = case when coalesce(p_verified, true) then 'verified'::company_status else 'pending'::company_status end,
         updated_at = now(),
         verification_notes = concat_ws(' ', nullif(verification_notes, ''),
           '['||to_char(now(),'DD/MM/YYYY')||' '||
           case when coalesce(p_verified, true) then 'verificata: profilo Verificato e pubblicazione prezzi abilitata'
                else 'verifica revocata: profilo torna da verificare, prezzi non pubblici' end ||
           coalesce(' — '||nullif(btrim(coalesce(p_note,'')),''), '')||']')
   where id = p_company and deleted_at is null
   returning legal_name into v_name;

  if v_name is null then raise exception 'COMPANY_NOT_FOUND'; end if;

  return jsonb_build_object('company_id', p_company, 'legal_name', v_name,
                            'manually_verified', coalesce(p_verified, true),
                            'status', case when coalesce(p_verified, true) then 'verified' else 'pending' end);
end $$;
revoke execute on function public.admin_set_manually_verified(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_manually_verified(uuid, boolean, text) to authenticated, service_role;

-- ── 11. Verifica in blocco dalla coda: stessa semantica unificata ─────────
create or replace function public.admin_verify_suppliers(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not _is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_ids is null or array_length(p_ids, 1) is null then return 0; end if;
  update companies
     set status = 'verified',
         manually_verified = true,
         manually_verified_at = now(),
         updated_at = now()
  where id = any(p_ids) and status = 'pending' and import_source IN ('europages', 'import');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.admin_verify_suppliers(uuid[]) from public, anon;
grant execute on function public.admin_verify_suppliers(uuid[]) to authenticated, service_role;

-- ── 12. FLIP DATI: le importate mai controllate tornano 'pending' ─────────
-- Esclusa l'unica già controllata a mano (manually_verified). I corrieri non
-- sono toccati (is_supplier); nessuna azienda è insieme fornitore e corriere
-- (verificato: 0 ibridi al 27/07/2026).
update companies
   set status = 'pending', updated_at = now()
 where is_supplier and status = 'verified' and not manually_verified;

-- Assert di coerenza: dopo il flip, i fornitori 'verified' devono coincidere
-- con i manually_verified. Se no, rollback dell'intera migration.
do $$
declare v_ver int; v_mv int; v_vis int;
begin
  select count(*) into v_ver from companies where is_supplier and status = 'verified';
  select count(*) into v_mv  from companies where is_supplier and manually_verified;
  select count(*) into v_vis from companies c where c.is_supplier and c.deleted_at is null
    and (c.status = 'verified' or (c.status = 'pending' and c.import_source in ('import','europages')));
  if v_ver <> v_mv then
    raise exception 'DAV-33: attesi verified = manually_verified, trovati % vs %', v_ver, v_mv;
  end if;
  raise notice 'DAV-33 flip ok: % verified (= manually_verified), % fornitori pubblicamente visibili', v_ver, v_vis;
end $$;
