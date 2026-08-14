-- MIMIT: consolidamento delle righe giornaliere gia' inserite nella riga
-- SETTIMANALE. La nuova versione dell'edge function non persiste piu' il dato
-- giornaliero come serie: scrive solo la riga per settimana ISO (lunedi'->domenica)
-- con la media progressiva dentro raw.days {data:valore}. Qui si ricostruisce la
-- riga settimanale dai vecchi punti giornalieri (piazza='giorno') e li si elimina.
-- Idempotente: senza righe 'giorno' e' un no-op.
with g as (
  select h.indicator_id, date_trunc('week', h.ref_date)::date as monday,
         jsonb_object_agg(to_char(h.ref_date,'YYYY-MM-DD'), h.valore) as days,
         round(avg(h.valore)::numeric, 3) as v
  from public.market_indicator_history h
  join public.market_indicators mi on mi.id = h.indicator_id
  where mi.slug like 'mimit-%' and h.piazza = 'giorno'
  group by h.indicator_id, date_trunc('week', h.ref_date)
)
insert into public.market_indicator_history (indicator_id, ref_date, ref_date_end, valore, piazza, raw)
select indicator_id, monday, (monday + 6), v, null, jsonb_build_object('days', days) from g
on conflict (indicator_id, ref_date, coalesce(piazza,''), coalesce(variante,''))
do update set valore = excluded.valore, ref_date_end = excluded.ref_date_end, raw = excluded.raw;

delete from public.market_indicator_history h
using public.market_indicators mi
where h.indicator_id = mi.id and mi.slug like 'mimit-%' and h.piazza = 'giorno';
