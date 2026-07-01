// lib/api.js
// BulkStrike data-access layer. Every function maps to the schema in
// bulkstrike_schema.sql and respects its RLS. Import the singleton client.
import { supabase } from "./supabase";

/* ============================================================================
 * AUTH
 * ========================================================================== */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data; // { user, session }
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Subscribe to auth state (login/logout). Returns an unsubscribe function.
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

/* ============================================================================
 * REGISTRATION
 * ----------------------------------------------------------------------------
 * Two steps: (1) create the auth user, (2) call the SECURITY DEFINER RPC
 * `register_company` which atomically inserts companies + profiles +
 * watched_materials server-side (see supabase_register_function.sql).
 *
 * `form` is the object built by BulkStrikeRegister.jsx:
 *   { type: 'buyer'|'supplier', email, pass, company, vat, country, city,
 *     address, phone, website, contact, bulk (supplier: producer?),
 *     emailMgmt, emailAdmin, pec, sdi, ibanHolder, iban, bic,
 *     capacity, served:[], materials: { name: {pool,price,supplier,closing,request,outbid} } }
 * ========================================================================== */
export async function registerCompany(form) {
  // 1) create the auth user (sets the session)
  const auth = await signUp(form.email, form.pass);
  if (!auth.user) throw new Error("Registrazione non riuscita: utente non creato.");

  const isSupplier = form.type === "supplier";

  // map the per-material alert flags (frontend keys -> unified columns)
  const materials = Object.entries(form.materials || {}).map(([name, a]) => ({
    name,
    alert_pool: !!a.pool,
    alert_price: !!a.price,
    alert_new_supplier: !!a.supplier,
    alert_closing: !!a.closing,
    alert_request: !!a.request,
    alert_outbid: !!a.outbid,
  }));

  const payload = {
    legal_name: form.company,
    vat: form.vat || null,
    country: form.country || "Italia",
    city: form.city || null,
    address: form.address || null,
    phone: form.phone || null,
    website: form.website || null,
    contact_name: form.contact || null,
    email: form.email,
    is_supplier: isSupplier,
    supplier_type: isSupplier ? (form.bulk ? "producer" : "distributor") : null,
    email_mgmt: form.emailMgmt || null,
    email_admin: form.emailAdmin || null,
    pec: form.pec || null,
    sdi: form.sdi || null,
    iban_holder: isSupplier ? form.ibanHolder || null : null,
    iban: isSupplier ? form.iban || null : null,
    bic: isSupplier ? form.bic || null : null,
    production_capacity: isSupplier ? form.capacity || null : null,
    countries_served: isSupplier ? form.served || [] : [],
    materials,
  };

  // 2) atomic server-side insert; resolves product_id by name, returns company id
  const { data, error } = await supabase.rpc("register_company", { payload });
  if (error) throw error;
  return data; // company uuid
}

/* ============================================================================
 * ACCOUNT / COMPANY
 * ========================================================================== */
export async function getMyCompanyId() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) throw error;
  return data?.company_id ?? null;
}

export async function getMyCompany() {
  const companyId = await getMyCompanyId();
  if (!companyId) return null;
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();
  if (error) throw error;
  return data;
}

