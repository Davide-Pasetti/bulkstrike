-- Tabella specifiche tecniche per prodotto (formato "long": una riga per campo).
-- Alimenta il pannello "scheda tecnica completa" della pagina prodotto.
-- RLS coerente col progetto: lettura pubblica (SELECT a public), scrittura solo
-- service_role (import via migration). Nessun grant di scrittura ad anon/authenticated.
create table if not exists public.product_specs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  campo text not null,
  valore text not null,
  ordine int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_specs_product on public.product_specs(product_id, ordine);

alter table public.product_specs enable row level security;

create policy product_specs_read on public.product_specs for select to public using (true);

grant select on public.product_specs to anon, authenticated;
grant all on public.product_specs to service_role;
