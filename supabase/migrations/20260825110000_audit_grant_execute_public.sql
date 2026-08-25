-- ============================================================================
-- AUDIT DEI GRANT — secondo fronte: EXECUTE concesso a PUBLIC (2 di 2).
--
-- Il primo giro (20260825100000) revocava da anon e authenticated, ma NON da
-- PUBLIC. PUBLIC e' piu' ampio: comprende ogni ruolo, presente e futuro. Tre
-- helper appena "chiuse" restavano quindi chiamabili da chiunque:
-- mask_contacts, is_generic_email_domain, _format_listing_specs.
-- Errore mio nel primo passaggio, corretto qui.
--
-- Il conteggio iniziale diceva "zero PUBLIC" perche' il pattern usato per
-- leggere proacl era sbagliato. La lettura corretta e' aclexplode(), dove il
-- grantee 0 indica PUBLIC:
--   select coalesce(r.rolname,'PUBLIC'), count(*)
--   from pg_proc p cross join lateral aclexplode(p.proacl) a
--   left join pg_roles r on r.oid = a.grantee
--   where p.pronamespace='public'::regnamespace and a.privilege_type='EXECUTE'
--   group by 1;
-- Da usare cosi' anche nei controlli futuri: il confronto testuale su proacl
-- non vede la voce PUBLIC, che nel testo appare come "=X/postgres".
--
-- Criterio: PUBLIC non si usa mai. Dove l'accesso serve davvero si concede
-- ai ruoli per nome, cosi' l'intenzione resta scritta e leggibile.
-- Le funzioni delle estensioni (pg_trgm, 31) NON si toccano: sono funzioni di
-- supporto degli indici e degli operatori di similarita', non espongono dati,
-- e restringerle romperebbe le ricerche senza dare nulla in cambio.
-- ============================================================================

do $$
declare
  r record;
  n_trig int := 0; n_helper int := 0; n_pubblica int := 0; n_altro int := 0;
  v_pubbliche text[] := array[
    'get_active_pools','get_bacheca_filters','get_homepage_stats','get_listing_spec_schema',
    'get_market_index_sectors','get_market_index_series','get_price_screener',
    'get_product_price_history','get_products_with_market_prices','search_products_suggest',
    'get_price_reference','get_product_breadcrumb','get_taxonomy'
  ];
  v_helper text[] := array['_format_listing_specs','is_generic_email_domain','mask_contacts'];
  -- Usate dentro policy RLS e viste: l'accesso effettivo va conservato per i
  -- ruoli dell'applicazione, altrimenti si bloccano le tabelle. Si toglie solo
  -- la delega in bianco a PUBLIC.
  v_policy text[] := array['auth_company_id','has_confirmed_order_between'];
begin
  for r in
    select p.oid::regprocedure as sig, p.proname, p.prorettype = 'trigger'::regtype as e_trig
    from pg_proc p cross join lateral aclexplode(p.proacl) a
    where p.pronamespace='public'::regnamespace and a.privilege_type='EXECUTE' and a.grantee = 0
      and p.oid not in (
        select p2.oid from pg_depend d
        join pg_extension e on e.oid=d.refobjid and d.refclassid='pg_extension'::regclass
        join pg_proc p2 on p2.oid=d.objid and d.classid='pg_proc'::regclass
        where p2.pronamespace='public'::regnamespace)
  loop
    execute format('revoke all on function %s from public', r.sig);
    if r.e_trig then
      n_trig := n_trig + 1;
    elsif r.proname = any (v_helper) then
      n_helper := n_helper + 1;
    elsif r.proname = any (v_pubbliche) then
      execute format('grant execute on function %s to anon, authenticated, service_role', r.sig);
      n_pubblica := n_pubblica + 1;
    elsif r.proname = any (v_policy) then
      execute format('grant execute on function %s to anon, authenticated, service_role', r.sig);
      n_altro := n_altro + 1;
    elsif r.proname = 'get_order_grand_total' then
      -- serve al checkout, che la chiama con la sessione dell'utente; mai ad anon
      execute format('grant execute on function %s to authenticated, service_role', r.sig);
      n_altro := n_altro + 1;
    else
      n_altro := n_altro + 1;
    end if;
  end loop;

  raise notice 'trigger: %, helper: %, letture pubbliche: %, altro: %', n_trig, n_helper, n_pubblica, n_altro;
end $$;

-- ============================================================================
-- VERIFICHE ESEGUITE DOPO L'APPLICAZIONE (impersonando i ruoli reali)
--
-- come anon:      get_taxonomy, get_homepage_stats, get_catalog,
--                 search_products_suggest, get_bacheca_filters -> OK;
--                 mask_contacts -> bloccata (atteso).
-- come authenticated (sessione simulata di un utente reale):
--                 auth_company_id -> valorizzata; lettura di message_threads
--                 sotto RLS -> OK; get_my_message_threads, get_my_orders,
--                 admin_list_inbox, agenti_di_zona -> OK;
--                 get_thread_messages su una conversazione propria -> OK,
--                 con contacts_masked=true (quindi mask_contacts e
--                 has_confirmed_order_between girano ancora dentro la DEFINER);
--                 _queue_plain_email, _unsubscribe_token,
--                 _claim_token_richiesta -> bloccate (atteso).
-- pipeline richieste, come authenticated: request_supplier_contact_bulk -> OK,
--                 2 mail accodate, reply_to=info@bulkstrike.com, codice
--                 [RIF-...] nell'oggetto, thread creato, dirottamento di test
--                 applicato.
-- relay, come service_role: ingest_inbox_email -> stato=agganciata,
--                 mittente=verificato.
-- Tutte le prove di scrittura sono state annullate con un'eccezione
-- volontaria: nessun dato di test e' rimasto.
--
-- Controllo statico decisivo: TUTTI i chiamanti delle funzioni chiuse sono
-- SECURITY DEFINER (nessuno INVOKER), quindi girano coi permessi del
-- proprietario e non passano dai grant revocati.
-- ============================================================================
