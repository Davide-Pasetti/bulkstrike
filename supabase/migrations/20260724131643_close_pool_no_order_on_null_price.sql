-- Rete di sicurezza: con la guardia in open_pool questo caso non dovrebbe piu'
-- accadere, ma se il prezzo standard viene tolto DOPO l'apertura (il fornitore
-- disattiva supplier_products o cancella price_tiers mentre l'asta e' aperta),
-- close_pool nel ramo "nessuna offerta viva" creava ordini con
-- unit_price_per_kg/goods_subtotal NULL. Ora, se non c'e' prezzo, l'asta si
-- chiude come 'cancelled' SENZA vincitore e SENZA ordini, con evento
-- 'closed_no_price' e notifica ai partecipanti. Non solleva eccezione: chiamata
-- da cron, un'eccezione lascerebbe l'asta bloccata in stato 'open'.
-- Il resto della logica d'asta (fase finale, contro-offerte, prezzo con offerte
-- valide) e' INVARIATO.
CREATE OR REPLACE FUNCTION public.close_pool(p_pool uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_product uuid; v_volume numeric; v_status pool_status; v_closes timestamptz;
        v_bid_supplier uuid; v_bid_price numeric; v_std_supplier uuid; v_std_price numeric; v_name text;
begin
  select product_id, total_volume_kg, status, closes_at into v_product, v_volume, v_status, v_closes
  from pools where id = p_pool for update;
  if v_status <> 'open' then return; end if;

  select supplier_company_id, price_per_kg into v_bid_supplier, v_bid_price
  from bids where pool_id = p_pool and status = 'winning' limit 1;
  select supplier, price into v_std_supplier, v_std_price from _best_standard_price(v_product, greatest(v_volume, 1));
  select canonical_name into v_name from products where id = v_product;

  if v_bid_price is null then
    -- Rete di sicurezza: prezzo standard sparito dopo l'apertura → niente ordine
    -- fantasma. Chiusura senza vincitore, partecipanti avvisati.
    if v_std_supplier is null or v_std_price is null then
      update pools set status = 'cancelled', final_phase_ends_at = now(), updated_at = now()
      where id = p_pool;
      insert into pool_events (pool_id, event_type, data)
      values (p_pool, 'closed_no_price', jsonb_build_object('reason', 'no standard price available at close'));
      insert into notifications (company_id, type, product_id, pool_id, title, body, action_label)
      select pp.buyer_company_id, 'system'::notification_type, v_product, p_pool, v_name,
        'L''asta ' || v_name || ' si è chiusa senza un prezzo disponibile: il fornitore non ha più un listino per questo prodotto. Nessun ordine è stato creato.',
        'Vedi prodotto'
      from pool_participants pp where pp.pool_id = p_pool;
      return;
    end if;

    -- nessuna offerta live: prezzo standard, chiusura immediata (rischio zero per l'acquirente)
    update pools set status = 'closed', winner_supplier_company_id = v_std_supplier,
                     final_price_per_kg = v_std_price, final_phase_ends_at = now(), updated_at = now()
    where id = p_pool;
    insert into pool_events (pool_id, event_type, data)
    values (p_pool, 'closed_no_bids', jsonb_build_object('price', v_std_price));
    perform _finalize_orders(p_pool, v_std_supplier, v_std_price, v_name, v_product);
    return;
  end if;

  -- apri la fase finale delle contro-offerte (5 minuti, max +10 dalla scadenza)
  update pools set status = 'final_phase', winner_supplier_company_id = v_bid_supplier,
                   final_price_per_kg = v_bid_price,
                   final_phase_ends_at = least(now() + interval '5 minutes', v_closes + interval '10 minutes'),
                   updated_at = now()
  where id = p_pool;
  insert into pool_events (pool_id, event_type, actor_company_id, data)
  values (p_pool, 'final_phase_started', v_bid_supplier, jsonb_build_object('price', v_bid_price));

  insert into notifications (company_id, type, product_id, pool_id, title, body, action_label)
  values (v_bid_supplier, 'order_update', v_product, p_pool, v_name,
    'Sei in testa nel pool ' || v_name || ' a ' || _eur(v_bid_price) || '/kg. Fase finale aperta: difendi la posizione.',
    'Vai al pool');

  insert into notifications (company_id, type, product_id, pool_id, title, body, action_label)
  select distinct b.supplier_company_id, 'outbid'::notification_type, v_product, p_pool, v_name,
    'Il pool ' || v_name || ' è chiuso a ' || _eur(v_bid_price) || '/kg. Hai 5 minuti per una contro-offerta.',
    'Contro-offerta'
  from bids b
  where b.pool_id = p_pool and b.supplier_company_id <> v_bid_supplier
    and exists (select 1 from watched_materials w where w.company_id = b.supplier_company_id and w.product_id = v_product and w.alert_outbid);
end;
$function$;

-- CREATE OR REPLACE azzera i grant ai default: riapplicare (revoke da PUBLIC).
REVOKE ALL ON FUNCTION public.close_pool(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_pool(uuid) TO service_role;
