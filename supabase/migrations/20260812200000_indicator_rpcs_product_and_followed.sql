-- Fase 5 — RPC di supporto al collegamento prodotto→indicatore.

-- Slug degli indicatori legati (via product_indicators) ai prodotti che l'utente
-- segue: nuova semantica del filtro "Preferiti" su /andamento-prezzi.
create or replace function public.get_my_followed_indicators()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(distinct mi.slug), '[]'::jsonb)
  from public.product_follows pf
  join public.product_indicators pi on pi.product_id = pf.product_id
  join public.market_indicators mi on mi.id = pi.indicator_id
  where pf.buyer_company_id = public.auth_company_id()
    and mi.attivo and (mi.pubblico or auth.role() = 'authenticated');
$$;
revoke all on function public.get_my_followed_indicators() from public, anon;
grant execute on function public.get_my_followed_indicators() to authenticated;

-- Indicatore primario (+ eventuale benchmark) di un prodotto, per la scheda
-- prodotto: metadati + ultimo valore + valore di ~1 anno prima + sparkline (24).
create or replace function public.get_product_indicators(p_product uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with linked as (
    select pi.ruolo, mi.*
    from public.product_indicators pi
    join public.market_indicators mi on mi.id = pi.indicator_id
    where pi.product_id = p_product and mi.attivo and (mi.pubblico or auth.role() = 'authenticated')
  ),
  built as (
    select l.ruolo, jsonb_build_object(
      'slug', l.slug, 'nome', l.nome, 'famiglia', l.famiglia, 'tipo', l.tipo,
      'unita', l.unita, 'valuta', l.valuta, 'frequenza', l.frequenza,
      'fonte', l.fonte, 'fonte_url', l.fonte_url, 'licenza', l.licenza, 'attribuzione', l.attribuzione,
      'last_date', (select max(h.ref_date) from public.market_indicator_history h where h.indicator_id=l.id and h.piazza is null and h.variante is null),
      'last_value', (select h.valore from public.market_indicator_history h where h.indicator_id=l.id and h.piazza is null and h.variante is null order by h.ref_date desc limit 1),
      'value_yoy', (select h.valore from public.market_indicator_history h
                     where h.indicator_id=l.id and h.piazza is null and h.variante is null
                       and h.ref_date <= ((select max(h2.ref_date) from public.market_indicator_history h2 where h2.indicator_id=l.id and h2.piazza is null and h2.variante is null) - interval '1 year' + interval '20 days')::date
                     order by h.ref_date desc limit 1),
      'spark', (select jsonb_agg(jsonb_build_object('t', s.ref_date, 'v', s.valore) order by s.ref_date)
                 from (select ref_date, valore from public.market_indicator_history h
                       where h.indicator_id=l.id and h.piazza is null and h.variante is null
                       order by ref_date desc limit 24) s)
    ) as obj
    from linked l
  )
  select jsonb_build_object(
    'primario', (select obj from built where ruolo='primario' limit 1),
    'benchmark', (select obj from built where ruolo='benchmark' limit 1)
  );
$$;
revoke all on function public.get_product_indicators(uuid) from public;
grant execute on function public.get_product_indicators(uuid) to anon, authenticated;
