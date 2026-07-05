// Tool disponibili per l'assistente WhatsApp di BulkStrike.
// Scope MVP: solo "quick order" da catalogo — niente asta/pool.

export const toolDefinitions = [
  {
    name: 'cerca_prodotto',
    description:
      "Cerca prodotti nel catalogo BulkStrike per nome o sinonimo (es. 'zucchero', 'soda caustica'). Restituisce fino a 8 prodotti corrispondenti con il loro id.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Termine di ricerca, in linguaggio naturale, anche parziale' },
      },
      required: ['query'],
    },
  },
  {
    name: 'opzioni_fornitore',
    description:
      'Dato un product_id e una quantità in kg, restituisce fino a 5 opzioni fornitore ordinate per prezzo al kg crescente (prezzo merce, IVA e trasporto esclusi).',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'id del prodotto (uuid)' },
        quantita_kg: { type: 'number', description: 'quantità richiesta in kg' },
      },
      required: ['product_id', 'quantita_kg'],
    },
  },
  {
    name: 'aggiungi_al_carrello',
    description: 'Aggiunge (o incrementa) una riga nel carrello del buyer collegato a questa conversazione WhatsApp.',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
        supplier_company_id: { type: 'string' },
        quantita_kg: { type: 'number' },
      },
      required: ['product_id', 'supplier_company_id', 'quantita_kg'],
    },
  },
  {
    name: 'riepilogo_carrello',
    description: 'Restituisce il contenuto attuale del carrello del buyer.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'ultimi_ordini',
    description: "Restituisce gli ultimi ordini completati del buyer, utile per proporre un riordino ('come l'ultima volta').",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'riordina',
    description: 'Rimette nel carrello prodotto/fornitore/quantità di un ordine passato, dato il suo order_id.',
    input_schema: {
      type: 'object',
      properties: { order_id: { type: 'string' } },
      required: ['order_id'],
    },
  },
  {
    name: 'link_checkout',
    description: 'Restituisce il link al carrello sul sito BulkStrike per completare indirizzo, corriere e pagamento.',
    input_schema: { type: 'object', properties: {} },
  },
]

async function upsertCartLine(supabase, companyId, productId, supplierCompanyId, quantityKg) {
  const { data: existing, error: selErr } = await supabase
    .from('cart_items')
    .select('id, quantity_kg')
    .eq('company_id', companyId)
    .eq('product_id', productId)
    .eq('supplier_company_id', supplierCompanyId)
    .maybeSingle()

  if (selErr) throw selErr

  if (existing) {
    const nuovaQuantita = Number(existing.quantity_kg) + Number(quantityKg)
    const { error: updErr } = await supabase.from('cart_items').update({ quantity_kg: nuovaQuantita }).eq('id', existing.id)
    if (updErr) throw updErr
    return { id: existing.id, quantity_kg: nuovaQuantita }
  }

  const { data: inserted, error: insErr } = await supabase
    .from('cart_items')
    .insert({ company_id: companyId, product_id: productId, supplier_company_id: supplierCompanyId, quantity_kg: quantityKg })
    .select('id, quantity_kg')
    .single()
  if (insErr) throw insErr
  return inserted
}

export async function executeTool(name, input, ctx) {
  const { supabase, companyId } = ctx

  switch (name) {
    case 'cerca_prodotto': {
      const { data, error } = await supabase.rpc('search_products_suggest', { p_q: input.query })
      if (error) throw error
      // dedup per product id (la RPC può restituire più righe, una per sinonimo)
      const seen = new Map()
      for (const row of data || []) {
        if (!seen.has(row.id)) seen.set(row.id, row)
      }
      return Array.from(seen.values()).slice(0, 8)
    }

    case 'opzioni_fornitore': {
      const { data, error } = await supabase
        .from('supplier_products')
        .select(
          'supplier_company_id, grade, origin, min_order_kg, lead_time_days, companies(legal_name, rating), price_tiers(price_per_kg, min_kg, max_kg)'
        )
        .eq('product_id', input.product_id)
        .eq('active', true)
        .eq('variant_status', 'approved')

      if (error) throw error

      const qty = Number(input.quantita_kg)
      const options = []
      for (const sp of data || []) {
        if (sp.min_order_kg && qty < sp.min_order_kg) continue
        const tier = (sp.price_tiers || []).find(
          (t) => Number(t.min_kg) <= qty && (t.max_kg == null || Number(t.max_kg) >= qty)
        )
        if (!tier) continue
        options.push({
          supplier_company_id: sp.supplier_company_id,
          fornitore: sp.companies?.legal_name,
          rating: sp.companies?.rating,
          grade: sp.grade,
          origin: sp.origin,
          lead_time_days: sp.lead_time_days,
          prezzo_kg: Number(tier.price_per_kg),
        })
      }
      options.sort((a, b) => a.prezzo_kg - b.prezzo_kg)
      return options.slice(0, 5)
    }

    case 'aggiungi_al_carrello': {
      return upsertCartLine(supabase, companyId, input.product_id, input.supplier_company_id, input.quantita_kg)
    }

    case 'riepilogo_carrello': {
      const { data, error } = await supabase
        .from('cart_items')
        .select('id, quantity_kg, products(canonical_name), fornitore:companies!cart_items_supplier_company_id_fkey(legal_name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    }

    case 'ultimi_ordini': {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, quantity_kg, unit_price_per_kg, created_at, products(canonical_name), fornitore:companies!orders_supplier_company_id_fkey(legal_name)'
        )
        .eq('buyer_company_id', companyId)
        .in('status', ['completed', 'delivered', 'accepted'])
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) throw error
      return data
    }

    case 'riordina': {
      const { data: order, error } = await supabase
        .from('orders')
        .select('product_id, supplier_company_id, quantity_kg, buyer_company_id')
        .eq('id', input.order_id)
        .single()
      if (error) throw error
      if (order.buyer_company_id !== companyId) {
        throw new Error('Ordine non appartenente a questo account')
      }
      return upsertCartLine(supabase, companyId, order.product_id, order.supplier_company_id, order.quantity_kg)
    }

    case 'link_checkout': {
      return { url: 'https://bulkstrike.com/dashboard?section=carrello' }
    }

    default:
      throw new Error(`Tool non riconosciuto: ${name}`)
  }
}
