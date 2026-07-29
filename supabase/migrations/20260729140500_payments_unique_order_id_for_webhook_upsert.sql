-- Il webhook Stripe (payment_intent.succeeded/failed) fa upsert su payments
-- con onConflict: 'order_id' — richiede un vincolo UNIQUE che mancava
-- (errore 42P10 alla prima consegna riuscita). Una riga di pagamento per
-- ordine è il contratto del flusso escrow: il retry di un pagamento fallito
-- aggiorna la stessa riga, non ne crea una seconda.
-- Tabella vuota al momento dell'applicazione: nessun rischio di violazioni.
alter table public.payments
  add constraint payments_order_id_key unique (order_id);
