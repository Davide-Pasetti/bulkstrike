-- ============================================================================
-- AUDIT DEI GRANT EXECUTE — chiusura delle funzioni interne (1 di 2).
--
-- Causa comune: i default privileges del progetto assegnano EXECUTE ad anon e
-- authenticated al momento della CREATE. Il consueto "revoke from public"
-- non li tocca, quindi ogni funzione nata senza revoke esplicito e' rimasta
-- chiamabile via PostgREST da chiunque abbia la chiave pubblicabile.
--
-- Criterio: apertura = chi la chiama davvero.
--   * chiamata dal browser (.rpc nel codice)  -> authenticated resta;
--   * chiamata dalle edge function            -> solo service_role;
--   * usata in policy RLS o viste             -> NON si tocca (verrebbe
--     valutata coi permessi di chi interroga e bloccherebbe le tabelle);
--   * funzione trigger                        -> nessun grant necessario:
--     PostgreSQL verifica EXECUTE alla CREATE TRIGGER, non allo scatto.
--     Verificato con prova isolata: revocato EXECUTE, l'INSERT come
--     authenticated e' comunque riuscito.
--   * helper interna                          -> chiusa.
--
-- Le piu' rilevanti fra quelle chiuse, tutte SECURITY DEFINER e senza guardia
-- propria perche' nate per essere chiamate solo dall'interno:
--   _queue_plain_email      accodava una mail arbitraria a qualunque azienda;
--   _apri_thread_richiesta  creava conversazioni e messaggi fra due aziende
--                           qualsiasi, con notifica;
--   _unsubscribe_token      generava il token di disiscrizione di un indirizzo
--                           altrui;
--   _claim_token_richiesta  generava un token di rivendica (l'approvazione
--                           resta comunque in request_company_claim, quindi
--                           non era un'appropriazione diretta di profilo);
--   _inoltra_richiesta_agente, _agente_upsert.
--
-- ECCEZIONI volute, lasciate aperte ad authenticated: _peso_campione_default e
-- _validate_listing_specs sono chiamate da request_samples_bulk e
-- create_listing, che sono SECURITY INVOKER e girano coi permessi dell'utente.
-- Chiuderle avrebbe rotto campionature e pubblicazione annunci.
-- Idem get_order_grand_total: la usa /api/stripe/create-payin con la SESSIONE
-- dell'utente, non con service_role — chiuderla avrebbe rotto il checkout.
-- Per tutte e tre si toglie comunque anon, che non serve.
-- ============================================================================

do $$
declare
  r record;
  n_helper int := 0;
  n_trigger int := 0;
  n_soloanon int := 0;
  v_helper text[] := array[
    '_agente_upsert','_apri_thread_richiesta','_claim_token_richiesta','_company_registrata',
    '_inoltra_richiesta_agente','_is_platform_admin','_kind_disiscrivibile','_limite_richieste_esente',
    '_limite_richieste_superato','_nuovo_thread_ref_code','_queue_plain_email','_reply_to_per_kind',
    '_richieste_24h','_testo_thread_richiesta','_unsubscribe_token','_bacheca_prezzo_ordinamento',
    '_bacheca_quantita_ordinamento','_format_listing_specs','_listing_matches_specs',
    'email_richiesta_render','thread_da_oggetto','is_email_unsubscribed','is_visible_supplier',
    'mask_contacts','is_generic_email_domain','get_bacheca_opzioni','admin_merge_companies',
    'admin_merge_company_duplicates'
  ];
  v_soloanon text[] := array['_peso_campione_default','get_order_grand_total'];
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = any (v_helper)
  loop
    execute format('revoke all on function %s from anon, authenticated', r.sig);
    n_helper := n_helper + 1;
  end loop;

  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = any (v_soloanon)
  loop
    execute format('revoke all on function %s from anon', r.sig);
    n_soloanon := n_soloanon + 1;
  end loop;

  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype = 'trigger'::regtype
      and (array_to_string(p.proacl,',') like '%anon=X%' or array_to_string(p.proacl,',') like '%authenticated=X%')
  loop
    execute format('revoke all on function %s from anon, authenticated', r.sig);
    n_trigger := n_trigger + 1;
  end loop;

  raise notice 'helper chiuse: %, solo-anon: %, trigger: %', n_helper, n_soloanon, n_trigger;
end $$;
