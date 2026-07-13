// lib/api.js
// BulkStrike data-access layer. Every function maps to the schema in
// bulkstrike_schema.sql and respects its RLS. Import the singleton client.
import { supabase } from "./supabase";

/* ===================================================================================
 * AUTH
 * ================================================================================ */
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

/* ===================================================================================
 * ELIMINAZIONE ACCOUNT — richiede conferma via codice inviato per email
 * (Supabase invia il codice con signInWithOtp; niente da configurare a parte).
 * ================================================================================= */

// Invia un codice di conferma alla email dell'utente loggato.
export async function requestAccountDeletionCode() {
  const session = await getSession();
  if (!session?.user?.email) throw new Error("NOT_AUTHENTICATED");
  const { error } = await supabase.auth.signInWithOtp({ email: session.user.email, options: { shouldCreateUser: false } });
  if (error) throw error;
  return session.user.email;
}

// Verifica il codice e, solo se corretto, anonimizza ed elimina definitivamente l'account.
export async function confirmAccountDeletion(email, code) {
  const { error: otpError } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (otpError) throw otpError;
  const { error: delError } = await supabase.rpc("delete_my_account");
  if (delError) throw delError;
  await signOut();
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

/* ===================================================================================
 * REGISTRATION
 * -----------------------------------------------------------------------------------
 * Two steps: (1) create the auth user, (2) call the SECURITY DEFINER RPC
 * `register_company` which atomically inserts companies + profiles +
 * watched_materials server-side (see supabase_register_function.sql).
 *
 * `form` is the object built by BulkStrikeRegister.jsx:
 *   { type: 'buyer'|'supplier', email, pass, company, vat, country, city,
 *     address, phone, website, contact, bulk (supplier: producer?),
 *     emailMgmt, emailAdmin, pec, sdi, ibanHolder, iban, bic,
 *     capacity, served:[], materials: { name: {pool,price,supplier,closing,request,outbid} } }
 * ================================================================================= */
export async function registerCompany(form) {
  // 1) create the auth user (sets the session)
  const auth = await signUp(form.email, form.pass);
  if (!auth.user) throw new Error("Registrazione non riuscita: utente non creato.");

  const isSupplier = form.type === "supplier";
  const isCarrier = form.type === "carrier";

  // map the per-material alert flags (frontend keys -> unified columns) — non si applica ai corrieri
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
    account_type: form.type, // "buyer" | "supplier" | "carrier"
    is_supplier: isSupplier, // retrocompatibile, non più l'unica fonte di verità
    supplier_type: isSupplier ? (form.bulk ? "producer" : "distributor") : null,
    email_mgmt: form.emailMgmt || null,
    email_admin: form.emailAdmin || null,
    pec: form.pec || null,
    sdi: form.sdi || null,
    iban_holder: (isSupplier || isCarrier) ? form.ibanHolder || null : null,
    iban: (isSupplier || isCarrier) ? form.iban || null : null,
    bic: (isSupplier || isCarrier) ? form.bic || null : null,
    production_capacity: isSupplier ? form.capacity || null : null,
    countries_served: isSupplier ? form.served || [] : [],
    materials,
  };

  // 2) atomic server-side insert; resolves product_id by name, returns company id
  const { data, error } = await supabase.rpc("register_company", { payload });
  if (error) throw error;
  return data; // company uuid
}

/* ===================================================================================
 * ACCOUNT / COMPANY
 * ================================================================================ */
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

/* ===================================================================================
 * WATCHED MATERIALS & ALERTS
 * ================================================================================ */
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

/* ===================================================================================
 * NOTIFICATIONS  (+ realtime)
 * ================================================================================ */
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

/* ===================================================================================
 * POOLS  (read; the open/close/counter-offer engine lives server-side)
 * ================================================================================ */
// Elenco pubblico delle aste attive (pagina /pool senza id). RPC pubblica:
// la tabella pools ha RLS auth.uid() IS NOT NULL, ma la lista è visibile anche
// agli anonimi come il catalogo.
//   → [{ id, status, pallet_kg, total_volume_kg, best_price_per_kg, closes_at,
//        final_phase_ends_at, product_id, product_name, product_enum,
//        participants, num_bids }]
export async function getActivePools() {
  const { data, error } = await supabase.rpc("get_active_pools");
  if (error) throw error;
  return data || [];
}

// Prodotti con storico prezzi di mercato (ISMEA / CUN) → per i tab del grafico.
//   → [{ id, name, fonte }]
export async function getProductsWithMarketPrices() {
  const { data, error } = await supabase.rpc("get_products_with_market_prices");
  if (error) throw error;
  return data || [];
}
// Serie "andamento medio" di un prodotto + fonte/link/data per la citazione.
//   → { fonte, fonte_url, last_date, unit, series:[{t,v}] }
export async function getMarketPriceSeries(productId) {
  const { data, error } = await supabase.rpc("get_market_price_series", { p_product_id: productId });
  if (error) throw error;
  return data || null;
}
// Contatori reali per il blocco statistiche + badge della homepage.
//   → { active_pools, products, suppliers, companies, countries }
export async function getHomepageStats() {
  const { data, error } = await supabase.rpc("get_homepage_stats");
  if (error) throw error;
  return data || null;
}

// pools this company participates in (buyer) — used in the dashboard "Pool attivi"
// Aste REALI dell'azienda loggata (partecipazioni come compratore + offerte come
// fornitore), con i contatori per la card. Stessa fonte del "Hai già aderito"
// della pagina asta (partecipazione reale), così profilo e pannello restano coerenti.
export async function getMyPools() {
  const { data, error } = await supabase.rpc("get_my_pools");
  if (error) throw error;
  // [{ pool_id, product_name, status, total_volume_kg, best_price_per_kg, closes_at,
  //    final_phase_ends_at, my_quantity_kg, my_bid_price, participants, suppliers }]
  return data || [];
}

/* ===================================================================================
 * TAXONOMY (drives the materials picker; replaces the hardcoded maps)
 * ================================================================================ */
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

