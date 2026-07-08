-- STEP 1 del task "Edge Function invio email conferma consegna".
--
-- Riuso dell'infrastruttura già creata dal sistema notifiche post-consegna
-- (migration 20260708090000): NON si duplicano tabelle/colonne esistenti.
--   • product_certifications  → esiste già come public.product_certificates
--       (product_id, cert_type ∈ {alimentare,iso,bio,kosher,halal,altro},
--        label = nome documento, file_url, expiry_date = data scadenza).
--   • scheda_sicurezza_url / scheda_tecnica_url → già presenti su public.products.
--   • Il "sub-ordine" è la riga public.orders (un prodotto per ordine, per
--     fornitore: nessuna tabella order_items). Lotto = orders.lot_number.
--
-- Qui si aggiunge solo il LOG invii Resend, che è nuovo (emails_outbox è una coda
-- generica; delivery_email_log tiene l'audit Resend con resend_email_id).

CREATE TABLE IF NOT EXISTS public.delivery_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  recipient_email text,
  status text NOT NULL CHECK (status IN ('sent','failed')),
  resend_email_id text,
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- Per verificare rapidamente se un'email è già stata inviata (idempotenza).
CREATE INDEX IF NOT EXISTS idx_delivery_email_log_sub_order
  ON public.delivery_email_log(sub_order_id);

-- Accesso solo tramite service role (Edge Function) / eventuali RPC admin futuri.
ALTER TABLE public.delivery_email_log ENABLE ROW LEVEL SECURITY;
