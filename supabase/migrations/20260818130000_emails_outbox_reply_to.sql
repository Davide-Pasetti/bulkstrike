-- ============================================================================
-- REPLY-TO sulle email in uscita
--
-- Il mittente resta un indirizzo tecnico sul sottodominio verificato su Resend
-- (info@updates.bulkstrike.com), che NON riceve posta: updates.bulkstrike.com
-- non ha MX, quindi una risposta lì rimbalzerebbe. Il Reply-To porta le risposte
-- dei fornitori su commercial@bulkstrike.com, casella Zoho vera.
--
-- Solo i tre kind di richiesta al fornitore prendono il Reply-To. Nessun default
-- generico: per gli altri kind si deciderà caso per caso, quando servirà.
--
-- La mappa è tenuta SEPARATA da _kind_disiscrivibile() anche se oggi le due
-- liste coincidono: sono decisioni diverse (a chi si risponde vs cosa si può
-- disiscrivere) e non devono trascinarsi a vicenda quando una cambierà.
-- ============================================================================

alter table public.emails_outbox add column if not exists reply_to text;
comment on column public.emails_outbox.reply_to is
  'Indirizzo a cui il destinatario risponde. NULL = nessun Reply-To (comportamento di default).';

create or replace function public._reply_to_per_kind(p_kind text)
returns text
language sql
immutable
as $fn$
  -- Un kind non elencato NON prende reply_to.
  select case coalesce(p_kind, '')
    when 'sample_request_supplier'              then 'commercial@bulkstrike.com'
    when 'supplier_contact_request_preventivo'  then 'commercial@bulkstrike.com'
    when 'supplier_contact_request_contatto'    then 'commercial@bulkstrike.com'
    else null
  end;
$fn$;
revoke all on function public._reply_to_per_kind(text) from public, anon;

create or replace function public._reply_to_default()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  -- coalesce: se un chiamante ha già messo un reply_to esplicito, vince il suo.
  new.reply_to := coalesce(new.reply_to, public._reply_to_per_kind(new.kind));
  return new;
end;
$fn$;
revoke all on function public._reply_to_default() from public, anon;

drop trigger if exists trg_reply_to_default on emails_outbox;
create trigger trg_reply_to_default
before insert on emails_outbox
for each row execute function public._reply_to_default();
