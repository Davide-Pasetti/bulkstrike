-- Prodotti preferiti (equivalente di supplier_follows ma per i singoli PRODOTTI).
-- Stesso pattern: tabella con PK (buyer_company_id, product_id), RLS che espone
-- solo le proprie righe, scritture via RPC SECURITY DEFINER con guardia
-- auth_company_id(). Grants solo ad authenticated/service_role (mai anon).

create table if not exists public.product_follows (
  buyer_company_id uuid not null references public.companies(id),
  product_id uuid not null references public.products(id),
  created_at timestamptz not null default now(),
  primary key (buyer_company_id, product_id)
);

alter table public.product_follows enable row level security;

create policy product_follows_own_select on public.product_follows for select
  using (buyer_company_id = auth_company_id());

create or replace function public.follow_product(p_product uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth_company_id();
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_product is null then raise exception 'INVALID_PRODUCT'; end if;
  if not exists (select 1 from products where id = p_product) then raise exception 'PRODUCT_NOT_FOUND'; end if;
  insert into product_follows (buyer_company_id, product_id)
  values (v_me, p_product)
  on conflict (buyer_company_id, product_id) do nothing;
end $$;

create or replace function public.unfollow_product(p_product uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth_company_id();
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from product_follows where buyer_company_id = v_me and product_id = p_product;
end $$;

-- Restituisce i prodotti seguiti dall'azienda loggata (id + nome), per popolare
-- sia lo stato dei bottoni stella sia il filtro "Preferiti" di Catalogo/Aste.
create or replace function public.get_my_followed_products()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth_company_id();
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'product_id', f.product_id,
      'name', pr.canonical_name,
      'e_number', pr.e_number,
      'followed_at', f.created_at
    ) order by pr.canonical_name)
    from product_follows f
    join products pr on pr.id = f.product_id
    where f.buyer_company_id = v_me
  ), '[]'::jsonb);
end $$;

revoke execute on function public.follow_product(uuid) from public, anon;
revoke execute on function public.unfollow_product(uuid) from public, anon;
revoke execute on function public.get_my_followed_products() from public, anon;
grant execute on function public.follow_product(uuid) to authenticated, service_role;
grant execute on function public.unfollow_product(uuid) to authenticated, service_role;
grant execute on function public.get_my_followed_products() to authenticated, service_role;
