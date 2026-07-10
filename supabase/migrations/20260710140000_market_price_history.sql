-- FASE 2 — Storico prezzi di mercato (materie prime agricole).
-- Alimentata da edge function schedulate (ISMEA settimanale + CUN Grano Duro).
-- Prezzi in €/kg (convertiti da €/T della fonte). Vincolo legale: ovunque
-- mostrati devono comparire fonte (fonte/fonte_url) e la dicitura informativa.

create table if not exists public.market_price_history (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products(id) on delete cascade,
  grade             text,          -- categoria merceologica/grado (es. "Fino"); null = grado unico
  price_min         numeric,       -- €/kg
  price_max         numeric,       -- €/kg
  price_avg         numeric,       -- €/kg (se la fonte dà un solo valore: min=max=avg)
  currency          text not null default 'EUR',
  unit              text not null default 'kg',
  rilevazione_date  date not null, -- data del listino/rilevazione
  piazza            text,          -- "Bologna", "Foggia"…; null = media nazionale
  fonte             text not null, -- 'ISMEA' | 'CUN Grano Duro' | 'Borsa Merci Bologna'
  fonte_url         text,          -- link alla pagina/PDF ufficiale (obbligo di citazione)
  raw_label         text,          -- etichetta prodotto originale della fonte (audit mapping AI)
  created_at        timestamptz not null default now()
);

-- Idempotenza settimanale ROBUSTA AI NULL: in un vincolo UNIQUE i NULL sono
-- distinti tra loro, quindi grade/piazza NULL (grado unico / media nazionale)
-- genererebbero duplicati a ogni run del cron. Indice unique su espressione con
-- COALESCE (NULL → ''): una sola riga per (prodotto, grado, piazza, data, fonte)
-- anche quando grade e/o piazza sono NULL. L'upsert userà lo stesso target.
create unique index if not exists market_price_history_uniq
  on public.market_price_history (
    product_id,
    coalesce(grade, ''),
    coalesce(piazza, ''),
    rilevazione_date,
    fonte
  );

-- Lettura efficiente per il grafico (serie temporale per prodotto).
create index if not exists market_price_history_product_date
  on public.market_price_history (product_id, rilevazione_date desc);

alter table public.market_price_history enable row level security;

-- Lettura pubblica: sono prezzi indicativi pubblici (grafico Home, pagina prodotto).
drop policy if exists market_price_history_public_read on public.market_price_history;
create policy market_price_history_public_read on public.market_price_history
  for select using (true);

-- Scrittura solo service_role (le edge function di ingest girano con service key,
-- che bypassa la RLS). Nessun insert/update/delete per anon/authenticated.
revoke insert, update, delete on public.market_price_history from anon, authenticated;
grant select on public.market_price_history to anon, authenticated;
