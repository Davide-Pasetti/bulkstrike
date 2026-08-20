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
// L'account va creato PRIMA dello step azienda: la rivendicazione di
// un'anagrafica esistente richiede un utente autenticato (find_claim_candidates /
// request_company_claim leggono il dominio della mail da auth.users, non dal
// client). Chiamata alla fine dello step 1; registerCompany la salta se la
// sessione esiste gia'.
export async function signUpAccount(email, pass) {
  const auth = await signUp(email, pass);
  if (!auth.user) throw new Error("Registrazione non riuscita: utente non creato.");
  return auth.user;
}

// Completa un'azienda RIVENDICATA con i dati dell'ultimo passaggio del signup:
// la company esiste gia' e il profilo e' gia' collegato dal claim, quindi
// register_company (che crea) qui non si puo' usare.
export async function completeClaimedCompany(form) {
  const materials = Object.entries(form.materials || {}).map(([name, a]) => ({
    name,
    alert_pool: !!a.pool, alert_price: !!a.price, alert_new_supplier: !!a.supplier,
    alert_closing: !!a.closing, alert_request: !!a.request, alert_outbid: !!a.outbid,
  }));
  const payload = {
    email: form.email,
    contact_name: form.contact || null,
    email_mgmt: form.emailMgmt || null,
    email_admin: form.emailAdmin || null,
    pec: form.pec || null,
    sdi: form.sdi || null,
    iban_holder: form.ibanHolder || null,
    iban: form.iban || null,
    bic: form.bic || null,
    production_capacity: form.capacity || null,
    countries_served: form.served || [],
    registration_macro_area_id: form.registrationMacroAreaId || null,
    materials,
  };
  const { data, error } = await supabase.rpc("complete_claimed_company", { payload });
  if (error) throw error;
  return data;
}

