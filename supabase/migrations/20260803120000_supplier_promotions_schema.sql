-- DAV-76 — Bacheca Promozioni (supplier fixed-discount promotions).
-- NB: NON e' un'asta. E' un prezzo scontato fisso pubblicato dal fornitore per
-- un tempo limitato. Nessuna terminologia da asta ("asta a ribasso", ecc.).
-- Questo file: solo schema + RLS + colonne collegate. RPC e cron in file separati.

create table if not exists public.supplier_promotions (
  id                       uuid primary key default gen_random_uuid(),
  supplier_company_id      uuid not null references public.companies(id) on delete cascade,
  product_id               uuid not null references public.products(id) on delete cascade,
  supplier_product_id      uuid references public.supplier_products(id) on delete set null,
  discounted_price_per_kg  numeric not null check (discounted_price_per_kg > 0),
  base_price_reference     numeric not null,
  -- Numero di giorni di storico effettivamente usati per la media (days_used),
  -- congelato alla creazione: il frontend mostra "6 mesi" solo se >= 180.
  base_price_window_days   int not null,
  discount_percent         numeric not null,
  starts_at                timestamptz not null,
  ends_at                  timestamptz not null,
  available_kg             numeric check (available_kg is null or available_kg > 0),
  sold_kg                  numeric not null default 0 check (sold_kg >= 0),
  status                   text not null default 'pending_review'
    check (status in ('pending_review','scheduled','active','expired','cancelled','rejected')),
  rejection_reason         text,
  created_by               uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- durata: positiva e massimo 14 giorni
  constraint supplier_promotions_window_chk
    check (ends_at > starts_at and ends_at <= starts_at + interval '14 days')
);

comment on table public.supplier_promotions is
  'Bacheca Promozioni (DAV-76): sconto fisso a tempo pubblicato da un fornitore. Non e'' un''asta.';

create index if not exists idx_supplier_promotions_active
  on public.supplier_promotions (ends_at)
  where status = 'active';
create index if not exists idx_supplier_promotions_supplier_product
  on public.supplier_promotions (supplier_company_id, product_id, starts_at);
create index if not exists idx_supplier_promotions_status
  on public.supplier_promotions (status);

-- Collegamenti su ordini e carrello (nullable: la stragrande maggioranza degli
-- ordini NON e' una promozione).
alter table public.orders
  add column if not exists promotion_id uuid references public.supplier_promotions(id);
alter table public.cart_items
  add column if not exists promotion_id uuid references public.supplier_promotions(id) on delete cascade;

create index if not exists idx_orders_promotion
  on public.orders (promotion_id) where promotion_id is not null;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Lettura pubblica SOLO delle righe attive (la bacheca). Il fornitore
-- proprietario vede sempre tutte le sue righe. Nessuna policy di scrittura:
-- ogni insert/update passa esclusivamente dalle RPC SECURITY DEFINER.
alter table public.supplier_promotions enable row level security;

drop policy if exists promotions_public_read_active on public.supplier_promotions;
create policy promotions_public_read_active
  on public.supplier_promotions for select
  to anon, authenticated
  using (status = 'active');

drop policy if exists promotions_owner_read on public.supplier_promotions;
create policy promotions_owner_read
  on public.supplier_promotions for select
  to authenticated
  using (supplier_company_id = public.auth_company_id());

-- Le policy di lettura richiedono il privilegio SELECT sulla tabella. Le
-- scritture restano bloccate (nessun grant insert/update/delete): solo le RPC
-- (SECURITY DEFINER, owner) scrivono. service_role bypassa comunque la RLS.
revoke all on public.supplier_promotions from anon, authenticated;
grant select on public.supplier_promotions to anon, authenticated;
