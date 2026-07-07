-- Pagamenti: nuovi stati ordine per i metodi non-escrow.
-- 'awaiting_bank_transfer' = bonifico anticipato (il buyer deve pagare il fornitore).
-- 'terms_pending'          = termini dilazionati (nessun pagamento al checkout).
-- Aggiunti in una migration separata perché un nuovo valore enum non è usabile
-- nella stessa transazione in cui viene aggiunto.
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'awaiting_bank_transfer';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'terms_pending';
