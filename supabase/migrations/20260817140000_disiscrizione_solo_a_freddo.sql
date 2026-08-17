-- ============================================================================
-- DISISCRIZIONE — solo dalle email a freddo, non dalle transazionali
--
-- La versione precedente bloccava QUALUNQUE riga di emails_outbox diretta a un
-- indirizzo disiscritto. Troppo: in outbox convivono cose di natura diversa.
-- Il caso che rompeva: un fornitore riceve un invito a freddo, si disiscrive,
-- poi si registra e inizia a vendere. Da quel momento non avrebbe più ricevuto
-- il QR di consegna (order_qr_supplier) né la conferma di bonifico — email che
-- gli servono per lavorare e che ha implicitamente chiesto registrandosi.
-- Disiscriversi da un invito commerciale non può fermare la logistica.
--
-- Scelta: ALLOWLIST esplicita dei kind bloccabili. Con la blocklist un invio a
-- freddo nuovo sarebbe disiscrivibile solo se qualcuno si ricordasse di NON
-- escluderlo; con l'allowlist il default di un kind nuovo è "non bloccabile",
-- cioè l'errore possibile è mandare un'email di troppo a chi si è disiscritto —
-- visibile e correggibile — invece di far sparire in silenzio l'email di un
-- ordine, che nessuno si accorge sia mancata finché non è tardi.
--
-- Piede: il link di disiscrizione lo produce solo email_richiesta_render(), che
-- serve unicamente i tre kind a freddo qui elencati. Le transazionali non lo
-- hanno mai avuto, quindi non c'è niente da togliere lì.
-- ============================================================================

create or replace function public._kind_disiscrivibile(p_kind text)
returns boolean
language sql
immutable
as $fn$
  -- Un kind NUOVO non finisce qui dentro da solo: chi aggiunge un invio a
  -- freddo deve metterlo in lista esplicitamente.
  select coalesce(p_kind, '') in (
    'sample_request_supplier',
    'supplier_contact_request_preventivo',
    'supplier_contact_request_contatto'
  );
$fn$;
revoke all on function public._kind_disiscrivibile(text) from public, anon;

create or replace function public._cancel_if_unsubscribed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_email text;
begin
  if new.status is distinct from 'queued' then
    return new;
  end if;
  if not public._kind_disiscrivibile(new.kind) then
    return new;
  end if;
  v_email := coalesce(
    nullif(btrim(coalesce(new.to_email, '')), ''),
    public.resolve_company_email(new.to_company_id, coalesce(new.recipient_role, 'acquisti'))
  );
  if v_email is not null and public.is_email_unsubscribed(v_email) then
    new.status := 'cancelled';
    new.last_error := 'Destinatario disiscritto dalle richieste a freddo BulkStrike (' || v_email || ').';
  end if;
  return new;
end;
$fn$;
revoke all on function public._cancel_if_unsubscribed() from public, anon;
