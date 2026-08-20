-- ============================================================================
-- AGENTI — instradamento della richiesta all'agente di zona
--
-- La copia all'agente e' IN AGGIUNTA a quella del fornitore, mai al posto:
-- nessuna richiesta deve arrivare al solo agente senza che il fornitore ne
-- sappia niente.
--
-- thread_id viene passato apposta: cosi' la copia prende un proprio codice
-- [RIF-] e anche una risposta dell'agente rientra nella conversazione col
-- compratore invece di finire fra le mail da smistare a mano.
-- ============================================================================

create or replace function public._inoltra_richiesta_agente(
  p_zone uuid, p_supplier uuid, p_oggetto text, p_html text, p_text text, p_thread uuid
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_a sales_agents%rowtype;
  v_z agent_supplier_zones%rowtype;
  v_forn text;
  v_intro_html text;
  v_intro_txt text;
begin
  if p_zone is null then return false; end if;

  select * into v_z from agent_supplier_zones where id = p_zone;
  -- Il legame deve essere confermato E riferito a QUEL fornitore: un id di zona
  -- passato a caso non deve poter dirottare una richiesta altrove.
  if v_z.id is null or v_z.supplier_company_id <> p_supplier or v_z.status <> 'confermato' then
    return false;
  end if;
  select * into v_a from sales_agents where id = v_z.agent_id and status = 'attivo';
  if v_a.id is null or coalesce(btrim(v_a.email), '') = '' then return false; end if;

  select legal_name into v_forn from companies where id = p_supplier;

  v_intro_html := '<p style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:10px 12px;font-size:13px">'
    || 'Ricevi questa richiesta come <b>agente di zona</b> di ' || coalesce(v_forn, 'questo fornitore')
    || '. Il fornitore ha ricevuto la stessa richiesta.</p>';
  v_intro_txt := 'Ricevi questa richiesta come agente di zona di ' || coalesce(v_forn, 'questo fornitore')
    || '. Il fornitore ha ricevuto la stessa richiesta.' || chr(10) || chr(10);

  insert into emails_outbox (kind, to_company_id, to_email, subject, body_html, body_text, status, thread_id)
  values ('agent_request_copy', null, lower(btrim(v_a.email)), p_oggetto,
          v_intro_html || coalesce(p_html, ''), v_intro_txt || coalesce(p_text, ''), 'queued', p_thread);

  return true;
end;
$fn$;
revoke all on function public._inoltra_richiesta_agente(uuid, uuid, text, text, text, uuid) from public, anon;

-- La scelta dell'agente e' PER FORNITORE mentre l'invio e' cumulativo: le due
-- RPC di richiesta ricevono una mappa { supplier_company_id: zone_id } nel
-- payload (chiave agent_zones), la salvano su agent_zone_id della riga e poi
-- chiamano _inoltra_richiesta_agente. Un valore unico avrebbe applicato lo
-- stesso agente a tutti i fornitori selezionati.
alter table public.sample_requests           add column if not exists agent_zone_id uuid references public.agent_supplier_zones(id) on delete set null;
alter table public.supplier_contact_requests add column if not exists agent_zone_id uuid references public.agent_supplier_zones(id) on delete set null;
comment on column public.sample_requests.agent_zone_id is
  'Agente di zona scelto dal buyer. La richiesta va comunque al fornitore: all''agente arriva una copia.';
comment on column public.supplier_contact_requests.agent_zone_id is
  'Agente di zona scelto dal buyer. La richiesta va comunque al fornitore: all''agente arriva una copia.';

-- Ricerca fornitori per la pagina pubblica /agenti/registrati: solo dati gia'
-- visibili nella directory (ragione sociale, paese, citta').
create or replace function public.cerca_fornitori_pubblici(p_q text, p_limit int default 15)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'legal_name', c.legal_name, 'country', c.country,
      'country_iso2', c.country_iso2, 'city', c.city) order by c.legal_name)
    from (
      select c.* from companies c
      where c.is_supplier and c.deleted_at is null and not c.hidden_from_public
        and length(btrim(coalesce(p_q, ''))) >= 2
        and c.legal_name ilike '%' || btrim(p_q) || '%'
      order by c.legal_name
      limit greatest(1, least(coalesce(p_limit, 15), 30))
    ) c
  ), '[]'::jsonb);
$fn$;
revoke all on function public.cerca_fornitori_pubblici(text, int) from public;
grant execute on function public.cerca_fornitori_pubblici(text, int) to anon, authenticated;

-- NB applicati in produzione con la stessa modifica, sulle definizioni correnti:
--  * request_samples_bulk e request_supplier_contact_bulk leggono
--    payload->'agent_zones', salvano agent_zone_id e inoltrano la copia;
--  * trg_sample_request_emails chiama _inoltra_richiesta_agente dopo l'email
--    al fornitore;
--  * admin_list_agents espone supplier_company_id sulle righe di provvigione,
--    senza il quale la tendina di assegnazione manuale resterebbe vuota.