// patch: any subset of company columns (e.g. { phone, notify_sms, iban })
export async function updateCompany(patch) {
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("Nessuna azienda associata all'utente.");
  const { data, error } = await supabase
    .from("companies")
    .update(patch)
    .eq("id", companyId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ============================================================================
 * WATCHED MATERIALS & ALERTS
 * ========================================================================== */
export async function getWatchedMaterials() {
  const companyId = await getMyCompanyId();
  if (!companyId) return [];
  const { data, error } = await supabase
    .from("watched_materials")
    .select(`
      id, product_id, custom_name,
      alert_pool, alert_price, alert_new_supplier, alert_closing, alert_request, alert_outbid,
      product:products ( id, canonical_name, cas_number, e_number )
    `)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  // normalise a display name whether catalog product or custom
  return (data || []).map((m) => ({ ...m, name: m.product?.canonical_name || m.custom_name }));
}

// product: { id?: uuid, name: string }. If no id, stored as custom_name.
export async function addWatchedMaterial(product, alerts = {}) {
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("Nessuna azienda associata all'utente.");
  const row = {
    company_id: companyId,
    product_id: product.id || null,
    custom_name: product.id ? null : product.name,
    alert_pool: alerts.pool ?? true,
    alert_price: alerts.price ?? false,
    alert_new_supplier: alerts.supplier ?? false,
    alert_closing: alerts.closing ?? true,
    alert_request: alerts.request ?? false,
    alert_outbid: alerts.outbid ?? false,
  };
  const { data, error } = await supabase.from("watched_materials").insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function removeWatchedMaterial(id) {
  const { error } = await supabase.from("watched_materials").delete().eq("id", id);
  if (error) throw error;
}

// column is one of: alert_pool, alert_price, alert_new_supplier, alert_closing, alert_request, alert_outbid
export async function updateMaterialAlert(id, column, value) {
  const { data, error } = await supabase
    .from("watched_materials")
    .update({ [column]: value })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ============================================================================
 * NOTIFICATIONS  (+ realtime)
 * ========================================================================== */
export async function getNotifications(limit = 50) {
  const companyId = await getMyCompanyId();
  if (!companyId) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const companyId = await getMyCompanyId();
  if (!companyId) return;
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("company_id", companyId)
    .eq("is_read", false);
  if (error) throw error;
}

// Realtime: invoke `onInsert(notification)` whenever a new row arrives for this
// company. Returns an unsubscribe function. (Enable Realtime on the table in
// Supabase → Database → Replication.)
export function subscribeNotifications(companyId, onInsert) {
  const channel = supabase
    .channel(`notifications:${companyId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `company_id=eq.${companyId}` },
      (payload) => onInsert(payload.new)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/* ============================================================================
 * POOLS  (read; the open/close/counter-offer engine lives server-side)
 * ========================================================================== */
export async function getActivePools() {
  const { data, error } = await supabase
    .from("pools")
    .select(`
      id, status, pallet_kg, total_volume_kg, best_price_per_kg, closes_at, final_phase_ends_at,
      product:products ( id, canonical_name, e_number )
    `)
    .in("status", ["open", "final_phase"])
    .order("closes_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

// pools this company participates in (buyer) — used in the dashboard "Pool attivi"
export async function getMyPools() {
  const companyId = await getMyCompanyId();
  if (!companyId) return [];
  const { data, error } = await supabase
    .from("pool_participants")
    .select(`
      quantity_kg,
      pool:pools ( id, status, total_volume_kg, best_price_per_kg, closes_at, final_phase_ends_at,
                   product:products ( canonical_name ) )
    `)
    .eq("buyer_company_id", companyId);
  if (error) throw error;
  return (data || []).map((r) => ({ ...r.pool, my_quantity_kg: r.quantity_kg }));
}

/* ============================================================================
 * TAXONOMY (drives the materials picker; replaces the hardcoded maps)
 * ========================================================================== */
export async function getSectorsWithProducts() {
  const { data, error } = await supabase
    .from("sectors")
    .select(`
      id, name, slug,
      product_sectors ( product:products ( id, canonical_name ) )
    `)
    .order("name");
  if (error) throw error;
  return (data || []).map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    products: (s.product_sectors || []).map((ps) => ps.product).filter(Boolean),
  }));
}

// free-text product search across canonical names + synonyms (for the search box)
export async function searchProducts(query) {
  if (!query || query.trim().length < 2) return [];
  const { data, error } = await supabase
    .from("products")
    .select("id, canonical_name, cas_number, e_number")
    .ilike("canonical_name", `%${query}%`)
    .limit(20);
  if (error) throw error;
  return data || [];
}

/* ============================================================================
 * POOL ACTIONS & ORDERS  (drive the server-side engine via RPC)
 * ----------------------------------------------------------------------------
 * RPC parameter names MUST match the SQL function arguments exactly.
 * On error, Supabase returns e.message = the SQL exception code (e.g.
 * 'BID_NOT_LOWER'); map it with poolErrorMessage() for a friendly Italian text.
 * ========================================================================== */

// open a new pool for a product (quantity >= one pallet). Returns the pool id.
export async function openPool(productId, quantityKg, acceptDisclaimer = true) {
  const { data, error } = await supabase.rpc("open_pool", {
    p_product: productId, p_quantity: quantityKg, p_accept: acceptDisclaimer,
  });
  if (error) throw error;
  return data; // pool uuid
}

// join an existing open pool (inherits its deadline). Buyer must accept the disclaimer.
export async function joinPool(poolId, quantityKg, acceptDisclaimer = true) {
  const { error } = await supabase.rpc("join_pool", {
    p_pool: poolId, p_quantity: quantityKg, p_accept: acceptDisclaimer,
  });
  if (error) throw error;
}

// supplier underbids live during the auction (price must be lower than the best)
export async function placeBid(poolId, pricePerKg) {
  const { error } = await supabase.rpc("place_bid", { p_pool: poolId, p_price: pricePerKg });
  if (error) throw error;
}

// losing supplier counter-offer in the final phase (one per pool)
export async function submitCounterOffer(poolId, pricePerKg) {
  const { error } = await supabase.rpc("submit_counter_offer", { p_pool: poolId, p_price: pricePerKg });
  if (error) throw error;
}

// winner responds to a specific counter-offer (one per counter)
export async function respondCounterOffer(counterOfferId, pricePerKg) {
  const { error } = await supabase.rpc("respond_counter_offer", { p_counter: counterOfferId, p_price: pricePerKg });
  if (error) throw error;
}

// instant buy: pass a supplierId to pick one, or omit for the best standard price
export async function createInstantOrder(productId, quantityKg, supplierId = null) {
  const { data, error } = await supabase.rpc("create_instant_order", {
    p_product: productId, p_quantity: quantityKg, p_supplier: supplierId,
  });
  if (error) throw error;
  return data; // order uuid
}

// order lifecycle
export async function markOrderShipped(orderId) {
  const { error } = await supabase.rpc("mark_order_shipped", { p_order: orderId });
  if (error) throw error;
}
export async function confirmDelivery(orderId) {
  const { error } = await supabase.rpc("confirm_delivery", { p_order: orderId });
  if (error) throw error;
}

/* ----- Pool reads (for the Pool page) ----- */
export async function getPoolDetail(poolId) {
  const { data, error } = await supabase
    .from("pools")
    .select(`
      id, status, pallet_kg, total_volume_kg, best_price_per_kg, final_price_per_kg,
      closes_at, final_phase_ends_at,
      product:products ( id, canonical_name, e_number ),
      participants:pool_participants ( count )
    `)
    .eq("id", poolId)
    .single();
  if (error) throw error;
  return data;
}

// anonymized bids (Fornitore #N) ordered best-first — supplier identities stay hidden.
// Uses a SECURITY DEFINER RPC: the bids RLS only lets a supplier read its own bids,
// so buyers/participants (and public visitors) need the RPC to see the anonymized columns.
export async function getPoolBids(poolId) {
  const { data, error } = await supabase.rpc("get_pool_bids", { p_pool: poolId });
  if (error) throw error;
  return data || [];
}

/* ----- Orders read (buyer or supplier; RLS restricts to your company) ----- */
export async function getMyOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id, mode, status, quantity_kg, unit_price_per_kg, goods_subtotal, created_at,
      product:products ( canonical_name ),
      buyer:companies!orders_buyer_company_id_fkey ( legal_name ),
      supplier:companies!orders_supplier_company_id_fkey ( legal_name )
    `)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/* ----- Friendly Italian messages for engine error codes ----- */
const POOL_ERRORS = {
  NOT_AUTHENTICATED: "Devi accedere per eseguire questa azione.",
  NOT_A_BUYER: "Solo un account acquirente può aprire un pool.",
  DISCLAIMER_REQUIRED: "Devi accettare le condizioni dell'asta inversa per procedere.",
  UNKNOWN_PRODUCT: "Prodotto non riconosciuto.",
  BELOW_MIN_PALLET: "La quantità è inferiore al minimo (un pallet) per aprire un pool.",
  POOL_ALREADY_OPEN: "Esiste già un pool attivo per questo prodotto: unisciti a quello.",
  POOL_NOT_OPEN: "Questo pool non è più aperto.",
  INVALID_QUANTITY: "Quantità non valida.",
  NOT_VERIFIED_SUPPLIER: "Solo un fornitore verificato può offrire.",
  NOT_CERTIFIED_FOR_PRODUCT: "Non risulti certificato per questo prodotto.",
  BID_NOT_LOWER: "L'offerta deve essere inferiore al miglior prezzo attuale.",
  NOT_IN_FINAL_PHASE: "La fase delle contro-offerte non è attiva.",
  DID_NOT_PARTICIPATE: "Puoi fare una contro-offerta solo se hai partecipato all'asta.",
  ALREADY_WINNING: "Sei già in testa: non serve una contro-offerta.",
  OFFER_NOT_LOWER: "La contro-offerta deve essere inferiore al prezzo attuale.",
  ALREADY_COUNTERED: "Hai già inviato una contro-offerta per questo pool.",
  COUNTER_NOT_FOUND: "Contro-offerta non trovata.",
  NOT_THE_WINNER: "Solo il vincitore provvisorio può rispondere.",
  RESPONSE_WINDOW_EXPIRED: "Il tempo per rispondere è scaduto.",
  RESPONSE_NOT_LOWER: "La risposta deve essere inferiore alla contro-offerta.",
  ALREADY_RESPONDED: "Hai già risposto a questa contro-offerta.",
  NO_SUPPLIER_AVAILABLE: "Nessun fornitore disponibile per questa quantità.",
  ORDER_NOT_FOUND: "Ordine non trovato.",
  NOT_THE_SUPPLIER: "Azione riservata al fornitore dell'ordine.",
  NOT_THE_BUYER: "Azione riservata all'acquirente dell'ordine.",
  INVALID_STATE: "L'ordine non è nello stato corretto per questa azione.",
};
export function poolErrorMessage(error) {
  const code = (error && error.message) || "";
  return POOL_ERRORS[code] || "Operazione non riuscita. Riprova.";
}

/* ============================================================================
 * ANTITRUST SAFEGUARD  (prezzo di riferimento + registro offerte anomale)
 * ========================================================================== */

// prezzo di riferimento di mercato per un prodotto (mediana listini attivi)
export async function getPriceReference(productId) {
  const { data, error } = await supabase.rpc("get_price_reference", { p_product: productId });
  if (error) throw error;
  return data; // numero (€/kg) oppure null se non ci sono listini
}

// registra un'offerta anomala (al momento del popup) e restituisce il numero
// di offerte anomale già fatte da questa azienda su quel prodotto in 90 giorni
export async function recordAnomalousOffer(productId, price, reference, acknowledged, poolId = null) {
  const { data, error } = await supabase.rpc("record_anomalous_offer", {
    p_product: productId, p_price: price, p_reference: reference,
    p_acknowledged: acknowledged, p_pool: poolId,
  });
  if (error) throw error;
  return data; // conteggio ripetizioni (intero)
}

/* ============================================================================
 * PRODUCT DETAIL  (per la pagina /prodotto?id=...)
 * ----------------------------------------------------------------------------
 * Tutte letture pubbliche (RLS): products (true), supplier_products (active),
 * price_tiers (true), companies (is_supplier AND verified). Il pool aperto NON
 * si legge da pools (bloccato per anon): si usa la RPC get_open_pool_for_product.
 * ========================================================================== */

// Prodotto singolo per id + fornitori attivi con scaglioni prezzo (best-first).
// Ritorna null se l'id non esiste. Shape:
// { id, canonical_name, cas_number, e_number, iupac_name, description, formula,
//   pallet_kg, default_unit, regulatory_flags, merch_classes,
//   suppliers: [{ supplier_product_id, company_id, name, country, rating,
//                 reviews_count, grade, origin, min_order_kg, lead_time_days,
//                 certifications, tiers: [{ min_kg, max_kg, price_per_kg }],
//                 best_price }] }
export async function getProduct(productId) {
  if (!productId) return null;

  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("id, canonical_name, cas_number, e_number, iupac_name, description, formula, pallet_kg, default_unit, regulatory_flags, merch_classes")
    .eq("id", productId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!product) return null;

  const { data: sp, error: spErr } = await supabase
    .from("supplier_products")
    .select(`
      id, grade, origin, min_order_kg, lead_time_days, certifications, active,
      supplier:companies ( id, legal_name, country, rating, reviews_count ),
      price_tiers ( min_kg, max_kg, price_per_kg )
    `)
    .eq("product_id", productId)
    .eq("active", true);
  if (spErr) throw spErr;

  const suppliers = (sp || []).map((row) => {
    const tiers = (row.price_tiers || [])
      .map((t) => ({
        min_kg: Number(t.min_kg),
        max_kg: t.max_kg == null ? null : Number(t.max_kg),
        price_per_kg: Number(t.price_per_kg),
      }))
      .sort((a, b) => a.min_kg - b.min_kg);
    const best_price = tiers.length ? Math.min(...tiers.map((t) => t.price_per_kg)) : null;
    return {
      supplier_product_id: row.id,
      company_id: row.supplier?.id || null,
      name: row.supplier?.legal_name || "Fornitore",
      country: row.supplier?.country || "",
      rating: row.supplier?.rating != null ? Number(row.supplier.rating) : null,
      reviews_count: row.supplier?.reviews_count ?? 0,
      grade: row.grade || "",
      origin: row.origin || "",
      min_order_kg: row.min_order_kg ?? 0,
      lead_time_days: row.lead_time_days ?? null,
      certifications: row.certifications || [],
      tiers,
      best_price,
    };
  });

  // fornitori ordinati per best_price crescente (i null in fondo)
  suppliers.sort((a, b) => {
    if (a.best_price == null) return 1;
    if (b.best_price == null) return -1;
    return a.best_price - b.best_price;
  });

  return { ...product, suppliers };
}

// Pool aperto/final_phase per un prodotto (dati non sensibili), oppure null.
// Shape: { id, status, pallet_kg, total_volume_kg, best_price_per_kg,
//          closes_at, final_phase_ends_at, participants }
export async function getOpenPoolForProduct(productId) {
  if (!productId) return null;
  const { data, error } = await supabase.rpc("get_open_pool_for_product", { p_product: productId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}
