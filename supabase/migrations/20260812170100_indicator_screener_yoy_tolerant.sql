-- Variazione 12 mesi tollerante: per le serie settimanali (DG-AGRI) non esiste
-- una riga a esattamente 1 anno di distanza, quindi si prende il punto piu' vicino
-- entro +/-20 giorni. Per le mensili (Eurostat/World Bank) resta di fatto il mese
-- esatto (distanza 0). Nessuna regressione.
create or replace function public.get_indicator_screener()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with vis as (
    select mi.* from public.market_indicators mi
    where mi.attivo and (mi.pubblico or auth.role() = 'authenticated')
  ),
  agg as (
    select h.indicator_id, max(h.ref_date) as last_date, count(*) as n
    from public.market_indicator_history h
    where h.piazza is null and h.variante is null
    group by h.indicator_id
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.famiglia, x.nome), '[]'::jsonb)
  from (
    select
      v.id, v.slug, v.nome, v.famiglia, v.tipo, v.unita, v.valuta, v.frequenza,
      v.fonte, v.fonte_url, v.licenza, v.attribuzione, v.pubblico,
      a.last_date,
      (select h.valore from public.market_indicator_history h
         where h.indicator_id = v.id and h.ref_date = a.last_date and h.piazza is null and h.variante is null limit 1) as last_value,
      (select h.provvisorio from public.market_indicator_history h
         where h.indicator_id = v.id and h.ref_date = a.last_date and h.piazza is null and h.variante is null limit 1) as last_provvisorio,
      (select h.valore from public.market_indicator_history h
         where h.indicator_id = v.id and h.piazza is null and h.variante is null
           and h.ref_date between (a.last_date - interval '1 year' - interval '20 days')::date
                              and (a.last_date - interval '1 year' + interval '20 days')::date
         order by abs(h.ref_date - (a.last_date - interval '1 year')::date) limit 1) as value_yoy,
      (select jsonb_agg(jsonb_build_object('t', s.ref_date, 'v', s.valore) order by s.ref_date)
         from (select ref_date, valore from public.market_indicator_history h
               where h.indicator_id = v.id and h.piazza is null and h.variante is null
               order by ref_date desc limit 24) s) as spark,
      coalesce(a.n, 0) as points
    from vis v left join agg a on a.indicator_id = v.id
  ) x;
$$;
revoke all on function public.get_indicator_screener() from public;
grant execute on function public.get_indicator_screener() to anon, authenticated;
