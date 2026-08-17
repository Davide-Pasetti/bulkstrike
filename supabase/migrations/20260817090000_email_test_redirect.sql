-- ============================================================================
-- MODALITÀ TEST EMAIL — nessun invio verso destinatari reali.
--
-- Finché si collauda il box "Richiedi" non deve partire nessuna email verso
-- terzi (fornitori, acquirenti, corrieri): ogni riga di emails_outbox viene
-- dirottata su davide@bulkstrike.com, con il destinatario reale scritto
-- nell'oggetto e in testa al corpo. Il meccanismo di notifica resta quindi
-- osservabile per intero (contenuto, allegati, trigger, dispatch) senza che
-- nessuno all'esterno riceva niente.
--
-- Il dirottamento avviene sull'outbox, cioè nel punto unico da cui passa
-- QUALUNQUE email della piattaforma: agire sui singoli trigger lascerebbe
-- scoperti i percorsi che non riguardano le richieste.
--
-- Interruttore: feature_flags.email_test_redirect. A false si torna agli
-- invii reali, e resta comunque attiva la vecchia rete di sicurezza
-- supplier_facing_emails_enabled (che cancella le email verso i fornitori).
-- ============================================================================

insert into feature_flags (key, enabled, note) values (
  'email_test_redirect', true,
  'Modalità test: ogni email in uscita viene dirottata a davide@bulkstrike.com invece che al destinatario reale. Metterlo a false SOLO quando si vogliono riattivare gli invii verso fornitori e clienti.'
)
on conflict (key) do update set enabled = excluded.enabled, note = excluded.note, updated_at = now();

-- Le email di richiesta campione erano spente del tutto (nessuna riga in
-- outbox): con il dirottamento attivo possono tornare ad essere prodotte, così
-- il collaudo vede davvero il testo che il fornitore riceverebbe.
insert into feature_flags (key, enabled, note) values (
  'sample_request_emails', true,
  'Email di richiesta campionatura (fornitore + conferma acquirente). In modalità test finiscono comunque su davide@bulkstrike.com.'
)
on conflict (key) do update set enabled = excluded.enabled, note = excluded.note, updated_at = now();

create or replace function public._email_test_redirect()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_attiva boolean;
  v_dest   text := 'davide@bulkstrike.com';
  v_reale  text;
begin
  select enabled into v_attiva from feature_flags where key = 'email_test_redirect';
  -- Default a FALSE: se la riga sparisce non si dirotta più nulla di nascosto.
  if not coalesce(v_attiva, false) then
    return new;
  end if;
  if new.status is distinct from 'queued' then
    return new;
  end if;

  -- Già interna (le richieste di preventivo/contatto nascono con questo
  -- indirizzo): niente da dirottare e nessun avviso da aggiungere.
  if new.to_company_id is null and new.to_email = v_dest then
    return new;
  end if;

  -- Chi avrebbe ricevuto l'email fuori dalla modalità test. Stessa risoluzione
  -- che farebbe send-outbox-email: prima to_email, poi l'indirizzo dell'azienda.
  v_reale := coalesce(
    nullif(btrim(coalesce(new.to_email, '')), ''),
    public.resolve_company_email(new.to_company_id, coalesce(new.recipient_role, 'acquisti')),
    'destinatario non risolvibile'
  );

  new.to_company_id := null;
  new.to_email      := v_dest;
  new.subject       := '[TEST -> ' || v_reale || '] ' || coalesce(new.subject, '');
  new.body_text     := 'MODALITA TEST: questa email NON e stata inviata al destinatario reale (' || v_reale || ').'
                       || chr(10) || chr(10) || coalesce(new.body_text, '');
  new.body_html     := '<p style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:10px 12px;font-size:13px;color:#92400E">'
                       || 'MODALIT&Agrave; TEST: questa email <b>non</b> &egrave; stata inviata al destinatario reale ('
                       || v_reale || ').</p>' || coalesce(new.body_html, '');
  return new;
end;
$$;

revoke all on function public._email_test_redirect() from public, anon;

-- Deve girare PRIMA di trg_suppress_supplier_facing_emails (i BEFORE scattano in
-- ordine alfabetico e "email" < "suppress"): dopo il dirottamento to_company_id
-- è null, quindi la soppressione non ha più un fornitore da cancellare e la
-- copia di test arriva a destinazione invece di finire in 'cancelled'.
drop trigger if exists trg_email_test_redirect on emails_outbox;
create trigger trg_email_test_redirect
before insert on emails_outbox
for each row execute function public._email_test_redirect();
