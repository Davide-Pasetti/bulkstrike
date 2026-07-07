-- Coda email in uscita. Nessun provider collegato ora (BulkStrike S.r.l. non
-- ancora costituita → nessun dominio/mittente verificato): le righe restano
-- 'queued' finché un modulo futuro (es. Resend) non le drena. Contiene SOLO dati
-- non bancari (mai IBAN/BIC).
CREATE TABLE IF NOT EXISTS public.emails_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  to_company_id uuid REFERENCES public.companies(id),
  to_email text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body_html text,
  body_text text,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT emails_outbox_status_check CHECK (status IN ('queued','sent','failed'))
);
-- RLS attiva senza policy: nessun accesso dai client. Solo funzioni SECURITY
-- DEFINER e il service role possono scrivere/leggere.
ALTER TABLE public.emails_outbox ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.emails_outbox IS 'Outbox email transazionali. Nessun provider ancora collegato. Mai contenere dati bancari (IBAN/BIC).';
