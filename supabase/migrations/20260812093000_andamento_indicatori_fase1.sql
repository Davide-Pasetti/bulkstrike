-- =====================================================================
-- Andamento prezzi — Fase 1: modello "un indicatore per riga".
-- Nuove tabelle generali che affiancano market_index_history /
-- market_price_history (che restano finche' la migrazione non e' completa).
-- Seed dei 24 indicatori Eurostat (PPI mercato domestico Italia, sts_inppd_m)
-- e RPC di lettura (screener + serie) e scrittura (upsert per l'ingestion).
-- Licenza dati Eurostat: Decisione 2011/833/UE (riuso libero con attribuzione).
-- =====================================================================

create table if not exists public.market_indicators (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  nome          text not null,
  famiglia      text not null,   -- chimica|metalli|agroalimentare|energia_logistica|indici_globali
  tipo          text not null,   -- indice|prezzo
  unita         text not null,
  valuta        text,
  frequenza     text not null,   -- giornaliera|settimanale|mensile
  fonte         text not null,
  fonte_url     text,
  licenza       text,
  attribuzione  text,
  serie_ref     jsonb not null default '{}'::jsonb,
  pubblico      boolean not null default true,
  note_legali   text,
  attivo        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.market_indicator_history (
  id            uuid primary key default gen_random_uuid(),
  indicator_id  uuid not null references public.market_indicators(id) on delete cascade,
  ref_date      date not null,
  ref_date_end  date,
  valore        numeric not null,
  provvisorio   boolean not null default false,
  piazza        text,
  variante      text,
  raw           jsonb,
  created_at    timestamptz not null default now()
);
create unique index if not exists market_indicator_history_uq
  on public.market_indicator_history (indicator_id, ref_date, coalesce(piazza,''), coalesce(variante,''));
create index if not exists market_indicator_history_ind_date
  on public.market_indicator_history (indicator_id, ref_date);

create table if not exists public.product_indicators (
  product_id   uuid not null references public.products(id) on delete cascade,
  indicator_id uuid not null references public.market_indicators(id) on delete cascade,
  ruolo        text not null,   -- primario|benchmark
  created_at   timestamptz not null default now(),
  primary key (product_id, indicator_id, ruolo)
);

-- RLS: lettura consentita ma filtrata su 'pubblico'; scrittura solo service_role.
alter table public.market_indicators enable row level security;
alter table public.market_indicator_history enable row level security;
alter table public.product_indicators enable row level security;

drop policy if exists mi_read on public.market_indicators;
create policy mi_read on public.market_indicators for select
  using (pubblico = true or auth.role() = 'authenticated');

drop policy if exists mih_read on public.market_indicator_history;
create policy mih_read on public.market_indicator_history for select
  using (exists (select 1 from public.market_indicators mi
                 where mi.id = indicator_id and (mi.pubblico or auth.role() = 'authenticated')));

drop policy if exists pi_read on public.product_indicators;
create policy pi_read on public.product_indicators for select using (true);

revoke all on public.market_indicators from anon, authenticated;
revoke all on public.market_indicator_history from anon, authenticated;
revoke all on public.product_indicators from anon, authenticated;
grant select on public.market_indicators to anon, authenticated;
grant select on public.market_indicator_history to anon, authenticated;
grant select on public.product_indicators to anon, authenticated;

-- ---------------------------------------------------------------------
-- Seed dei 24 indicatori Eurostat (idempotente su slug).
-- famiglia: assegnazione iniziale, modificabile (e' solo una text column).
-- ---------------------------------------------------------------------
insert into public.market_indicators
  (slug, nome, famiglia, tipo, unita, valuta, frequenza, fonte, fonte_url, licenza, attribuzione, serie_ref, pubblico, attivo)
select
  'eurostat-'||lower(nace),
  nome, famiglia, 'indice', 'indice 2021=100', null, 'mensile',
  'Eurostat', 'https://ec.europa.eu/eurostat/databrowser/product/view/sts_inppd_m',
  '2011/833/UE', 'Fonte: Eurostat, dataset sts_inppd_m',
  jsonb_build_object('source','eurostat','dataset','sts_inppd_m','nace_r2',nace,
                     'unit','I21','indic_bt','PRC_PRR_DOM','s_adj','NSA','geo','IT','since','2015-01'),
  true, true
from (values
  ('C20',  'Prodotti chimici (totale) — Italia',                         'chimica'),
  ('C2011','Gas industriali — Italia',                                    'chimica'),
  ('C2013','Prodotti chimici inorganici di base — Italia',               'chimica'),
  ('C2014','Prodotti chimici organici di base — Italia',                 'chimica'),
  ('C2015','Fertilizzanti e composti azotati — Italia',                  'chimica'),
  ('C2016','Materie plastiche in forme primarie — Italia',              'chimica'),
  ('C203', 'Pitture, vernici e inchiostri — Italia',                     'chimica'),
  ('C2041','Detergenti, saponi e agenti tensioattivi — Italia',         'chimica'),
  ('C2059','Altri prodotti chimici n.c.a. — Italia',                     'chimica'),
  ('C21',  'Prodotti farmaceutici di base — Italia',                     'chimica'),
  ('C241', 'Ferro, acciaio e ferroleghe — Italia',                       'metalli'),
  ('C2442','Alluminio — Italia',                                         'metalli'),
  ('C2444','Rame — Italia',                                              'metalli'),
  ('C231', 'Vetro e prodotti in vetro — Italia',                         'metalli'),
  ('C2351','Cemento — Italia',                                           'metalli'),
  ('C10',  'Industria alimentare (totale) — Italia',                     'agroalimentare'),
  ('C104', 'Oli e grassi vegetali e animali — Italia',                   'agroalimentare'),
  ('C106', 'Prodotti della macinazione (farine e semole) — Italia',      'agroalimentare'),
  ('C108', 'Altri prodotti alimentari (zucchero, dolciumi) — Italia',    'agroalimentare'),
  ('C19',  'Coke e prodotti petroliferi raffinati — Italia',             'energia_logistica'),
  ('C17',  'Carta e prodotti di carta (imballaggi) — Italia',            'energia_logistica'),
  ('C22',  'Articoli in gomma e materie plastiche — Italia',            'energia_logistica'),
  ('C16',  'Legno e prodotti in legno (pallet) — Italia',                'energia_logistica'),
  ('C13',  'Prodotti tessili — Italia',                                  'energia_logistica')
) as t(nace, nome, famiglia)
on conflict (slug) do update set
  nome=excluded.nome, famiglia=excluded.famiglia, tipo=excluded.tipo, unita=excluded.unita,
  frequenza=excluded.frequenza, fonte=excluded.fonte, fonte_url=excluded.fonte_url,
  licenza=excluded.licenza, attribuzione=excluded.attribuzione, serie_ref=excluded.serie_ref,
  attivo=true;

-- ---------------------------------------------------------------------
-- upsert_indicator_history: usata dalle edge function di ingestion.
-- Risolve indicator_id dallo slug; ON CONFLICT sull'indice unico coalesce.
-- ---------------------------------------------------------------------
create or replace function public.upsert_indicator_history(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  with incoming as (
    select
      (r->>'indicator_slug')            as slug,
      (r->>'ref_date')::date            as ref_date,
      nullif(r->>'ref_date_end','')::date as ref_date_end,
      (r->>'valore')::numeric           as valore,
      coalesce((r->>'provvisorio')::boolean, false) as provvisorio,
      nullif(r->>'piazza','')           as piazza,
      nullif(r->>'variante','')         as variante,
      case when r ? 'raw' then r->'raw' else null end as raw
    from jsonb_array_elements(p_rows) r
  ),
  joined as (
    select mi.id as indicator_id, i.*
    from incoming i
    join public.market_indicators mi on mi.slug = i.slug
    where i.valore is not null
  ),
  ins as (
    insert into public.market_indicator_history
      (indicator_id, ref_date, ref_date_end, valore, provvisorio, piazza, variante, raw)
    select indicator_id, ref_date, ref_date_end, valore, provvisorio, piazza, variante, raw
    from joined
    on conflict (indicator_id, ref_date, coalesce(piazza,''), coalesce(variante,''))
    do update set valore = excluded.valore, provvisorio = excluded.provvisorio,
                  ref_date_end = excluded.ref_date_end, raw = excluded.raw
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;
revoke all on function public.upsert_indicator_history(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_indicator_history(jsonb) to service_role;

-- ---------------------------------------------------------------------
-- get_indicator_series: serie completa di UN indicatore (grafico espanso).
-- ---------------------------------------------------------------------
create or replace function public.get_indicator_series(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug', mi.slug, 'nome', mi.nome, 'famiglia', mi.famiglia, 'tipo', mi.tipo,
    'unita', mi.unita, 'valuta', mi.valuta, 'frequenza', mi.frequenza,
    'fonte', mi.fonte, 'fonte_url', mi.fonte_url, 'licenza', mi.licenza,
    'attribuzione', mi.attribuzione, 'pubblico', mi.pubblico,
    'last_date', (select max(h.ref_date) from public.market_indicator_history h where h.indicator_id = mi.id),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('t', h.ref_date, 'v', h.valore, 'provvisorio', h.provvisorio) order by h.ref_date)
      from public.market_indicator_history h
      where h.indicator_id = mi.id and h.piazza is null and h.variante is null
    ), '[]'::jsonb)
  )
  from public.market_indicators mi
  where mi.slug = p_slug and mi.attivo and (mi.pubblico or auth.role() = 'authenticated');
$$;
revoke all on function public.get_indicator_series(text) from public;
grant execute on function public.get_indicator_series(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- get_indicator_screener: una riga per indicatore visibile, con ultimo
-- valore, valore 12 mesi prima (per la variazione) e sparkline (24 punti).
-- ---------------------------------------------------------------------
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
         where h.indicator_id = v.id and h.ref_date = (a.last_date - interval '1 year')::date and h.piazza is null and h.variante is null limit 1) as value_yoy,
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