// Tassonomia a due livelli: macro-aree → sotto-aree (con conteggio prodotti).
// Una sola chiamata (RPC pubblica get_taxonomy).
//   [{ id, name, slug, icon, sort_order,
//      sub_areas: [{ id, name, slug, icon, sort_order, product_count }] }]
// Cache a livello di modulo, leggibile in modo SINCRONO con getMacroAreasCached:
// con cacheComponents Next rimonta la pagina client quando sostituisce la shell
// statica con il payload dinamico (in particolare se si clicca durante
// l'hydration). Al remount lo stato riparte vuoto e il box categorie
// spariva/riappariva per un istante; leggendo la cache nello useState
// iniziale il primo frame del nuovo mount è già popolato.
let _macroAreasCache = null;
export function getMacroAreasCached() { return _macroAreasCache; }
export async function getMacroAreas() {
  if (_macroAreasCache) return _macroAreasCache;
  const { data, error } = await supabase.rpc("get_taxonomy");
  if (error) throw error;
  _macroAreasCache = data || [];
  return _macroAreasCache;
}

// Prodotti di UNA sola sotto-area (settore). Filtro rigoroso: nessun prodotto di
// altri settori. Caricato on-demand quando l'utente apre la sotto-area.
//   → [{ id, canonical_name, e_number, cas_number }]
export async function getSectorProducts(sectorId) {
  const { data, error } = await supabase
    .from("product_sectors")
    .select("product:products ( id, canonical_name, e_number, cas_number )")
    .eq("sector_id", sectorId);
  if (error) throw error;
  return (data || [])
    .map((r) => r.product)
    .filter(Boolean)
    .sort((a, b) => (a.canonical_name || "").localeCompare(b.canonical_name || ""));
}

// Catalogo completo per la pagina marketplace (/catalogo): ogni prodotto con
// miglior prezzo, n° fornitori, settori/macro-aree di appartenenza e flag pool.
// Una sola chiamata (RPC pubblica get_catalog). Il filtro/ordinamento avviene
// lato client sulla lista.
//   [{ id, name, e_number, cas_number, best_price, supplier_count, has_pool,
//      sectors:[slug], macros:[slug], primary_sector, primary_icon, primary_macro }]
export async function getCatalog() {
  const { data, error } = await supabase.rpc("get_catalog");
  if (error) throw error;
  return data || [];
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

/* ===================================================================================
 * POOL ACTIONS & ORDERS  (drive the server-side engine via RPC)
 * -----------------------------------------------------------------------------------
 * RPC parameter names MUST match the SQL function arguments exactly.
 * On error, Supabase returns e.message = the SQL exception code (e.g.
 * 'BID_NOT_LOWER'); map it with poolErrorMessage() for a friendly Italian text.
 * ================================================================================ */

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

// Adesione a soglia: se il prezzo attuale è già sotto p_target_price si unisce
// subito (come joinPool); altrimenti resta in attesa e si attiva da sola la
// prima volta che un fornitore scende a quel prezzo o sotto.
export async function joinPoolAtTarget(poolId, quantityKg, targetPricePerKg, acceptDisclaimer = true) {
  const { data, error } = await supabase.rpc("join_pool_at_target", {
    p_pool: poolId, p_quantity: quantityKg, p_target_price: targetPricePerKg, p_accept: acceptDisclaimer,
  });
  if (error) throw error;
  return data; // { status: "joined_now" | "pending" }
}

// La tua eventuale adesione a soglia ancora in attesa per questo pool, o null.
export async function getMyTargetJoin(poolId) {
  const { data, error } = await supabase.rpc("get_my_target_join", { p_pool: poolId });
  if (error) throw error;
  return data; // { id, quantity_kg, target_price_per_kg, created_at } | null
}

export async function cancelTargetJoin(id) {
  const { error } = await supabase.rpc("cancel_target_join", { p_id: id });
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
  // Usa la RPC pubblica: la tabella pools ha RLS auth.uid() IS NOT NULL,
  // quindi la lettura diretta fallirebbe per i visitatori anonimi.
  const { data, error } = await supabase.rpc("get_pool_detail", { p_pool: poolId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("POOL_NOT_FOUND");
  // ricostruisce la shape attesa dal render (product annidato, participants[count])
  return {
    id: row.id,
    status: row.status,
    pallet_kg: row.pallet_kg,
    // formati di vendita opzionali del prodotto (null = formato non disponibile)
    sacco_kg: row.sacco_kg,
    container_kg: row.container_kg,
    total_volume_kg: row.total_volume_kg,
    best_price_per_kg: row.best_price_per_kg,
    final_price_per_kg: row.final_price_per_kg,
    closes_at: row.closes_at,
    final_phase_ends_at: row.final_phase_ends_at,
    product: { id: row.product_id, canonical_name: row.product_name, e_number: row.product_enum },
    participants: [{ count: Number(row.participants) || 0 }],
    my_quantity_kg: row.my_quantity_kg != null ? Number(row.my_quantity_kg) : 0,
    // Solo per aste concluse: vincitore rivelato (ragione sociale) e l'ordine
    // generato per l'azienda loggata (per il link al riepilogo ordine).
    winner_name: row.winner_name || null,
    my_order_id: row.my_order_id || null,
  };
}

// anonymized bids (Fornitore #N) ordered best-first — supplier identities stay hidden.
// Uses a SECURITY DEFINER RPC: the bids RLS only lets a supplier read its own bids,
// so buyers/participants (and public visitors) need the RPC to see the anonymized columns.
export async function getPoolBids(poolId) {
  const { data, error } = await supabase.rpc("get_pool_bids", { p_pool: poolId });
  if (error) throw error;
  return data || [];
}

// Chi ha aderito al pool, in forma anonima: solo città/paese e kg, niente nome azienda.
export async function getPoolParticipants(poolId) {
  const { data, error } = await supabase.rpc("get_pool_participants", { p_pool: poolId });
  if (error) throw error;
  return data || []; // [{ city, country, quantity_kg }]
}

// Chi è in attesa di aderire a una soglia di prezzo, in forma anonima — utile ai
// fornitori per capire quanta domanda in più si sbloccherebbe scendendo di prezzo.
export async function getPoolTargetJoins(poolId) {
  const { data, error } = await supabase.rpc("get_pool_target_joins", { p_pool: poolId });
  if (error) throw error;
  return data || []; // [{ city, country, quantity_kg, target_price_per_kg }]
}

/* ----- Orders read (buyer or supplier) ----- */
// Ordini dell'azienda loggata per la DASHBOARD. La vecchia select diretta con
// join embedded su companies non risolve più i nomi delle controparti (la
// policy SELECT su companies è ristretta alla sola propria azienda dopo
// l'audit sicurezza): usa la RPC SECURITY DEFINER get_my_orders_dashboard e
// rimappa nella stessa shape annidata di prima, così la Dashboard resta intatta.
export async function getMyOrders() {
  const { data, error } = await supabase.rpc("get_my_orders_dashboard");
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    mode: r.mode,
    status: r.status,
    quantity_kg: r.quantity_kg,
    unit_price_per_kg: r.unit_price_per_kg,
    goods_subtotal: r.goods_subtotal,
    created_at: r.created_at,
    product: { canonical_name: r.product_name },
    buyer: { legal_name: r.buyer_name },
    supplier: { legal_name: r.supplier_name },
  }));
}

