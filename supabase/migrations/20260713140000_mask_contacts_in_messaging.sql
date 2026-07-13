-- Mascheramento contatti (email/telefono) nella messaggistica diretta finché non
-- esiste un ordine CONFERMATO tra le due aziende. Mascheramento IN LETTURA
-- (retroattivo e reversibile): il testo originale resta nel DB, viene nascosto
-- solo in uscita in base allo stato ordine ATTUALE.

-- Esiste un ordine "confermato" tra due aziende? (da escrow pagato in poi)
create or replace function public.has_confirmed_order_between(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from orders o
    where o.status in ('paid','shipped','delivered','accepted','completed')
      and ((o.buyer_company_id = p_a and o.supplier_company_id = p_b)
        or (o.buyer_company_id = p_b and o.supplier_company_id = p_a))
  );
$$;

-- Maschera email e numeri di telefono in un testo libero. Conservativo sui numeri
-- (richiede + iniziale o >= ~9 caratteri tra cifre/separatori) per non toccare
-- prezzi/quantità corti. Riduce, non elimina: contatti "scritti a parole" restano.
create or replace function public.mask_contacts(p text)
returns text
language sql immutable
as $$
  select regexp_replace(
           regexp_replace(
             coalesce(p, ''),
             '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}',
             '[contatto nascosto]', 'gi'
           ),
           '(\+?\d[\d[:space:].()/-]{7,}\d)',
           '[contatto nascosto]', 'g'
         );
$$;

-- get_thread_messages: ora ritorna { contacts_masked, messages[] } e maschera i
-- corpi se non c'e' ordine confermato tra le parti.
create or replace function public.get_thread_messages(p_thread uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth_company_id();
  v_t message_threads%rowtype;
  v_masked boolean;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_t from message_threads where id = p_thread;
  if v_t.id is null or v_me not in (v_t.buyer_company_id, v_t.supplier_company_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  v_masked := not has_confirmed_order_between(v_t.buyer_company_id, v_t.supplier_company_id);
  return jsonb_build_object(
    'contacts_masked', v_masked,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'mine', m.sender_company_id = v_me,
        'body', case when v_masked then mask_contacts(m.body) else m.body end,
        'created_at', m.created_at,
        'read_at', m.read_at
      ) order by m.created_at)
      from thread_messages m where m.thread_id = p_thread
    ), '[]'::jsonb)
  );
end $$;

-- get_my_message_threads: maschera l'anteprima last_message per i thread senza
-- ordine confermato.
create or replace function public.get_my_message_threads()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth_company_id();
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'other_company_id', case when t.buyer_company_id = v_me then t.supplier_company_id else t.buyer_company_id end,
      'other_name', c.legal_name,
      'other_logo', c.logo_url,
      'my_role', case when t.buyer_company_id = v_me then 'buyer' else 'supplier' end,
      'order_id', t.order_id,
      'last_message_at', t.last_message_at,
      'last_message', (
        select case when has_confirmed_order_between(t.buyer_company_id, t.supplier_company_id)
                    then left(m.body, 140)
                    else left(mask_contacts(m.body), 140) end
        from thread_messages m where m.thread_id = t.id order by m.created_at desc limit 1
      ),
      'last_message_mine', (select m.sender_company_id = v_me from thread_messages m where m.thread_id = t.id order by m.created_at desc limit 1),
      'unread', (select count(*) from thread_messages m where m.thread_id = t.id and m.sender_company_id <> v_me and m.read_at is null)
    ) order by t.last_message_at desc)
    from message_threads t
    join companies c on c.id = case when t.buyer_company_id = v_me then t.supplier_company_id else t.buyer_company_id end
    where t.buyer_company_id = v_me or t.supplier_company_id = v_me
  ), '[]'::jsonb);
end $$;

-- send_message: maschera anche il corpo della NOTIFICA se non c'e' ordine confermato.
create or replace function public.send_message(p_thread uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth_company_id();
  v_t message_threads%rowtype;
  v_other uuid;
  v_msg uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_had_unread boolean;
  v_my_name text;
  v_notif_body text;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then raise exception 'INVALID_BODY'; end if;
  select * into v_t from message_threads where id = p_thread;
  if v_t.id is null or v_me not in (v_t.buyer_company_id, v_t.supplier_company_id) then
    raise exception 'NOT_ALLOWED';
  end if;
  v_other := case when v_t.buyer_company_id = v_me then v_t.supplier_company_id else v_t.buyer_company_id end;

  select exists (
    select 1 from thread_messages m
    where m.thread_id = p_thread and m.sender_company_id = v_me and m.read_at is null
  ) into v_had_unread;

  insert into thread_messages (thread_id, sender_company_id, body)
  values (p_thread, v_me, v_body)
  returning id into v_msg;

  update message_threads set last_message_at = now() where id = p_thread;

  if not v_had_unread then
    select legal_name into v_my_name from companies where id = v_me;
    v_notif_body := case when has_confirmed_order_between(v_t.buyer_company_id, v_t.supplier_company_id)
                         then left(v_body, 160) else left(mask_contacts(v_body), 160) end;
    insert into notifications (company_id, type, title, body, action_label, action_url)
    values (v_other, 'message',
            'Nuovo messaggio da ' || coalesce(v_my_name, 'un''azienda BulkStrike'),
            v_notif_body,
            'Apri i messaggi', '/messaggi?thread=' || p_thread);
  end if;

  return v_msg;
end $$;
