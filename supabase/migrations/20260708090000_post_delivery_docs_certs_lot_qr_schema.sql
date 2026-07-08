-- Documenti prodotto (livello canonico): SDS + scheda tecnica (file su Storage).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS scheda_sicurezza_url text,
  ADD COLUMN IF NOT EXISTS scheda_tecnica_url text;

-- Certificati multipli per prodotto (uno-a-molti): tipo, file, eventuale scadenza.
CREATE TABLE IF NOT EXISTS public.product_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  cert_type text NOT NULL,
  label text,
  file_url text NOT NULL,
  expiry_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_certificates_type_check
    CHECK (cert_type IN ('alimentare','iso','bio','kosher','halal','altro'))
);
CREATE INDEX IF NOT EXISTS idx_product_certificates_product ON public.product_certificates(product_id);
ALTER TABLE public.product_certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_certificates_read ON public.product_certificates;
CREATE POLICY product_certificates_read ON public.product_certificates FOR SELECT USING (true);

-- Ordini: lotto (compilato dal fornitore) + token per il QR.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS lot_number text,
  ADD COLUMN IF NOT EXISTS receipt_token uuid NOT NULL DEFAULT gen_random_uuid();

-- Outbox: descrittori allegati + idempotenza (no doppi invii per (order, kind)).
ALTER TABLE public.emails_outbox
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS emails_outbox_order_kind_uniq
  ON public.emails_outbox(order_id, kind) WHERE order_id IS NOT NULL;

-- Bucket documenti prodotto (lettura pubblica).
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-docs','product-docs', true)
ON CONFLICT (id) DO NOTHING;
