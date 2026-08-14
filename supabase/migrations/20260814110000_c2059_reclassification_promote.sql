-- Riclassificazione dei prodotti finiti nel bucket-discarica "Altri prodotti
-- chimici n.c.a." (C2059). Un secondo classificatore (formula organico/inorganico
-- + merch_classes + nome) ridistribuisce quelli con un segnale chiaro fra le
-- sotto-serie chimiche; la proposta e' in public.product_indicator_proposal_c2059
-- (staging, colonna primario_nuovo). Qui si promuovono SOLO i riclassificati
-- (primario_nuovo <> c2059): si sposta il link 'primario' da C2059 alla nuova
-- serie. I 158 senza segnale restano su C2059 (sono genuinamente "altri chimici").
-- Idempotente. No-op se la tabella di staging non esiste.
do $$
begin
  if to_regclass('public.product_indicator_proposal_c2059') is null then
    raise notice 'staging c2059 assente: skip';
    return;
  end if;

  delete from public.product_indicators pi
  using public.product_indicator_proposal_c2059 pc,
        public.market_indicators old_mi
  where pc.product_id = pi.product_id
    and pc.primario_nuovo <> 'eurostat-c2059'
    and old_mi.slug = 'eurostat-c2059'
    and pi.indicator_id = old_mi.id
    and pi.ruolo = 'primario';

  insert into public.product_indicators (product_id, indicator_id, ruolo)
  select pc.product_id, mi.id, 'primario'
  from public.product_indicator_proposal_c2059 pc
  join public.market_indicators mi on mi.slug = pc.primario_nuovo
  where pc.primario_nuovo <> 'eurostat-c2059'
  on conflict (product_id, indicator_id, ruolo) do nothing;
end $$;