/* ----- Friendly Italian messages for engine error codes ----- */
const POOL_ERRORS = {
  NOT_AUTHENTICATED: "Devi accedere per eseguire questa azione.",
  NOT_A_BUYER: "Solo un account acquirente può aprire un pool.",
  DISCLAIMER_REQUIRED: "Devi accettare le condizioni dell'asta inversa per procedere.",
  UNKNOWN_PRODUCT: "Prodotto non riconosciuto.",
  INVALID_PALLET: "Il peso di 1 pallet è obbligatorio e deve essere almeno 1 kg.",
  INVALID_FORMAT: "Il peso di un formato, se impostato, deve essere almeno 1 kg.",
  BELOW_MIN_PALLET: "La quantità è inferiore al minimo (un pallet) per aprire un pool.",
  MUST_BE_WHOLE_PALLET_MULTIPLE: "Per aprire un'asta la quantità deve essere un multiplo intero di pallet.",
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
  NOT_YOUR_ORDER: "Questo ordine non risulta a tuo nome.",
  ORDER_NOT_COMPLETED: "Puoi recensire solo ordini completati.",
  ALREADY_REVIEWED: "Hai già lasciato una recensione per questo ordine.",
  INVALID_RATING: "Seleziona un punteggio da 1 a 5 stelle.",
  CART_EMPTY: "Il carrello è vuoto.",
  SHIPPING_ADDRESS_REQUIRED: "Inserisci l'indirizzo di spedizione.",
  REASON_REQUIRED: "Spiega il motivo della contestazione.",
};
export function poolErrorMessage(error) {
  const code = (error && error.message) || "";
  return POOL_ERRORS[code] || "Operazione non riuscita. Riprova.";
}

/* ===================================================================================
 * ANTITRUST SAFEGUARD  (prezzo di riferimento + registro offerte anomale)
 * ================================================================================ */

// prezzo di riferimento di mercato per un prodotto (mediana listini attivi)
export async function getPriceReference(productId) {
  const { data, error } = await supabase.rpc("get_price_reference", { p_product: productId });
  if (error) throw error;
  return data; // numero (€/kg) oppure null se non ci sono listini
}

// Breadcrumb reale del prodotto: { macro, sector } dal primo settore associato
// (RPC pubblica get_product_breadcrumb). null se il prodotto non ha settori.
export async function getProductBreadcrumb(productId) {
  if (!productId) return null;
  const { data, error } = await supabase.rpc("get_product_breadcrumb", { p_product: productId });
  if (error) throw error;
  return data; // { macro: "…", sector: "…" } | null
}

/* ===================================================================================
 * FORNITORI (pagine pubbliche)
 * ================================================================================ */

// Profilo pubblico completo di un fornitore verificato (RPC get_supplier_profile:
// whitelist di campi business — mai IBAN/BIC/email amministrative).
// Ritorna null se l'id non esiste o il fornitore non è verificato.
export async function getSupplierProfile(companyId) {
  if (!companyId) return null;
  const { data, error } = await supabase.rpc("get_supplier_profile", { p_company: companyId });
  if (error) throw error;
  return data; // { id, name, logo_url, description, contatti…, sectors[], certifications[], products[], site_rank, … }
}

// Anagrafica di tutti i fornitori verificati, con dati aggregati per i filtri
// client-side (settori, macro, certificazioni, n° prodotti).
export async function getSuppliersDirectory() {
  const { data, error } = await supabase.rpc("get_suppliers_directory");
  if (error) throw error;
  return data || []; // [{ id, name, country, rating, product_count, sectors[], macros[], certifications[], … }]
}

// Recensioni pubbliche di un fornitore (chiunque può leggerle).
export async function getSupplierReviews(companyId) {
  if (!companyId) return [];
  const { data, error } = await supabase.rpc("get_supplier_reviews", { p_company: companyId });
  if (error) throw error;
  return data || []; // [{ id, rating, comment, created_at, buyer_name, buyer_country, product_name }]
}

// Ordini completati dell'azienda loggata con questo fornitore, non ancora
// recensiti — per sapere se/cosa può recensire. Richiede login (altrimenti []).
export async function getReviewableOrders(companyId) {
  if (!companyId) return [];
  const { data, error } = await supabase.rpc("get_reviewable_orders", { p_company: companyId });
  if (error) throw error;
  return data || []; // [{ order_id, product_name, quantity_kg, created_at }]
}

