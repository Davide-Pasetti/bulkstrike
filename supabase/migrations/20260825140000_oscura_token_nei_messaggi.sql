-- ============================================================================
-- I token non devono mai finire in una conversazione.
--
-- Scoperto pubblicando a mano la mail trattenuta del 24/08: la ripulitura
-- delle citazioni non aveva tagliato l'intestazione "Da: / A: / Data:" di
-- Zoho, e nel thread e' finita l'intera mail citata, con dentro il link di
-- rivendica (?claim=) e quello di disiscrizione (?t=). Nel caso generale li
-- leggerebbe la controparte: il token di disiscrizione funziona subito,
-- quello di rivendica avvia una richiesta (l'approvazione resta comunque a
-- request_company_claim, quindi non e' un'appropriazione diretta).
--
-- La causa e' corretta a monte, nella edge function ingest-inbox-imap (v5):
-- la regex della citazione ora ammette fino a 4 righe fra "Da:" e
-- "Data:/Oggetto:", e i token vengono oscurati comunque. Verificata su 5 casi
-- reali, compresi i formati Outlook "From:/Sent:" e "Da:/Data:" senza "A:",
-- che non devono regredire.
--
-- Questo trigger e' la seconda difesa, e sta sul PUNTO DI ARRIVO invece che
-- su uno dei percorsi: copre l'ingest, la pubblicazione manuale dell'admin e
-- qualunque via futura, senza dover ricordare di ripetere il controllo. Costa
-- una regexp per messaggio.
-- ============================================================================
create or replace function public._oscura_token_messaggio()
returns trigger
language plpgsql
as $fn$
begin
  if new.body is not null then
    new.body := regexp_replace(
                  regexp_replace(new.body, '([?&]claim=)[A-Za-z0-9._-]{12,}', '\1[rimosso]', 'gi'),
                  '(/disiscrizione[^[:space:]]*[?&]t=)[A-Za-z0-9._-]{12,}', '\1[rimosso]', 'gi');
  end if;
  return new;
end;
$fn$;
revoke all on function public._oscura_token_messaggio() from public, anon, authenticated;

drop trigger if exists trg_oscura_token_messaggio on public.thread_messages;
create trigger trg_oscura_token_messaggio
before insert or update of body on public.thread_messages
for each row execute function public._oscura_token_messaggio();

-- Bonifica dei messaggi gia' scritti. Nessun id in chiaro: la condizione
-- descrive il problema, non la riga. Idempotente.
update public.thread_messages
   set body = body
 where body ~* '[?&]claim=[A-Za-z0-9._-]{12,}'
    or body ~* '/disiscrizione[^[:space:]]*[?&]t=[A-Za-z0-9._-]{12,}';

-- NB oltre a questo, il messaggio pubblicato a mano il 25/08 e' stato tagliato
-- alla riga di citazione con:
--   regexp_replace(body, '\n[ \t]*(Da|From)[ \t]*:.*$', '', 'i')
-- riportandolo al solo testo scritto davvero ("non siamo interessati").
-- Intervento una tantum su dati esistenti, non riproducibile da schema.
-- VERIFICATO dopo: 0 messaggi su 10 contengono ancora token, e un inserimento
-- di prova con entrambi i tipi di link esce con "[rimosso]".