export async function registerCompany(form) {
  // 1) create the auth user (sets the session) — se lo step 1 l'ha gia' creato
  //    (percorso con rivendicazione) la sessione c'e' gia' e non si ripete.
  const existing = await getSession().catch(() => null);
  if (!existing) {
    const auth = await signUp(form.email, form.pass);
    if (!auth.user) throw new Error("Registrazione non riuscita: utente non creato.");
  }

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
    // Tipo fornitore = valore enum scelto nel form (producer|distributor|importer|
    // broker). Fallback al vecchio flag booleano bulk per retrocompatibilità.
    supplier_type: isSupplier ? (form.supplierType || (form.bulk ? "producer" : "distributor")) : null,
    email_mgmt: form.emailMgmt || null,
    email_admin: form.emailAdmin || null,
    pec: form.pec || null,
    sdi: form.sdi || null,
    // Gestionale in uso (DAV-75): serve a decidere con i dati quale
    // integrazione nativa costruire. Testo libero solo se "Altro".
    erp_system: form.erpSystem || null,
    erp_system_other: form.erpSystem === "Altro" ? form.erpOther || null : null,
    iban_holder: (isSupplier || isCarrier) ? form.ibanHolder || null : null,
    iban: (isSupplier || isCarrier) ? form.iban || null : null,
    bic: (isSupplier || isCarrier) ? form.bic || null : null,
    production_capacity: isSupplier ? form.capacity || null : null,
    countries_served: isSupplier ? form.served || [] : [],
    materials,
    // Settori di attività scelti in registrazione (sector_id uuid): la RPC li
    // imposta come settori preferiti e propaga il follow ai loro prodotti
    // (meccanismo DAV-47) — il catalogo del nuovo utente parte già filtrato.
    // Campo opzionale: id non validi vengono ignorati lato server.
    sectors: Array.isArray(form.sectors) ? form.sectors.filter(Boolean) : [],
    // Settore principale scelto in registrazione (macro_areas.id): default del
    // filtro Settore sul catalogo. Opzionale; id non valido ignorato lato server.
    registration_macro_area_id: form.registrationMacroAreaId || null,
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
// Serie INDICE settoriale Eurostat (tendenza, non EUR/kg) per un prodotto, via
// products.market_index_nace. → { nace_code, nace_label, fonte, fonte_url,
// last_month, series:[{t, index, pct}] } oppure null se il prodotto non è mappato.
export async function getMarketIndexSeries(productId) {
  if (!productId) return null;
  const { data, error } = await supabase.rpc("get_market_index_series", { p_product: productId });
  if (error) throw error;
  return data || null;
}
// Tutti gli indici settoriali Eurostat (per il widget Market Intelligence in home).
//   → [{ nace_code, nace_label, fonte, fonte_url, last_month, series:[{t,index,pct}] }]
export async function getMarketIndexSectors() {
  const { data, error } = await supabase.rpc("get_market_index_sectors");
  if (error) throw error;
  return data || [];
}
// Navigazione del selettore "Andamento prezzi" in home (DAV-69): per ogni
// settore il codice NACE del suo indice PPI (moda dei market_index_nace dei
// prodotti) e i prodotti del settore con serie di prezzo reale.
//   → [{ sector_id, nace_code, nace_label, products:[{id,name}] }]
export async function getMarketSelectorNav() {
  const { data, error } = await supabase.rpc("get_market_selector_nav");
  if (error) throw error;
  return data || [];
}
// Screener "Andamento prezzi": tutti i prodotti con prezzo attuale, macro-area e
// disponibilità delle due linee. → [{ id, name, best_price, primary_macro,
// primary_macro_slug, macro_slugs, has_history, external:'agri'|'index'|null, nace_code }]
export async function getPriceScreener() {
  const { data, error } = await supabase.rpc("get_price_screener");
  if (error) throw error;
  return data || [];
}
// Storico prezzi PROPRIETARIO di BulkStrike per un prodotto (transazioni confermate
// + esiti asta). → [{ t (date), price (€/kg), channel: 'Asta'|'Acquisto Rapido' }]
export async function getProductPriceHistory(productId) {
  if (!productId) return [];
  const { data, error } = await supabase.rpc("get_product_price_history", { p_product: productId });
  if (error) throw error;
  return data || [];
}
// Contatori reali per il blocco statistiche + badge della homepage.
//   → { active_pools, products, suppliers, companies, countries }
export async function getHomepageStats() {
  const { data, error } = await supabase.rpc("get_homepage_stats");
  if (error) throw error;
  return data || null;
}
// Ticker prezzi homepage: indice settoriale Eurostat (PPI, base 2021=100) per
// prodotto rappresentativo, non un prezzo reale EUR/kg. → [{ product_id,
// product_name, index_value, pct_change_ytd, nace_code, nace_label,
// fonte:'Eurostat', fonte_url, ref_month }]
export async function getPriceTicker(limit = 12) {
  const { data, error } = await supabase.rpc("get_price_ticker", { p_limit: limit });
  if (error) throw error;
  return data || [];
}
// Screener "Andamento prezzi" nel NUOVO modello: UNA riga per INDICATORE monitorato
// (non più per prodotto). Ogni riga porta l'ultimo valore, il valore di 12 mesi
// prima (per la variazione) e una sparkline di 24 punti. → [{ id, slug, nome,
// famiglia, tipo, unita, valuta, frequenza, fonte, fonte_url, licenza,
// attribuzione, pubblico, last_date, last_value, last_provvisorio, value_yoy,
// spark:[{t,v}], points }]
export async function getIndicatorScreener() {
  const { data, error } = await supabase.rpc("get_indicator_screener");
  if (error) throw error;
  return data || [];
}
// Serie completa di UN indicatore (grafico espanso), con metadati fonte/licenza.
//   → { slug, nome, famiglia, tipo, unita, valuta, frequenza, fonte, fonte_url,
//       licenza, attribuzione, pubblico, last_date, series:[{t,v,provvisorio}] }
export async function getIndicatorSeries(slug) {
  if (!slug) return null;
  const { data, error } = await supabase.rpc("get_indicator_series", { p_slug: slug });
  if (error) throw error;
  return data || null;
}
// Slug degli indicatori legati ai prodotti che l'utente segue (nuova semantica
// del filtro "Preferiti" su /andamento-prezzi). Richiede login. → [slug, ...]
export async function getMyFollowedIndicators() {
  const { data, error } = await supabase.rpc("get_my_followed_indicators");
  if (error) throw error;
  return data || [];
}
// Indicatore primario (+ eventuale benchmark) di un prodotto, per la scheda
// prodotto. → { primario: {slug,nome,famiglia,tipo,unita,valuta,fonte,fonte_url,
// licenza,last_date,last_value,value_yoy,spark:[{t,v}]} | null, benchmark: {...}|null }
export async function getProductIndicators(productId) {
  if (!productId) return null;
  const { data, error } = await supabase.rpc("get_product_indicators", { p_product: productId });
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

// Tassonomia chimica ("Tipo di sostanza"): parallela a getMacroAreas ma piatta
// a 2 gruppi (Famiglia chimica / Tipo di materiale). Solo classi con prodotti.
//   → [{ slug, name, ord, classes:[{ slug, name, product_count }] }]
let _chemClassesCache = null;
export function getChemicalClassesCached() { return _chemClassesCache; }
export async function getChemicalClasses() {
  if (_chemClassesCache) return _chemClassesCache;
  const { data, error } = await supabase.rpc("get_chemical_classes");
  if (error) throw error;
  _chemClassesCache = data || [];
  return _chemClassesCache;
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
    .select("id, canonical_name, cas_number, e_number, default_unit, listing_mode")
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
// Conferma spedizione del fornitore (DAV-74). DDT (numero+data) e lotto sono
// OBBLIGATORI: il numero DDT è la chiave con cui il gestionale del compratore
// riconcilia il carico di magazzino con la fattura SDI (DAV-75).
export async function markOrderShipped(orderId, { carrier, tracking, ddtNumber, ddtDate, lotNumber, expiryDate, quantityShipped, notes } = {}) {
  const { error } = await supabase.rpc("mark_order_shipped", {
    p_order_id: orderId,
    p_carrier: carrier || null,
    p_tracking: tracking || null,
    p_ddt_number: ddtNumber,
    p_ddt_date: ddtDate,
    p_lot_number: lotNumber,
    p_expiry_date: expiryDate || null,
    p_quantity_shipped: quantityShipped != null && quantityShipped !== "" ? Number(quantityShipped) : null,
    p_notes: notes || null,
  });
  if (error) throw error;
}
// File di carico per il gestionale (DAV-75, livello 1): dati con progressivo
// STABILE BS-GR-<anno>-<6 cifre> (chiave di idempotenza per il reimport) e
// DDT numero/data (la merce entra in magazzino col DDT; la fattura SDI si
// riconcilia sul numero DDT). Solo il compratore dell'ordine.
export async function getGoodsReceipt(orderId) {
  const { data, error } = await supabase.rpc("get_goods_receipt", { p_order: orderId });
  if (error) throw error;
  return data; // { numero_documento, data_documento, ddt_numero, ddt_data, ... }
}
/* ----- Pagina pubblica di ricezione via QR (DAV-74): il token È la credenziale ----- */
export async function getOrderReceiptInfo(orderId, token) {
  const { data, error } = await supabase.rpc("get_order_receipt_info", { p_order_id: orderId, p_token: token });
  if (error) throw error;
  return data; // { order_ref, status, already_delivered, product_name, quantity_kg, supplier_name, ddt_number, ... }
}
export async function confirmOrderReceipt(orderId, token, quantityReceived, notes) {
  const { data, error } = await supabase.rpc("confirm_order_receipt", {
    p_order_id: orderId, p_token: token,
    p_quantity_received: quantityReceived != null && quantityReceived !== "" ? Number(quantityReceived) : null,
    p_notes: notes || null,
  });
  if (error) throw error;
  return data; // { already: bool, delivered_at? }
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
    // Fornitori attivi del prodotto: 2+ = asta a ribasso, 1 = acquisto di gruppo.
    available_suppliers: row.available_suppliers != null ? Number(row.available_suppliers) : null,
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
  AUCTION_RESTRICTED_BY_LAW: "La normativa italiana vieta l'acquisto di questo prodotto agricolo/alimentare tramite asta a doppio ribasso. Disponibile solo con Acquisto Rapido.",
  NO_STANDARD_PRICE: "Nessun fornitore ha ancora pubblicato un prezzo per questo prodotto: non è possibile aprire un'asta finché non c'è un prezzo di riferimento.",
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

// Le RPC delle promozioni sollevano GIÀ messaggi completi in italiano per gli
// errori di business (prezzo/quota/durata/disponibilità); qui mappiamo solo i
// codici tecnici e lasciamo passare i messaggi già leggibili.
const PROMO_ERRORS = {
  NOT_AUTHENTICATED: "Devi accedere per eseguire questa azione.",
  NOT_ADMIN: "Azione riservata agli amministratori.",
  INVALID_QUANTITY: "Quantità non valida.",
  PROMOZIONE_NON_ATTIVA: "Questa promozione non è più attiva.",
};
export function promotionErrorMessage(error) {
  const msg = (error && error.message) || "";
  if (PROMO_ERRORS[msg]) return PROMO_ERRORS[msg];
  // Se non è un codice tecnico (TUTTO_MAIUSCOLO), è già una frase in italiano.
  if (msg && !/^[A-Z_]+$/.test(msg)) return msg;
  return "Operazione non riuscita. Riprova.";
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

// Anagrafica di tutti i fornitori pubblicamente visibili (verificati E censiti
// in attesa di verifica — DAV-33: il campo status distingue i due casi), con
// dati aggregati per i filtri client-side (settori, macro, certificazioni, n° prodotti).
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
 * price_tiers (visibili solo per fornitori manually_verified; il proprietario
 * vede i propri anche in bozza — DAV-33). ATTENZIONE: companies NON è più leggibile (policy SELECT
 * ristretta alla sola propria azienda dopo l'audit sicurezza) — i dati vetrina
 * dei fornitori si leggono dalla vista pubblica suppliers_public. Il pool
 * aperto NON si legge da pools (bloccato per anon): RPC get_open_pool_for_product.
 * ================================================================================ */

// Prodotto singolo per id + fornitori attivi con scaglioni prezzo (best-first).
// Ritorna null se l'id non esiste. Shape:
// { id, canonical_name, cas_number, e_number, iupac_name, description, formula,
//   pallet_kg, default_unit, regulatory_flags, merch_classes,
//   suppliers: [{ supplier_product_id, company_id, name, country, rating,
//                 reviews_count, status, grade, origin, min_order_kg, lead_time_days,
//                 certifications, tiers: [{ min_kg, max_kg, price_per_kg }],
//                 best_price }] }
// status ('verified'|'pending') distingue i fornitori controllati da un admin
// da quelli censiti in attesa di verifica (sezione "Fornitori non verificati").
export async function getProduct(productId) {
  if (!productId) return null;

  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("id, canonical_name, cas_number, e_number, iupac_name, description, formula, pallet_kg, default_unit, listing_mode, regulatory_flags, merch_classes, auction_restricted_by_law, scheda_sicurezza_url, scheda_tecnica_url")
    .eq("id", productId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!product) return null;

  const { data: sp, error: spErr } = await supabase
    .from("supplier_products")
    .select(`
      id, supplier_company_id, grade, origin, min_order_kg, lead_time_days, certifications, active,
      available_formats, variant_attributes, variant_status,
      price_tiers ( min_kg, max_kg, price_per_kg ),
      supplier_product_wine_specs ( price_per_hl_grado, alcohol_degree, price_per_hl, available_hl, vintage, total_acidity_g_l, total_so2_mg_l, production_zone, organic, available_until, notes )
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
      .select("id, legal_name, country, region, rating, reviews_count, status")
      .in("id", supplierIds);
    if (pubErr) throw pubErr;
    pubById = new Map((pubs || []).map((c) => [c.id, c]));
  }

  // Un'azienda senza riga in suppliers_public non è (più) pubblicamente
  // visibile — nascosta su richiesta, cancellata o fuori dai criteri di
  // visibilità: la sua offerta NON deve lasciare una card fantasma
  // "Fornitore" sulla scheda prodotto (DAV-33-bis).
  const suppliers = (sp || []).filter((row) => pubById.has(row.supplier_company_id)).map((row) => {
    const pub = pubById.get(row.supplier_company_id) || null;
    const tiers = (row.price_tiers || [])
      .map((t) => ({
        min_kg: Number(t.min_kg),
        max_kg: t.max_kg == null ? null : Number(t.max_kg),
        price_per_kg: Number(t.price_per_kg),
      }))
      .sort((a, b) => a.min_kg - b.min_kg);
    const best_price = tiers.length ? Math.min(...tiers.map((t) => t.price_per_kg)) : null;
    // Specifiche enologiche (1:1) per i prodotti a campionatura: PostgREST può
    // tornarle come oggetto (relazione to-one) o come array di 0/1 elementi.
    const wineRaw = row.supplier_product_wine_specs;
    const wine = Array.isArray(wineRaw) ? (wineRaw[0] || null) : (wineRaw || null);
    return {
      supplier_product_id: row.id,
      wine: wine ? {
        price_per_hl_grado: Number(wine.price_per_hl_grado),
        alcohol_degree: Number(wine.alcohol_degree),
        price_per_hl: wine.price_per_hl == null ? null : Number(wine.price_per_hl),
        available_hl: wine.available_hl == null ? null : Number(wine.available_hl),
        vintage: wine.vintage ?? null,
        total_acidity_g_l: wine.total_acidity_g_l == null ? null : Number(wine.total_acidity_g_l),
        total_so2_mg_l: wine.total_so2_mg_l == null ? null : Number(wine.total_so2_mg_l),
        production_zone: wine.production_zone || null,
        organic: !!wine.organic,
        available_until: wine.available_until || null,
        notes: wine.notes || null,
      } : null,
      company_id: row.supplier_company_id || null,
      name: pub?.legal_name || "Fornitore",
      country: pub?.country || "",
      region: pub?.region || null,
      rating: pub?.rating != null ? Number(pub.rating) : null,
      reviews_count: pub?.reviews_count ?? 0,
      status: pub?.status || null,
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
        ? row.available_formats.map((f) => ({ label: f.label || "unità", size_kg: Number(f.size_kg) || 25, pack_units: f.pack_units != null ? Number(f.pack_units) : null }))
        : [{ label: "sacco", size_kg: 25, pack_units: null }],
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

// Aziende che sappiamo vendere questo prodotto ma che NON sono su BulkStrike:
// censite dalla nostra ricerca (supplier_products con active=false, company non
// ancora 'verified'), quindi senza prezzo né acquisto in piattaforma. Include
// support_email (per "Chiedi un preventivo"), quindi dal 22/7 la RPC è
// eseguibile SOLO da utenti autenticati: da anonimi ritorna permission denied
// e il chiamante deve degradare a lista vuota (sezione nascosta).
//
// La stessa azienda può tornare più volte se è stata censita su più settori:
// deduplicare lato UI per (legal_name, website) prima di renderizzare.
export async function getProductCandidateSuppliers(productId) {
  if (!productId) return [];
  const { data, error } = await supabase.rpc("get_product_candidate_suppliers", { p_product_id: productId });
  if (error) throw error;
  return data || []; // [{ id, legal_name, country, website, logo_url }]
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
      id, grade, origin, min_order_kg, lead_time_days, certifications, active, samples_enabled,
      available_formats, variant_attributes, variant_status, variant_review_note, created_at,
      product:products ( id, canonical_name, e_number, cas_number, default_unit, listing_mode ),
      price_tiers ( min_kg, max_kg, price_per_kg ),
      supplier_product_wine_specs ( price_per_hl_grado, alcohol_degree, price_per_hl, available_hl, vintage, total_acidity_g_l, total_so2_mg_l, production_zone, organic, available_until, notes )
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

// Checkout unificato: crea gli ordini dal carrello ricevendo GIÀ indirizzo,
// corrieri e metodi di pagamento, e li mette DIRETTAMENTE nello stato finale
// corretto (niente 'paid' ottimistico poi degradato). Sostituisce la coppia
// checkoutCart + stampOrderPaymentMethods.
//   carrierSelections: { "<supplier_id>": "<carrier_id>" } — fornitore assente = in attesa corriere
//   paymentMethods:    { "<supplier_id>": { method: "escrow_sepa|escrow_premium|bonifico_anticipato|termini_dilazionati" } }
export async function placeOrder(shippingAddress, shippingNotes, carrierSelections, paymentMethods) {
  const { data, error } = await supabase.rpc("place_order", {
    p_shipping_address: shippingAddress,
    p_shipping_notes: shippingNotes || null,
    p_carrier_selections: carrierSelections || {},
    p_payment_methods: paymentMethods || {},
  });
  if (error) throw error;
  return data; // { orders:[uuid...], held_orders:[uuid...], payins:[uuid...], count, total }
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
 * BACHECA PROMOZIONI (DAV-76) — sconti fissi a tempo pubblicati dai fornitori.
 * NON sono aste: prezzo scontato fisso per un periodo limitato.
 * ================================================================================ */

// Bacheca pubblica: promozioni attive, ordinate per scadenza più vicina.
export async function getActivePromotions() {
  const { data, error } = await supabase.rpc("get_active_promotions");
  if (error) throw error;
  return data || []; // [{ id, product_id, product_name, supplier_name, discounted_price_per_kg, base_price_reference, base_price_window_days, discount_percent, starts_at, ends_at, available_kg, sold_kg, remaining_kg }]
}

// Prezzo medio di mercato di riferimento per il prodotto (media snapshot).
// Ritorna { avg_price, days_used } oppure null se lo storico è insufficiente.
export async function getPromotionBasePrice(productId, windowDays = 180) {
  const { data, error } = await supabase.rpc("get_promotion_base_price", { p_product_id: productId, p_window_days: windowDays });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null; // { avg_price, days_used }
}

// Promozioni del fornitore loggato (tutti gli stati) + contatore quota annua.
export async function getMyPromotions() {
  const { data, error } = await supabase.rpc("get_my_promotions");
  if (error) throw error;
  return data || { promotions: [], quota: [] };
}

// Crea una promozione (stato iniziale pending_review). Rilancia in caso di
// errore: i chiamanti mostrano promotionErrorMessage(e).
export async function createPromotion({ productId, supplierProductId = null, pricePerKg, startsAt, endsAt, availableKg = null }) {
  const { data, error } = await supabase.rpc("create_supplier_promotion", {
    p_product_id: productId,
    p_supplier_product_id: supplierProductId,
    p_discounted_price_per_kg: pricePerKg,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_available_kg: availableKg,
  });
  if (error) throw error;
  return data; // uuid della promozione creata
}

// Aggiunge una promozione al carrello (prezzo scontato) e la fa scorrere nel
// normale flusso di checkout.
export async function addPromotionToCart(promotionId, quantityKg) {
  const { error } = await supabase.rpc("add_promotion_to_cart", { p_promotion_id: promotionId, p_quantity: quantityKg });
  if (error) throw error;
}

// Admin: promozioni in attesa di revisione.
export async function adminListPendingPromotions() {
  const { data, error } = await supabase.rpc("admin_list_pending_promotions");
  if (error) throw error;
  return data || [];
}

export async function approvePromotion(id) {
  const { error } = await supabase.rpc("approve_promotion", { p_id: id });
  if (error) throw error;
}

export async function rejectPromotion(id, reason) {
  const { error } = await supabase.rpc("reject_promotion", { p_id: id, p_reason: reason || null });
  if (error) throw error;
}

/* ===================================================================================
 * CAMPIONATURA — vini e mosti sfusi (DAV-77). Prodotti listing_mode='sample_only':
 * niente carrello/asta/promo. Il compratore può solo RICHIEDERE UN CAMPIONE.
 * Accesso diretto alle tabelle: RLS + trigger lato DB applicano tutte le regole
 * (le date responded_at/shipped_at e i campi denormalizzati li stampiglia il DB).
 * ================================================================================ */

// Serie prezzi di mercato per PIAZZA (Verona, Asti, Pescara…), usata sulle schede
// vino. { unit, last_date, piazze:[{ piazza, fonte, ultimo_prezzo, ultima_data, serie:[{t,v}] }] }
export async function getMarketPriceSeriesByPiazza(productId, days = 365) {
  const { data, error } = await supabase.rpc("get_market_price_series_by_piazza", { p_product_id: productId, p_days: days });
  if (error) throw error;
  return data || { unit: "kg", last_date: null, piazze: [] };
}

// Specifiche enologiche del proprio listing (1:1 con supplier_products).
// price_per_hl è CALCOLATA dal DB: non inviarla mai.
export async function upsertWineSpec(supplierProductId, spec) {
  const { error } = await supabase.from("supplier_product_wine_specs").upsert({
    supplier_product_id: supplierProductId,
    price_per_hl_grado: spec.price_per_hl_grado,
    alcohol_degree: spec.alcohol_degree,
    available_hl: spec.available_hl ?? null,
    vintage: spec.vintage ?? null,
    total_acidity_g_l: spec.total_acidity_g_l ?? null,
    total_so2_mg_l: spec.total_so2_mg_l ?? null,
    production_zone: spec.production_zone ?? null,
    organic: !!spec.organic,
    available_until: spec.available_until ?? null,
    notes: spec.notes ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "supplier_product_id" });
  if (error) throw error;
}

// Richieste di campionatura dell'azienda loggata (sia come acquirente che come
// fornitore): RPC SECURITY DEFINER get_my_sample_requests, che risolve GIÀ il
// nome della controparte (con un select diretto la RLS su companies non lo
// permetterebbe). Ogni riga ha `role` 'buyer'|'supplier'. Ritorna [] se non
// loggato o senza company (mai errore). Campi: id, role, counterpart_id,
// counterpart_name, counterpart_city, counterpart_region, product_id,
// product_name, supplier_product_id, price_per_hl_grado, alcohol_degree,
// price_per_hl, quantity_l, shipping_address, message, status, decline_reason,
// tracking_note, created_at, responded_at, shipped_at.
export async function getMySampleRequests() {
  const { data, error } = await supabase.rpc("get_my_sample_requests");
  if (error) throw error;
  return data || [];
}

// Compratore: invia una richiesta di campionatura. Inviare SOLO questi campi;
// product_id e supplier_company_id li deriva il DB dal listing.
export async function createSampleRequest({ supplierProductId, quantityL = 0.75, shippingAddress, message = null }) {
  const companyId = await getMyCompanyId();
  if (!companyId) throw new Error("NOT_AUTHENTICATED");
  let requestedBy = null;
  try { const s = await getSession(); requestedBy = s?.user?.id || null; } catch { /* opzionale */ }
  const { error } = await supabase.from("sample_requests").insert({
    supplier_product_id: supplierProductId,
    buyer_company_id: companyId,
    requested_by: requestedBy,
    quantity_l: quantityL,
    shipping_address: shippingAddress,
    message: message || null,
  });
  if (error) throw error;
}

// (getSupplierSampleRequests/getBuyerSampleRequests rimossi: sostituiti da
//  getMySampleRequests, che risolve la controparte via RPC.)

// Cambio di stato (fornitore: accepted/declined/shipped; compratore: cancelled).
// Le date le stampiglia il trigger DB; l'email parte in automatico.
export async function updateSampleRequest(id, patch) {
  const { error } = await supabase.from("sample_requests").update(patch).eq("id", id);
  if (error) throw error;
}

// Elenco fornitori vino di un prodotto per la campionatura (verificati e non).
// Un'unica RPC SECURITY DEFINER, eseguibile anche da anon (la pagina si popola
// sempre). Ogni elemento: { supplier_product_id, company_id, legal_name, country,
// country_iso2, region, city, supplier_type, roles, website, logo_url, verified, colori }.
export async function getProductSuppliersForSampling(productId) {
  if (!productId) return [];
  const { data, error } = await supabase.rpc("get_product_suppliers_for_sampling", { p_product_id: productId });
  if (error) throw error;
  return data || [];
}

// Richiesta di campionatura CUMULATIVA a più fornitori in una sola chiamata, con
// le specifiche facoltative (colore, lavorazione, refrigerato, SO2, grado, varietà).
// La RPC gestisce ogni fornitore in modo indipendente (non tutto-o-niente) e torna
// un array: [{ supplier_product_id, supplier_company_id, status:'created'|'error',
// sample_request_id?, error_message? }]. Indirizzo e quantità NON sono più
// obbligatori: la funzione usa la sede registrata dell'acquirente e 0,75 L.
export async function requestSamplesBulk({
  supplierProductIds, specQuantitaPartita = null, specColore = null, specLavorazione = null, specRefrigerato = false,
  specSo2 = null, specGradoMin = null, specGradoMax = null, specVarieta = null,
  specDenominazioneTipo = null, specDenominazione = null, specAnnata = null, message = null,
  shippingAddress = null, quantityL = null, quantitaIndicativa = null,
  destinationCountry = null, destinationRegion = null, weightKg = null, carrierSelections = null,
}) {
  const payload = {
    supplier_product_ids: supplierProductIds,
    spec_quantita_partita_hl: specQuantitaPartita ?? null,
    spec_colore: specColore || null,
    spec_lavorazione: specLavorazione || null,
    spec_refrigerato: !!specRefrigerato,
    spec_so2_libera_mg_l: specSo2 ?? null,
    spec_grado_min: specGradoMin ?? null,
    spec_grado_max: specGradoMax ?? null,
    spec_varieta: specVarieta || null,
    spec_denominazione_tipo: specDenominazioneTipo || null,
    spec_denominazione: specDenominazione || null,
    spec_annata: specAnnata ?? null,
    message: message || null,
  };
  if (shippingAddress) payload.shipping_address = shippingAddress;
  if (quantityL) payload.quantity_l = quantityL;
  // Quantità che interessa al cliente, testo libero ("1000 kg"): finisce nella
  // riga di apertura dell'email al fornitore. Niente a che vedere con
  // quantity_l, che è il volume del campione.
  if (quantitaIndicativa) payload.quantita_indicativa = quantitaIndicativa;
  if (destinationCountry) payload.destination_country = destinationCountry;
  if (destinationRegion) payload.destination_region = destinationRegion;
  if (weightKg != null && weightKg !== "") payload.weight_kg = weightKg;
  // Il PREZZO non si manda: il backend lo ricalcola sempre. Mappa
  // supplier_product_id -> carrier_company_id scelto dal cliente.
  if (carrierSelections && Object.keys(carrierSelections).length) payload.carrier_selections = carrierSelections;
  const { data, error } = await supabase.rpc("request_samples_bulk", { payload });
  if (error) throw error; // errori globali (NOT_AUTHENTICATED, INDIRIZZO_MANCANTE, PESO_NON_VALIDO, ...)
  return data || [];
}

// Traduzione degli errori GLOBALI della RPC (quando data è null).
const BULK_SAMPLE_ERRORS = {
  NOT_AUTHENTICATED: "Accedi per richiedere un campione.",
  NESSUN_FORNITORE_SELEZIONATO: "Seleziona almeno un fornitore.",
  INDIRIZZO_MANCANTE: "Aggiungi un indirizzo di spedizione al tuo profilo aziendale.",
  NOTE_TROPPO_LUNGHE: "Le note non possono superare i 2000 caratteri.",
  QUANTITA_INDICATIVA_TROPPO_LUNGA: "La quantità indicativa è troppo lunga (massimo 100 caratteri).",
  QUANTITA_NON_VALIDA: "Quantità non valida.",
  COLORE_NON_VALIDO: "Colore non valido.",
  LAVORAZIONE_NON_VALIDA: "Lavorazione non valida.",
  DENOMINAZIONE_NON_VALIDA: "Il tipo di denominazione non è valido.",
  ANNATA_NON_VALIDA: "L'annata indicata non è valida.",
  QUANTITA_PARTITA_NON_VALIDA: "La quantità indicata non è valida.",
  PESO_NON_VALIDO: "Il peso del campione deve essere tra 0 e 50 kg.",
};
export function bulkSampleGlobalError(error) {
  const msg = (error && error.message) || "";
  if (BULK_SAMPLE_ERRORS[msg]) return BULK_SAMPLE_ERRORS[msg];
  return msg && !/^[A-Z_]+$/.test(msg) ? msg : "Operazione non riuscita. Riprova.";
}

// Errori campionatura: i trigger DB (23514) sollevano già frasi italiane pronte;
// l'indice unico (23505) è "richiesta già aperta".
export function sampleErrorMessage(error) {
  if (error?.code === "23505") return "Hai già una richiesta di campionatura aperta per questo prodotto.";
  const msg = error?.message || "";
  if (msg && !/^[A-Z_]+$/.test(msg)) return msg;
  return "Operazione non riuscita. Riprova.";
}

// Stato completo della campionatura per un prodotto (chiamabile anche da anon).
// La distinzione fra form dettagliato (vini/mosti) e form semplificato (materie
// prime) la fa SEMPRE il campo `richiede_specifiche`, mai il nome del prodotto.
// Ritorna: { consentito, motivo, messaggio, richiede_specifiche, limite_24h,
//            totale_fornitori, fornitori: [...] }.
export async function getProductSampling(productId) {
  if (!productId) return null;
  const { data, error } = await supabase.rpc("get_product_sampling", { p_product_id: productId });
  if (error) throw error;
  return data || null;
}

// Interruttore "Fornisco campioni" a livello azienda (companies.samples_enabled).
export async function setCompanySamplesEnabled(enabled) {
  const { data, error } = await supabase.rpc("set_company_samples_enabled", { p_enabled: !!enabled });
  if (error) throw error;
  return data;
}

// Interruttore "Fornisco campioni" sul singolo listino (supplier_products.samples_enabled).
export async function setSupplierProductSamplesEnabled(supplierProductId, enabled) {
  const { data, error } = await supabase.rpc("set_supplier_product_samples_enabled", {
    p_supplier_product: supplierProductId, p_enabled: !!enabled,
  });
  if (error) throw error;
  return data;
}

// Preventivi di spedizione REALI per la richiesta campioni: una spedizione per
// fornitore. Torna { destinazione, peso_kg, nessuna_tariffa, fornitori:[{
// supplier_product_id, supplier_company_id, fornitore, paese_partenza,
// disponibile, consigliato, opzioni:[{carrier_company_id, corriere, prezzo,
// giorni_consegna, espresso}] }] }.
export async function getSampleShippingOptions(supplierProductIds, destinationCountry = null, weightKg = null) {
  const { data, error } = await supabase.rpc("get_sample_shipping_options", {
    p_supplier_product_ids: supplierProductIds || [],
    p_destination_country: destinationCountry || null,
    p_weight_kg: weightKg ?? null,
  });
  if (error) throw error;
  return data || { fornitori: [] };
}

// Risposta del fornitore a una richiesta campione. esito: 'accetta' | 'rifiuta'.
// Se accetta, speseACarico ('fornitore' | 'cliente') è obbligatorio; con 'cliente'
// viene generato un ordine campione da pagare (torna { ordine, importo }).
export async function respondSampleRequest({ request, esito, speseACarico = null, motivo = null }) {
  const { data, error } = await supabase.rpc("respond_sample_request", {
    p_request: request, p_esito: esito,
    p_spese_a_carico: speseACarico || null, p_motivo: motivo || null,
  });
  if (error) throw error;
  return data;
}

// Ordini di tipo "campione" (solo spedizione + IVA), separati dagli ordini merce.
// Ogni riga: { id, role, counterpart_name, product_id, product_name,
// sample_request_id, corriere, peso_kg, spedizione, iva, totale, status,
// shipping_address, created_at, paid_at, shipped_at }.
export async function getMySampleOrders() {
  const { data, error } = await supabase.rpc("get_my_sample_orders");
  if (error) throw error;
  return data || [];
}

// Traduzione errori della risposta del fornitore (respond_sample_request).
const SAMPLE_RESPOND_ERRORS = {
  NOT_AUTHENTICATED: "Accedi per continuare.",
  RICHIESTA_INESISTENTE: "Richiesta non trovata.",
  NON_AUTORIZZATO: "Non sei autorizzato a gestire questa richiesta.",
  RICHIESTA_GIA_GESTITA: "Questa richiesta è già stata gestita.",
  ESITO_NON_VALIDO: "Azione non valida.",
  SPESE_A_CARICO_NON_INDICATE: "Indica chi paga la spedizione.",
  PREVENTIVO_SPEDIZIONE_MANCANTE: "Non c'è un preventivo di spedizione: puoi solo offrire tu la spedizione o rifiutare.",
};
export function sampleRespondError(error) {
  const msg = (error && error.message) || "";
  if (SAMPLE_RESPOND_ERRORS[msg]) return SAMPLE_RESPOND_ERRORS[msg];
  return msg && !/^[A-Z_]+$/.test(msg) ? msg : "Operazione non riuscita. Riprova.";
}

// Richiesta di preventivo/contatto verso un fornitore senza prezzo pubblicato.
// Genera una notifica interna (email a un operatore) che contatterà il
// fornitore a mano: nessun invio email al fornitore parte dal frontend.
export async function requestSupplierContact({ targetCompanyId, productId, message }) {
  const { data, error } = await supabase.rpc("request_supplier_contact", {
    p_target_company_id: targetCompanyId, p_product_id: productId, p_message: message,
  });
  if (error) throw error;
  return data;
}

// Preventivo / "essere ricontattato" verso PIÙ fornitori in una sola chiamata,
// dal box "Richiedi" della scheda prodotto. Un solo tipo per invio, valido per
// tutti i fornitori selezionati. Il messaggio è facoltativo. Come per i campioni
// ogni fornitore è indipendente: torna un array
// [{ target_company_id, status:'created'|'error', request_id?, error_message? }].
export async function requestSupplierContactBulk({ targetCompanyIds, productId, requestType, message = null, quantitaIndicativa = null }) {
  const payload = {
    target_company_ids: targetCompanyIds,
    product_id: productId,
    request_type: requestType, // 'preventivo' | 'contatto'
  };
  const msg = (message || "").trim();
  if (msg) payload.message = msg;
  const qta = (quantitaIndicativa || "").trim();
  if (qta) payload.quantita_indicativa = qta;
  const { data, error } = await supabase.rpc("request_supplier_contact_bulk", { payload });
  if (error) throw error;
  return data || [];
}

// Pagina admin "Mail ricevute": specchio della posta letta via IMAP.
// Il gate è nella RPC (NOT_ADMIN per i non-admin), non qui.
export async function adminListInbox(soloDaRivedere = false, limit = 100) {
  const { data, error } = await supabase.rpc("admin_list_inbox", {
    p_solo_da_rivedere: !!soloDaRivedere, p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

/* ----- Rivendica profilo dal link nell'email di richiesta ----- */
// Il token dice SOLO quale azienda e quale conversazione: non approva nulla,
// l'approvazione resta la review manuale dell'admin.
// Torna { ok:true, company_id, company_name, thread_id } oppure
// { ok:false, motivo:'TOKEN_NON_VALIDO'|'TOKEN_GIA_USATO'|'TOKEN_SCADUTO' }.
export async function claimTokenInfo(token) {
  const { data, error } = await supabase.rpc("claim_token_info", { p_token: token });
  if (error) throw error;
  return data || { ok: false, motivo: "TOKEN_NON_VALIDO" };
}
// Da chiamare ad account creato: crea la richiesta di rivendica con la stessa
// RPC di sempre e ricorda su quale conversazione far atterrare il fornitore
// dopo l'approvazione.
export async function claimWithToken(token) {
  const { data, error } = await supabase.rpc("claim_con_token", { p_token: token });
  if (error) throw error;
  return data;
}
// Al primo accesso dopo l'approvazione: la conversazione da aprire, una volta sola.
export async function myClaimLanding() {
  const { data, error } = await supabase.rpc("my_claim_landing");
  if (error) return null; // non deve mai bloccare l'accesso
  return data || null;
}

// Disiscrizione dalle email: la chiama la pagina pubblica /disiscrizione con il
// token del link in fondo alla richiesta. Nessuna sessione: il token È la
// credenziale, quindi la RPC è concessa ad anon di proposito.
// Torna { ok, email?, gia_disiscritto? } oppure { ok:false, error:'TOKEN_NON_VALIDO' }.
export async function unsubscribeEmail(token) {
  const { data, error } = await supabase.rpc("unsubscribe_email", { p_token: token });
  if (error) throw error;
  return data || { ok: false, error: "TOKEN_NON_VALIDO" };
}

const SUPPLIER_CONTACT_ERRORS = {
  NOT_AUTHENTICATED: "Accedi per inviare una richiesta.",
  MESSAGGIO_TROPPO_BREVE: "Scrivi qualche parola in più sulla richiesta (almeno 10 caratteri).",
  MESSAGGIO_TROPPO_LUNGO: "Il messaggio è troppo lungo (massimo 2000 caratteri).",
  QUANTITA_INDICATIVA_TROPPO_LUNGA: "La quantità indicativa è troppo lunga (massimo 100 caratteri).",
  LIMITE_24H_RAGGIUNTO: "Hai raggiunto il limite di 5 richieste ogni 24 ore (campioni, preventivi e contatti insieme).",
  RICHIESTA_GIA_INVIATA: "Hai già inviato questo tipo di richiesta a questo fornitore per questo prodotto negli ultimi 30 giorni.",
  FORNITORE_INESISTENTE: "Fornitore non trovato.",
  PRODOTTO_INESISTENTE: "Prodotto non trovato.",
  TIPO_NON_VALIDO: "Tipo di richiesta non valido.",
  NESSUN_FORNITORE_SELEZIONATO: "Seleziona almeno un fornitore.",
  NON_PUOI_CONTATTARE_TE_STESSO: "Non puoi inviare una richiesta alla tua stessa azienda.",
};
export function supplierContactError(error) {
  const msg = (error && error.message) || "";
  if (SUPPLIER_CONTACT_ERRORS[msg]) return SUPPLIER_CONTACT_ERRORS[msg];
  return msg && !/^[A-Z_]+$/.test(msg) ? msg : "Non è stato possibile inviare la richiesta. Riprova.";
}

/* ===================================================================================
 * BACHECA (DAV-78) — richieste di acquisto pubblicate dai compratori; i fornitori
 * rispondono. Tutto passa dalle RPC (le tabelle listings/listing_responses sono
 * chiuse dalla RLS per garantire l'anonimato del compratore). Le RPC di lettura
 * funzionano anche da sloggati.
 * ================================================================================ */

// Cascata settore -> prodotto con il numero di annunci attivi (pubblica).
export async function getBachecaFilters() {
  const { data, error } = await supabase.rpc("get_bacheca_filters");
  if (error) throw error;
  return data || [];
}

// Schema dei campi tecnici dichiarati a DB per un prodotto (pubblica). È la
// fonte del renderer generico del form/filtri: mai campi enologici hardcoded.
export async function getListingSpecSchema(productId) {
  if (!productId) return [];
  const { data, error } = await supabase.rpc("get_listing_spec_schema", { p_product_id: productId });
  if (error) throw error;
  return data || [];
}

// Elenco annunci filtrati (pubblica). filters: { sector_id, product_id, paesi,
// regioni, specs, limit, offset }. Torna { totale, annunci: [...] }.
export async function getBachecaListings(filters = {}) {
  const { data, error } = await supabase.rpc("get_bacheca_listings", { p_filters: filters || {} });
  if (error) throw error;
  return data || { totale: 0, annunci: [] };
}

// Dettaglio annuncio (pubblica) + schema, sono_il_proprietario, mia_risposta.
export async function getBachecaListing(id) {
  if (!id) return null;
  const { data, error } = await supabase.rpc("get_bacheca_listing", { p_id: id });
  if (error) throw error;
  return data || null;
}

// Pubblica un annuncio (loggati). Vedi payload nel handoff.
export async function createListing(payload) {
  const { data, error } = await supabase.rpc("create_listing", { payload });
  if (error) throw error;
  return data;
}

// Chiude o ritira un proprio annuncio.
export async function closeListing(id, stato) {
  const { error } = await supabase.rpc("close_listing", { p_id: id, p_stato: stato });
  if (error) throw error;
}

// Risposta del fornitore a un annuncio (crea o aggiorna). Torna { id, aggiornata }.
export async function respondToListing(payload) {
  const { data, error } = await supabase.rpc("respond_to_listing", { payload });
  if (error) throw error;
  return data;
}

// I miei annunci (loggati), ciascuno con le risposte ricevute (nome reale fornitore).
export async function getMyListings() {
  const { data, error } = await supabase.rpc("get_my_listings");
  if (error) throw error;
  return data || [];
}

export async function getMyListingAlertPrefs() {
  const { data, error } = await supabase.rpc("get_my_listing_alert_prefs");
  if (error) throw error;
  return data || null;
}

export async function setMyListingAlertPrefs(payload) {
  const { data, error } = await supabase.rpc("set_my_listing_alert_prefs", { payload });
  if (error) throw error;
  return data;
}

// Traduzione degli errori della bacheca. Per gli errori sulle specifiche
// (SPEC_*:chiave / INTERVALLO_NON_VALIDO:chiave) recupera l'etichetta dallo
// schema passato (array di campi).
const BACHECA_ERRORS = {
  NON_AUTENTICATO: "Devi accedere per continuare.",
  PRODOTTO_NON_AMMESSO_IN_BACHECA: "Questo prodotto non può essere richiesto in bacheca.",
  QUANTITA_NON_VALIDA: "Indica una quantità compresa tra 1 e 1.000.000.",
  PREZZO_INCOMPLETO: "Indica sia il prezzo massimo sia l'unità di misura.",
  PREZZO_NON_VALIDO: "Il prezzo indicato non è valido.",
  UNITA_PREZZO_NON_VALIDA: "Unità di prezzo non riconosciuta.",
  NOTE_TROPPO_LUNGHE: "Le note non possono superare i 2000 caratteri.",
  LIMITE_ANNUNCI_24H: "Puoi pubblicare al massimo 5 annunci al giorno.",
  TROPPI_ANNUNCI_ATTIVI: "Hai raggiunto il limite di 15 annunci attivi.",
  SOLO_FORNITORI: "Serve un profilo fornitore per rispondere.",
  ANNUNCIO_PROPRIO: "Non puoi rispondere a un tuo annuncio.",
  ANNUNCIO_NON_ATTIVO: "Questo annuncio non è più attivo.",
  RISPOSTA_VUOTA: "Compila almeno un campo della risposta.",
  MESSAGGIO_TROPPO_LUNGO: "Il messaggio è troppo lungo.",
};
const SPEC_ERR_TMPL = {
  SPEC_OBBLIGATORIA: (et) => `${et} è obbligatorio`,
  SPEC_NON_VALIDA: (et) => `${et}: valore non valido`,
  SPEC_FUORI_INTERVALLO: (et) => `${et}: valore fuori dai limiti consentiti`,
  SPEC_TROPPO_LUNGA: (et) => `${et}: testo troppo lungo`,
  INTERVALLO_NON_VALIDO: () => "Il valore minimo non può superare il massimo",
};
export function bachecaErrorMessage(error, schema) {
  const msg = (error && error.message) || "";
  if (BACHECA_ERRORS[msg]) return BACHECA_ERRORS[msg];
  const m = msg.match(/^(SPEC_OBBLIGATORIA|SPEC_NON_VALIDA|SPEC_FUORI_INTERVALLO|SPEC_TROPPO_LUNGA|INTERVALLO_NON_VALIDO):(.+)$/);
  if (m) {
    const code = m[1], chiave = m[2];
    const campo = (schema || []).find(c => c.chiave === chiave)
      || (schema || []).find(c => c.chiave === `${chiave}_min` || c.chiave === `${chiave}_max` || c.gruppo === chiave);
    const et = campo?.etichetta || chiave;
    return SPEC_ERR_TMPL[code] ? SPEC_ERR_TMPL[code](et) : `${et}: valore non valido`;
  }
  if (msg && !/^[A-Z_]+(:.*)?$/.test(msg)) return msg; // già leggibile
  return "Operazione non riuscita. Riprova.";
}

/* ===================================================================================
 * CICLO ORDINE E STORICO
 * ================================================================================ */

// (Il vecchio markOrderPaidDemo è stato rimosso: la RPC mark_order_paid_demo
// è ora eseguibile solo da service_role — 'paid' arriva SOLO dal webhook Stripe.)

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
// delle due parti del thread). Ritorna { contacts_masked, messages }: i contatti
// (email/telefono) nei corpi sono mascherati finché non esiste un ordine
// confermato tra le due aziende.
export async function getThreadMessages(threadId) {
  const { data, error } = await supabase.rpc("get_thread_messages", { p_thread: threadId });
  if (error) throw error;
  return { contacts_masked: !!data?.contacts_masked, messages: data?.messages || [] };
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
/* ----- Settori preferiti (sector_follows) — stella sui settori nel pannello filtri ----- */
export async function followSector(sectorId) {
  const { error } = await supabase.rpc("follow_sector", { p_sector: sectorId });
  if (error) throw error;
}
export async function unfollowSector(sectorId) {
  const { error } = await supabase.rpc("unfollow_sector", { p_sector: sectorId });
  if (error) throw error;
}
// Settori seguiti dall'azienda loggata: [{ sector_id, name, slug, icon, followed_at }].
// Chiamabile anche da anonimo (ritorna []): le stelle vuote si mostrano a chiunque.
export async function getMyFollowedSectors() {
  const { data, error } = await supabase.rpc("get_my_followed_sectors");
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

/* ===================================================================================
 * RIVENDICAZIONE AZIENDA (claim)
 * -----------------------------------------------------------------------------------
 * Le aziende censite dalla nostra ricerca di mercato esistono gia' in anagrafica:
 * chi si registra puo' prendere il controllo della propria invece di crearne una
 * doppia. Dominio email = dominio del sito → approvazione automatica; altrimenti
 * la richiesta passa dalla coda admin. Il claim automatico collega il profilo ma
 * NON abilita la pubblicazione dei prezzi (gate company_can_publish_prices).
 * ================================================================================ */

// Aziende candidate, gia' raggruppate per entita' reale: una voce per azienda,
// non una per riga di anagrafica (le multi-settore hanno fino a 9 copie).
export async function findClaimCandidates({ email, legalName = null, vat = null, role = "supplier" }) {
  const { data, error } = await supabase.rpc("find_claim_candidates", {
    p_email: email, p_legal_name: legalName, p_vat: vat, p_role: role,
  });
  if (error) throw error;
  return data || [];
}

// Rivendica l'azienda scelta. Il dominio della mail lo rilegge il server da
// auth.users: non si puo' falsificare dal client.
export async function requestCompanyClaim(companyId) {
  const { data, error } = await supabase.rpc("request_company_claim", { p_company_id: companyId });
  if (error) throw error;
  return data; // { status: 'approved' | 'pending_review', company_id, request_id, merge }
}

export async function adminListClaimRequests() {
  const { data, error } = await supabase.rpc("admin_list_claim_requests");
  if (error) throw error;
  return data || [];
}

export async function adminReviewClaim(requestId, approve, note = null) {
  const { data, error } = await supabase.rpc("admin_review_claim", {
    p_request_id: requestId, p_approve: approve, p_note: note,
  });
  if (error) throw error;
  return data;
}

/* ===================================================================================
 * RIMOZIONE E OCCULTAMENTO AZIENDE CENSITE (DAV-33-bis, layer legale)
 * -----------------------------------------------------------------------------------
 * Le aziende censite da fonti pubbliche sono visibili come "non verificate":
 * chiunque (anche senza login) può chiederne la rimozione; l'admin può
 * nasconderle SUBITO da tutte le viste pubbliche senza cancellare i dati.
 * ================================================================================ */

// Richiesta di rimozione self-service: NESSUN login richiesto (RPC eseguibile
// da anon). Ritorna { status: 'ok' | 'already_pending' }. Davide riceve una
// email per ogni richiesta (trigger → outbox → Resend).
export async function requestCompanyRemoval(companyId, email, reason = null) {
  const { data, error } = await supabase.rpc("request_company_removal", {
    p_company: companyId, p_email: email, p_reason: reason,
  });
  if (error) throw error;
  return data;
}

// Richieste di rimozione in attesa (coda admin).
export async function adminListRemovalRequests() {
  const { data, error } = await supabase.rpc("admin_list_removal_requests");
  if (error) throw error;
  return data || [];
}

// action: 'hide' = nascondi l'azienda e segna gestita; 'dismiss' = ignora.
export async function adminReviewRemoval(requestId, action) {
  const { data, error } = await supabase.rpc("admin_review_removal", {
    p_request: requestId, p_action: action,
  });
  if (error) throw error;
  return data;
}

// Nasconde/ripristina un'azienda in TUTTE le viste pubbliche (reversibile,
// dati mai cancellati). Effetto immediato: directory, scheda prodotto,
// profilo, candidati.
export async function adminSetCompanyHidden(companyId, hidden, reason = null) {
  const { data, error } = await supabase.rpc("admin_set_company_hidden", {
    p_company: companyId, p_hidden: hidden, p_reason: reason,
  });
  if (error) throw error;
  return data;
}

// L'unica azione di approvazione di un fornitore (DAV-33): imposta INSIEME
// manually_verified (pubblicazione prezzi) e status='verified' (badge pubblico).
// Con verified=false revoca entrambi (status torna 'pending').
export async function adminSetManuallyVerified(companyId, verified = true, note = null) {
  const { data, error } = await supabase.rpc("admin_set_manually_verified", {
    p_company: companyId, p_verified: verified, p_note: note,
  });
  if (error) throw error;
  return data;
}

// Scheda completa di un fornitore per la revisione admin. A differenza di
// getSupplierProfile() (solo fornitori pubblicamente visibili), questa funziona
// su qualunque pending — è il caso d'uso della coda di verifica. Gate _is_admin() lato DB.
export async function adminGetSupplierDetail(companyId) {
  const { data, error } = await supabase.rpc("admin_get_supplier_detail", { p_company: companyId });
  if (error) throw error;
  return data || null; // jsonb: anagrafica, fiscale, contatti, business + candidate_products[]
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

// Specifiche tecniche del prodotto (formato long, una riga per campo), ordinate
// per il campo `ordine`. Alimentano il pannello "scheda tecnica completa".
// → [{ campo, valore }]
export async function getProductSpecs(productId) {
  if (!productId) return [];
  const { data, error } = await supabase
    .from("product_specs")
    .select("campo, valore, ordine")
    .eq("product_id", productId)
    .order("ordine", { ascending: true });
  if (error) throw error;
  return data || [];
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