// Invia una recensione per un ordine completato (verifica proprietà e stato
// lato server; RPC get_reviewable_orders ti dice quali order_id sono validi).
export async function submitReview(orderId, rating, comment) {
  const { data, error } = await supabase.rpc("submit_review", { p_order: orderId, p_rating: rating, p_comment: comment || null });
  if (error) throw error;
  return data; // { id }
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

/* ===================================================================================
 * PRODUCT DETAIL  (per la pagina /prodotto?id=...)
 * -----------------------------------------------------------------------------------
 * Letture pubbliche (RLS): products (true), supplier_products (active),
 * price_tiers (true). ATTENZIONE: companies NON è più leggibile (policy SELECT
 * ristretta alla sola propria azienda dopo l'audit sicurezza) — i dati vetrina
 * dei fornitori si leggono dalla vista pubblica suppliers_public. Il pool
 * aperto NON si legge da pools (bloccato per anon): RPC get_open_pool_for_product.
 * ================================================================================ */

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
      id, supplier_company_id, grade, origin, min_order_kg, lead_time_days, certifications, active,
      available_formats, variant_attributes, variant_status,
      price_tiers ( min_kg, max_kg, price_per_kg )
    `)
    .eq("product_id", productId)
    .eq("active", true);
  if (spErr) throw spErr;

  // Dati vetrina dei fornitori dalla vista pubblica suppliers_public: il vecchio
  // join embedded su companies ora tornerebbe NULL per acquirenti e visitatori
  // (RLS ristretta), lasciando le card senza nome/paese/rating.
  const supplierIds = [...new Set((sp || []).map((r) => r.supplier_company_id).filter(Boolean))];
  let pubById = new Map();
  if (supplierIds.length > 0) {
    const { data: pubs, error: pubErr } = await supabase
      .from("suppliers_public")
      .select("id, legal_name, country, rating, reviews_count")
      .in("id", supplierIds);
    if (pubErr) throw pubErr;
    pubById = new Map((pubs || []).map((c) => [c.id, c]));
  }

  const suppliers = (sp || []).map((row) => {
    const pub = pubById.get(row.supplier_company_id) || null;
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
      company_id: row.supplier_company_id || null,
      name: pub?.legal_name || "Fornitore",
      country: pub?.country || "",
      rating: pub?.rating != null ? Number(pub.rating) : null,
      reviews_count: pub?.reviews_count ?? 0,
      grade: row.grade || "",
      origin: row.origin || "",
      min_order_kg: row.min_order_kg ?? 0,
      lead_time_days: row.lead_time_days ?? null,
      certifications: row.certifications || [],
      // Formato di vendita: l'acquisto rapido avviene per multipli interi di
      // unit_size_kg (es. sacchi da 25 kg), non in kg liberi.
      // Formati di vendita disponibili per questo fornitore: l'acquisto rapido
      // avviene per multipli interi della size_kg del formato scelto, non in kg liberi.
      formats: Array.isArray(row.available_formats) && row.available_formats.length
        ? row.available_formats.map((f) => ({ label: f.label || "unità", size_kg: Number(f.size_kg) || 25 }))
        : [{ label: "sacco", size_kg: 25 }],
      // Attributi di variante liberi (granulometria, purezza, colore, ecc.) — chiave/valore, il fornitore ne aggiunge quanti vuole.
      // Attributi di variante visibili solo se verificati — finché sono "pending"
      // il listing resta valido (prezzo/formato) ma senza gli attributi non confermati,
      // per non mostrare ai clienti claim di varianti non ancora controllati.
      variantAttributes: (row.variant_status === "approved" && row.variant_attributes && typeof row.variant_attributes === "object") ? row.variant_attributes : {},
      variantStatus: row.variant_status || "approved",
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

/* ===================================================================================
 * VARIANTI FORNITORE (gestione delle proprie righe supplier_products)
 * -----------------------------------------------------------------------------------
 * Un fornitore può avere più righe supplier_products per lo stesso prodotto —
 * una per variante (granulometria, purezza, colore, formato...). RLS
 * "sp_owner_all" lascia scrittura/lettura piena solo sulle proprie righe.
 * ================================================================================ */

// Tutte le mie righe supplier_products, su TUTTI i prodotti — per la pagina
// "I miei prodotti" del fornitore. Raggruppare per product_id lato client per
// vedere le varianti di uno stesso prodotto insieme.
export async function getMySupplierListings() {
  const companyId = await getMyCompanyId();
  if (!companyId) return [];
  const { data, error } = await supabase
    .from("supplier_products")
    .select(`
      id, grade, origin, min_order_kg, lead_time_days, certifications, active,
      available_formats, variant_attributes, variant_status, variant_review_note, created_at,
      product:products ( id, canonical_name, e_number, cas_number, default_unit ),
      price_tiers ( min_kg, max_kg, price_per_kg )
    `)
    .eq("supplier_company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Tutte le mie varianti (righe supplier_products) per un prodotto — per gestirle.
export async function getMySupplierProductVariants(productId) {
  const companyId = await getMyCompanyId();
  if (!companyId || !productId) return [];
  const { data, error } = await supabase
    .from("supplier_products")
    .select("id, grade, origin, min_order_kg, lead_time_days, certifications, active, available_formats, variant_attributes, variant_status, variant_review_note, price_tiers ( min_kg, max_kg, price_per_kg )")
    .eq("product_id", productId)
    .eq("supplier_company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Aggiunge una nuova variante (nuova riga) per un prodotto che vendo.
// payload: { grade, origin, min_order_kg, lead_time_days, certifications, available_formats, variant_attributes }
export async function addSupplierProductVariant(productId, payload = {}) {
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("Nessuna azienda associata all'utente.");
  const { data, error } = await supabase
    .from("supplier_products")
    .insert({
      product_id: productId,
      supplier_company_id: companyId,
      grade: payload.grade || null,
      origin: payload.origin || null,
      min_order_kg: payload.min_order_kg ?? null,
      lead_time_days: payload.lead_time_days ?? null,
      certifications: payload.certifications || [],
      available_formats: payload.available_formats || [{ label: "sacco", size_kg: 25 }],
      variant_attributes: payload.variant_attributes || {},
      active: payload.active ?? true,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSupplierProductVariant(supplierProductId, patch) {
  const { data, error } = await supabase
    .from("supplier_products")
    .update(patch)
    .eq("id", supplierProductId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Elimina una variante e i suoi scaglioni di prezzo (cascade lato DB).
export async function deleteSupplierProductVariant(supplierProductId) {
  const { error } = await supabase.from("supplier_products").delete().eq("id", supplierProductId);
  if (error) throw error;
}

// Sostituisce interamente gli scaglioni di prezzo di una variante.
export async function setSupplierProductTiers(supplierProductId, tiers) {
  const { error: delErr } = await supabase.from("price_tiers").delete().eq("supplier_product_id", supplierProductId);
  if (delErr) throw delErr;
  if (!tiers || tiers.length === 0) return [];
  const rows = tiers.map((t) => ({
    supplier_product_id: supplierProductId,
    min_kg: t.min_kg, max_kg: t.max_kg ?? null, price_per_kg: t.price_per_kg,
  }));
  const { data, error } = await supabase.from("price_tiers").insert(rows).select();
  if (error) throw error;
  return data || [];
}

/* ----- Verifica varianti (solo admin piattaforma — companies.is_platform_admin) ----- */

// Varianti in attesa di verifica, con dati fornitore/prodotto per chi le controlla.
export async function getPendingVariantReviews() {
  const { data, error } = await supabase.rpc("get_pending_variant_reviews");
  if (error) throw error;
  return data || []; // [{ id, supplier_name, product_id, product_name, grade, available_formats, variant_attributes, created_at }]
}

export async function approveVariant(supplierProductId) {
  const { error } = await supabase.rpc("approve_variant", { p_id: supplierProductId });
  if (error) throw error;
}

export async function rejectVariant(supplierProductId, note = null) {
  const { error } = await supabase.rpc("reject_variant", { p_id: supplierProductId, p_note: note });
  if (error) throw error;
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

/* ===================================================================================
 * CARRELLO (DB-backed: multi-dispositivo, richiede login)
 * ================================================================================ */

// Righe carrello con prezzi calcolati server-side dai tier correnti.
// unit_price è null se la quantità non rientra in nessuno scaglione.
export async function getCart() {
  const { data, error } = await supabase.rpc("get_cart");
  if (error) throw error;
  return data || []; // [{ product_id, supplier_company_id, quantity_kg, product_name, supplier_name, unit_price, min_order_kg, lead_time_days, offer_active }]
}

// Aggiunge una riga o aggiorna la quantità se (prodotto, fornitore) già presente.
export async function upsertCartItem(productId, supplierId, quantityKg) {
  const { error } = await supabase.rpc("upsert_cart_item", { p_product: productId, p_supplier: supplierId, p_quantity: quantityKg });
  if (error) throw error;
}

export async function removeCartItem(productId, supplierId) {
  const { error } = await supabase.rpc("remove_cart_item", { p_product: productId, p_supplier: supplierId });
  if (error) throw error;
}

export async function clearCart() {
  const { error } = await supabase.rpc("clear_cart");
  if (error) throw error;
}

// Trasforma il carrello in ordini GIÀ PAGATI (uno per fornitore, transazionale:
// o tutti o nessuno).­ Il checkout include l'indirizzo di spedizione — richiesto.
// DEMO: pagamento simulato in attesa dell'integrazione PSP reale.
export async function checkoutCart(shippingAddress, shippingNotes, carrierSelections) {
  // carrierSelections: { "<supplier_company_id>": "<carrier_id>", ... } — un fornitore assente
  // da qui nasce in stato "in attesa corriere" (nessun corriere disponibile su quella tratta).
  const { data, error } = await supabase.rpc("checkout_cart", { p_shipping_address: shippingAddress, p_shipping_notes: shippingNotes || null, p_carrier_selections: carrierSelections || {} });
  if (error) throw error;
  return data; // { orders: [uuid...], held_orders: [uuid...], count, total_paid }
}

// Riepilogo IVA-esclusa → IVA-inclusa del carrello corrente, PRIMA di pagare.
// Nessuna scrittura: il server ricalcola spedizione (stima per paese fornitore)
// e IVA 22% sugli stessi prezzi che checkoutCart userebbe. Usata nello step
// "Pagamento" del checkout per mostrare il totale reale prima della conferma.
export async function previewCheckout(shippingAddress, carrierSelections) {
  // Sul DB esiste la sola versione a 2 parametri (p_carrier_selections ha
  // DEFAULT '{}'): i fornitori senza corriere selezionato risultano is_hold
  // con spedizione 0. Sia il Carrello che il Checkout passano già le proprie
  // selezioni (corriere più economico di default), quindi omettere il secondo
  // parametro è solo un fallback di compatibilità.
  const params = { p_shipping_address: shippingAddress || null };
  if (carrierSelections !== undefined) params.p_carrier_selections = carrierSelections;
  const { data, error } = await supabase.rpc("preview_checkout", params);
  if (error) throw error;
  return data; // { lines:[{...,is_hold}], has_hold, by_supplier:[{supplier_company_id,supplier_name,product_count,total_qty}], goods_subtotal, shipping_amount, vat_amount, total }
}

// Indirizzo legale dell'azienda loggata, per precompilare lo step spedizione del checkout.
export async function getMyCompanyAddress() {
  const { data, error } = await supabase.rpc("get_my_company_address");
  if (error) throw error;
  return data; // { address, city, country }
}

// Il compratore contesta un ordine (paid/shipped/delivered) — blocca lo sblocco
// automatico del pagamento finché non si risolve manualmente.
export async function raiseDispute(orderId, reason) {
  const { error } = await supabase.rpc("raise_dispute", { p_order: orderId, p_reason: reason });
  if (error) throw error;
}

/* ===================================================================================
 * CICLO ORDINE E STORICO
 * ================================================================================ */

// DEMO in attesa dell'integrazione escrow/PSP: l'acquirente segna l'ordine
// come pagato (pending_payment → paid) e il fornitore viene notificato.
export async function markOrderPaidDemo(orderId) {
  const { error } = await supabase.rpc("mark_order_paid_demo", { p_order: orderId });
  if (error) throw error;
}

// Storico ordini dell'azienda loggata, sia come acquirente che come fornitore
// (campo role per distinguerli). NB: esiste anche getMyOrders (RPC dashboard,
// forma diversa, usata dalla dashboard) — questa è la versione per /ordini.
export async function getMyOrdersHistory() {
  const { data, error } = await supabase.rpc("get_my_orders");
  if (error) throw error;
  return data || []; // [{ id, role, counterpart_name, product_name, quantity_kg, unit_price_per_kg, goods_subtotal, status, created_at, reviewed }]
}

// Dettaglio ordine (solo se sei una delle due parti).
export async function getOrderDetail(orderId) {
  if (!orderId) return null;
  const { data, error } = await supabase.rpc("get_order_detail", { p_order: orderId });
  if (error) throw error;
  return data; // oggetto ordine completo | null
}

// Riordina: rimette nel carrello l'articolo di un ordine passato (stesso prodotto,
// stesso fornitore, stessa quantità). Riusa getOrderDetail + upsertCartItem.
// In caso di errore rilancia (i chiamanti mostrano poolErrorMessage).
export async function reorderOrder(orderId) {
  const order = await getOrderDetail(orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  await upsertCartItem(order.product_id, order.supplier_id, order.quantity_kg);
}

/* ===================================================================================
 * CORRIERI — anagrafica self-service, tariffe, preventivi spedizione
 * ================================================================================ */

// Attiva/aggiorna il ruolo "corriere" sulla TUA azienda (stesso account, come is_supplier).
// pricingMode: "zone" | "distance". leadTimeDays: giorni di consegna standard che offri.
export async function upsertCarrierProfile(pricingMode, leadTimeDays) {
  const { data, error } = await supabase.rpc("upsert_carrier_profile", { p_pricing_mode: pricingMode, p_lead_time_days: leadTimeDays ?? null });
  if (error) throw error;
  return data;
}

// Il tuo profilo corriere completo: dati base + aree coperte + tariffe.
export async function getMyCarrierProfile() {
  const { data, error } = await supabase.rpc("get_my_carrier_profile");
  if (error) throw error;
  return data; // { is_carrier, pricing_mode, lead_time_days, status, coverage:[...], rates:[...] } | null
}

export async function addCarrierCoverage(areaType, areaValue) {
  const { data, error } = await supabase.rpc("add_carrier_coverage", { p_area_type: areaType, p_area_value: areaValue });
  if (error) throw error;
  return data;
}

export async function removeCarrierCoverage(id) {
  const { error } = await supabase.rpc("remove_carrier_coverage", { p_id: id });
  if (error) throw error;
}

// Carica un PDF di listino prezzi (base64, senza il prefisso data:) e lo fa
// interpretare dall'IA: restituisce righe tariffarie pronte da rivedere prima
// di salvarle davvero (nessun salvataggio automatico).
export async function parseCarrierPriceListPdf(pdfBase64) {
  const { data, error } = await supabase.functions.invoke("parse-carrier-price-list", {
    body: { pdfBase64 },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.rates || [];
}

// id=null per crearne una nuova, altrimenti aggiorna quella esistente (deve essere tua).
export async function upsertCarrierRate(rate) {
  const { data, error } = await supabase.rpc("upsert_carrier_rate", {
    p_id: rate.id || null,
    p_zone_area: rate.zoneArea || null,
    p_regions: rate.regions || [], // regioni multiple opzionali dentro la nazione — vuoto = tutta la nazione
    p_distance_min_km: rate.distanceMinKm ?? null,
    p_distance_max_km: rate.distanceMaxKm ?? null,
    p_weight_min_kg: rate.weightMinKg ?? 0,
    p_weight_max_kg: rate.weightMaxKg ?? null,
    p_base_fee: rate.baseFee ?? 0,
    p_per_km_fee: rate.perKmFee ?? 0,
    p_per_kg_fee: rate.perKgFee ?? 0,
    p_lead_time_days: rate.leadTimeDays ?? null, // giorni di consegna per QUESTA tariffa, non più un valore unico del corriere
  });
  if (error) throw error;
  return data;
}

export async function deleteCarrierRate(id) {
  const { error } = await supabase.rpc("delete_carrier_rate", { p_id: id });
  if (error) throw error;
}

// Tariffe accessorie: dipendono dal servizio richiesto (collettame, contrassegno,
// servizio al piano...), non dalla distanza/regione. is_automatic = si applica da
// sola quando la condizione si verifica, altrimenti il cliente la seleziona in checkout.
export async function upsertCarrierServiceFee(fee) {
  const { data, error } = await supabase.rpc("upsert_carrier_service_fee", {
    p_id: fee.id || null, p_service_name: fee.serviceName, p_fee: fee.fee ?? 0, p_is_automatic: fee.isAutomatic ?? false,
  });
  if (error) throw error;
  return data;
}

export async function deleteCarrierServiceFee(id) {
  const { error } = await supabase.rpc("delete_carrier_service_fee", { p_id: id });
  if (error) throw error;
}

/* ===================================================================================
 * COSTI ACCESSORI SULL'ORDINE — non stimati al checkout, applicati DOPO da chi
 * gestisce la spedizione (corriere assegnato, o fornitore in sua assenza),
 * quando il servizio si verifica davvero (collettame, contrassegno, secondo
 * tentativo di consegna...).
 * ================================================================================ */

export async function applyOrderServiceCharge(orderId, serviceName, fee) {
  const { data, error } = await supabase.rpc("apply_order_service_charge", { p_order: orderId, p_service_name: serviceName, p_fee: fee ?? 0 });
  if (error) throw error;
  return data;
}

export async function getOrderServiceCharges(orderId) {
  const { data, error } = await supabase.rpc("get_order_service_charges", { p_order: orderId });
  if (error) throw error;
  return data || [];
}

// Applica il collettame in automatico se l'ordine viene da un pool con più
// partecipanti e il corriere assegnato ha quel servizio impostato come automatico.
export async function autoApplyCollettame(orderId) {
  const { data, error } = await supabase.rpc("auto_apply_collettame", { p_order: orderId });
  if (error) throw error;
  return data; // { applied: bool, reason?, service_name?, fee? }
}

// Preventivi disponibili per una spedizione (fornitore + kg totali). Solo corrieri "a zona"
// per ora — la modalità "a distanza" arriva in un prossimo giro (richiede geocoding).
export async function getShippingQuotes(supplierCompanyId, qtyKg) {
  const { data, error } = await supabase.rpc("get_shipping_quotes", { p_supplier_company_id: supplierCompanyId, p_qty_kg: qtyKg });
  if (error) throw error;
  return data; // { quotes:[{carrier_id,carrier_name,price,lead_time_days,score}], cheapest_id, fastest_id }
}

/* ===================================================================================
 * RUBRICA INDIRIZZI DI SPEDIZIONE (tabella shipping_addresses, RLS per company)
 * ================================================================================ */

// Tutti gli indirizzi salvati dall'azienda loggata, dal piu vecchio al piu recente.
export async function getShippingAddresses() {
  const companyId = await getMyCompanyId();
  if (!companyId) return [];
  const { data, error } = await supabase
    .from("shipping_addresses")
    .select("id, label, address, is_default, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Salva un nuovo indirizzo per l'azienda loggata e lo restituisce (selezionabile subito).
export async function addShippingAddress(address, label = null) {
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("Nessuna azienda associata all'utente.");
  const { data, error } = await supabase
    .from("shipping_addresses")
    .insert({ company_id: companyId, address, label })
    .select("id, label, address, is_default, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteShippingAddress(id) {
  const { error } = await supabase.from("shipping_addresses").delete().eq("id", id);
  if (error) throw error;
}

/* ===================================================================================
 * MESSAGGISTICA DIRETTA buyer ↔ fornitore (tabelle message_threads/thread_messages)
 * ================================================================================ */

// Conteggio messaggi non letti per il badge nel menu account. Degrada a 0 se
// la RPC non è ancora disponibile (feature in rollout) o l'utente non è loggato.
export async function getUnreadMessagesCount() {
  try {
    const { data, error } = await supabase.rpc("get_my_unread_messages_count");
    if (error) return 0;
    return Number(data) || 0;
  } catch {
    return 0;
  }
}

// Lista conversazioni dell'azienda loggata (controparte, anteprima ultimo
// messaggio, conteggio non letti), ordinate per ultimo messaggio.
export async function getMyMessageThreads() {
  const { data, error } = await supabase.rpc("get_my_message_threads");
  if (error) throw error;
  return data || [];
}

// Messaggi di una conversazione (la RPC verifica che il chiamante sia una
// delle due parti del thread).
export async function getThreadMessages(threadId) {
  const { data, error } = await supabase.rpc("get_thread_messages", { p_thread: threadId });
  if (error) throw error;
  return data || [];
}

// Crea (o recupera) il thread con un'altra azienda. Con orderId le due parti
// derivano dall'ordine — è il punto d'ingresso "Contatta" dal dettaglio ordine;
// senza, otherCompanyId deve essere un fornitore verificato della directory.
export async function startOrGetThread(otherCompanyId = null, orderId = null) {
  const { data, error } = await supabase.rpc("start_or_get_thread", {
    p_other_company: otherCompanyId,
    p_order: orderId,
  });
  if (error) throw error;
  return data; // uuid del thread
}

export async function sendThreadMessage(threadId, body) {
  const { data, error } = await supabase.rpc("send_message", { p_thread: threadId, p_body: body });
  if (error) throw error;
  return data;
}

export async function markThreadRead(threadId) {
  const { error } = await supabase.rpc("mark_thread_read", { p_thread: threadId });
  if (error) throw error;
}

/* ===================================================================================
 * FORNITORI PREFERITI (tabella supplier_follows, RLS per company)
 * ================================================================================ */

export async function followSupplier(supplierId) {
  const { error } = await supabase.rpc("follow_supplier", { p_supplier: supplierId });
  if (error) throw error;
}

export async function unfollowSupplier(supplierId) {
  const { error } = await supabase.rpc("unfollow_supplier", { p_supplier: supplierId });
  if (error) throw error;
}

// Card identiche alla directory pubblica (stessa proiezione della RPC
// get_suppliers_directory) filtrate sui soli fornitori seguiti.
export async function getMyFollowedSuppliers() {
  const { data, error } = await supabase.rpc("get_my_followed_suppliers");
  if (error) throw error;
  return data || [];
}

// Stato "seguito" per il bottone Segui/Smetti nel profilo pubblico: lettura
// diretta (la RLS restringe alle righe della propria azienda). false se anonimo.
export async function isFollowingSupplier(supplierId) {
  try {
    const { data, error } = await supabase
      .from("supplier_follows")
      .select("supplier_company_id")
      .eq("supplier_company_id", supplierId)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

/* ----- Prodotti preferiti (product_follows) — equivalente per i singoli prodotti ----- */
export async function followProduct(productId) {
  const { error } = await supabase.rpc("follow_product", { p_product: productId });
  if (error) throw error;
}
export async function unfollowProduct(productId) {
  const { error } = await supabase.rpc("unfollow_product", { p_product: productId });
  if (error) throw error;
}
// Prodotti seguiti dall'azienda loggata: [{ product_id, name, e_number, followed_at }].
// Usato sia per lo stato dei bottoni stella sia per il filtro "Preferiti".
export async function getMyFollowedProducts() {
  const { data, error } = await supabase.rpc("get_my_followed_products");
  if (error) throw error;
  return data || [];
}
// Stato "seguito" per un singolo prodotto (bottone nella pagina di dettaglio).
export async function isFollowingProduct(productId) {
  try {
    const { data, error } = await supabase
      .from("product_follows")
      .select("product_id")
      .eq("product_id", productId)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

/* ===================================================================================
 * AI ASSISTANT — edge function "ai-assistant" (streaming SSE)
 * ================================================================================ */
// Chiama la edge function "ai-assistant" e invoca onEvent(ev) per ogni evento SSE
// man mano che arriva. Eventi possibili (campo ev.type):
//   "conversation" {id} · "text" {delta} · "tool" {name} ·
//   "pending_action" {action:{name,input,label}} · "parsed_price_list" {kind,payload} ·
//   "done" · "error" {message}
// Auth: la function ha verify_jwt=true, quindi serve SEMPRE un bearer valido —
// usiamo il JWT della sessione se l'utente è loggato, altrimenti la anon key
// (che è comunque un JWT valido). getUser() lato server distingue loggato/anonimo.
export async function streamAiAssistant({
  mode = "support",
  message = "",
  clientHistory = null,
  conversationId = null,
  confirmedAction = null,
  pdfBase64 = null,
  onEvent,
  signal,
} = {}) {
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-assistant`;

  let token = anon;
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) token = data.session.access_token;
  } catch { /* non loggato → anon */ }

  const body = { mode, message };
  if (clientHistory) body.client_history = clientHistory;
  if (conversationId) body.conversation_id = conversationId;
  if (confirmedAction) body.confirmed_action = confirmedAction;
  if (pdfBase64) body.pdf_base64 = pdfBase64;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: anon },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok || !resp.body) {
    let detail = "";
    try { detail = await resp.text(); } catch { /* corpo non leggibile */ }
    throw new Error(`AI_HTTP_${resp.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }

  // Parsing incrementale dello stream SSE ("data: {...}\n\n")
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      let ev;
      try { ev = JSON.parse(line.slice(6)); } catch { continue; }
      onEvent?.(ev);
    }
  }
}

/* ===================================================================================
 * ADMIN — minimo pedane per aprire un'asta, per-prodotto (solo companies.is_platform_admin)
 * ================================================================================ */
// Elenca i prodotti col loro pallet_kg e il minimo di pedane per aprire un'asta.
// L'RPC verifica is_platform_admin lato DB (SECURITY DEFINER): non aggirabile.
export async function adminListProductsPoolMin() {
  const { data, error } = await supabase.rpc("admin_list_products_pool_min");
  if (error) throw error;
  return data || []; // [{ id, canonical_name, pallet_kg, sacco_kg, container_kg, min_pool_pallets, default_unit, unit_needs_review }]
}

// Imposta il tipo prodotto: 'kg' (solido) | 'L' (liquido). E' una decisione
// esplicita dell'admin, quindi azzera lato DB il flag "da verificare".
export async function adminSetProductUnit(productId, unit) {
  const { error } = await supabase.rpc("admin_set_product_unit", {
    p_product: productId, p_unit: unit,
  });
  if (error) throw error;
}

// Imposta il minimo di pedane (>=1) per aprire un'asta su un prodotto.
export async function adminSetProductPoolMin(productId, minPallets) {
  const { error } = await supabase.rpc("admin_set_product_pool_min", {
    p_product: productId, p_min: minPallets,
  });
  if (error) throw error;
}

// Imposta i formati di vendita di un prodotto: kg di 1 pallet (obbligatorio,
// >=1) e kg di 1 sacco / 1 container (null = formato non disponibile: il
// bottone non compare nel pannello asta).
export async function adminSetProductFormats(productId, palletKg, saccoKg, containerKg) {
  const { error } = await supabase.rpc("admin_set_product_formats", {
    p_product: productId, p_pallet: palletKg, p_sacco: saccoKg, p_container: containerKg,
  });
  if (error) throw error;
}

/* ===================================================================================
 * ADMIN — Fornitori da verificare (import Europages, status='pending')
 * ================================================================================ */
// Conteggio per il badge in sidebar. Restituisce 0 per i non-admin (guardia RPC).
export async function adminCountPendingSuppliers() {
  const { data, error } = await supabase.rpc("admin_count_pending_suppliers");
  if (error) throw error;
  return data || 0;
}

// Elenco fornitori pending importati da Europages, ordinati per sector_hint, legal_name.
export async function adminListPendingSuppliers() {
  const { data, error } = await supabase.rpc("admin_list_pending_suppliers");
  if (error) throw error;
  return data || []; // [{ id, legal_name, sector_hint, country, employee_count_range, supplier_type, europages_url, vat_pending, raw_material_supplier }]
}

// Verifica (status→'verified'): li rende visibili sul sito pubblico. Azione manuale.
// Accetta uno o più id; restituisce il numero di record aggiornati.
export async function adminVerifySuppliers(ids) {
  const { data, error } = await supabase.rpc("admin_verify_suppliers", { p_ids: ids });
  if (error) throw error;
  return data || 0;
}

// Scarta (DELETE del record). Azione distruttiva; restituisce il numero di record eliminati.
export async function adminDiscardSuppliers(ids) {
  const { data, error } = await supabase.rpc("admin_discard_suppliers", { p_ids: ids });
  if (error) throw error;
  return data || 0;
}

/* ===================================================================================
 * PAGAMENTI — metodo di pagamento per sub-ordine + IBAN fornitore (gated)
 * ================================================================================ */
// Applica il metodo di pagamento scelto (per fornitore) agli ordini appena creati
// dal checkout. map: { "<supplier_company_id>": { method, terms_days? } }.
// escrow_* → resta 'paid' + release pianificato; bonifico_anticipato →
// 'awaiting_bank_transfer' (+ email di conferma senza dati bancari);
// termini_dilazionati → 'terms_pending' + terms_days.
export async function stampOrderPaymentMethods(map) {
  const { data, error } = await supabase.rpc("stamp_order_payment_methods", { p_map: map });
  if (error) throw error;
  return data; // { updated }
}

// Recupera l'IBAN del fornitore per un ordine con bonifico anticipato — SOLO per il
// buyer dell'ordine, SOLO in piattaforma. Mai esposto ad AI/profili pubblici.
export async function getSupplierIbanForOrder(orderId) {
  const { data, error } = await supabase.rpc("get_supplier_iban_for_order", { p_order: orderId });
  if (error) throw error;
  return data; // { iban, iban_holder, bic, amount }
}

/* ===================================================================================
 * DOCUMENTI PRODOTTO (SDS / scheda tecnica / certificati) + LOTTO + QR + reinvio email
 * ================================================================================ */
// Carica un file nel bucket pubblico "product-docs" e ne restituisce l'URL pubblico.
export async function uploadProductDoc(file, productId, kind = "doc") {
  const ext = (file.name?.split(".").pop() || "bin").toLowerCase();
  const path = `${productId}/${kind}-${Math.round(performance.now())}-${Math.floor(Math.random() * 1e6)}.${ext}`;
  const { error } = await supabase.storage.from("product-docs").upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  const { data } = supabase.storage.from("product-docs").getPublicUrl(path);
  return data.publicUrl;
}

// Imposta gli URL di SDS / scheda tecnica sul prodotto (canonico).
export async function setProductDocuments(productId, sdsUrl, tdsUrl) {
  const { error } = await supabase.rpc("set_product_documents", { p_product: productId, p_sds: sdsUrl || null, p_tds: tdsUrl || null });
  if (error) throw error;
}

// Certificati prodotto (uno-a-molti).
export async function getProductCertificates(productId) {
  const { data, error } = await supabase
    .from("product_certificates")
    .select("id, cert_type, label, file_url, expiry_date, created_at")
    .eq("product_id", productId)
    .order("cert_type", { ascending: true });
  if (error) throw error;
  return data || [];
}
export async function addProductCertificate(productId, certType, label, fileUrl, expiryDate) {
  const { data, error } = await supabase.rpc("add_product_certificate", {
    p_product: productId, p_cert_type: certType, p_label: label || null, p_file_url: fileUrl, p_expiry: expiryDate || null,
  });
  if (error) throw error;
  return data; // cert id
}
export async function deleteProductCertificate(certId) {
  const { error } = await supabase.rpc("delete_product_certificate", { p_cert_id: certId });
  if (error) throw error;
}

// Il fornitore imposta il numero di lotto sull'ordine.
export async function setOrderLot(orderId, lot) {
  const { error } = await supabase.rpc("set_order_lot", { p_order: orderId, p_lot: lot || null });
  if (error) throw error;
}

// Scarica il PNG del QR di un ordine (edge function order-qr) come blob URL, col JWT
// della sessione. Il chiamante deve URL.revokeObjectURL quando ha finito.
export async function fetchOrderQrObjectUrl(orderId) {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let token = anon;
  try { const { data } = await supabase.auth.getSession(); if (data?.session?.access_token) token = data.session.access_token; } catch {}
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/order-qr?order_id=${encodeURIComponent(orderId)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, apikey: anon } });
  if (!resp.ok) throw new Error(`QR_HTTP_${resp.status}`);
  return URL.createObjectURL(await resp.blob());
}

// Admin: reinvio manuale email ordine + elenco email dell'ordine.
export async function adminResendOrderEmail(orderId, kind) {
  const { error } = await supabase.rpc("admin_resend_order_email", { p_order: orderId, p_kind: kind });
  if (error) throw error;
}
export async function adminListOrderEmails(orderId) {
  const { data, error } = await supabase.rpc("admin_list_order_emails", { p_order: orderId });
  if (error) throw error;
  return data || [];
}
