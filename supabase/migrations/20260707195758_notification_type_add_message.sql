-- Nuovo tipo di notifica per la messaggistica diretta buyer<->fornitore
alter type notification_type add value if not exists 'message';
