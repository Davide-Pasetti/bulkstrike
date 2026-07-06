/**
 * raw-material-classifier.js
 * ─────────────────────────────────────────────────────────────────
 * Classifica un'azienda Europages come:
 *   true   → fornitore di materie prime / semilavorati / ingredienti (TARGET BulkStrike)
 *   false  → prodotti finiti / commerciali / servizi (ESCLUSO)
 *   null   → ambiguo, richiede revisione manuale
 *
 * Logica: punteggio = (keyword positive trovate) - (keyword negative trovate)
 * nel testo di descrizione + categorie Europages.
 *
 * Puoi modificare liberamente le liste sotto per affinare la precisione
 * dopo aver visto i risultati del pilota.
 * ─────────────────────────────────────────────────────────────────
 */

// ── Segnali POSITIVI: materia prima / semilavorato / ingrediente ──
const POSITIVE_KEYWORDS = [
  // Generico
  'materia prima', 'materie prime', 'raw material', 'raw materials',
  'semilavorat', 'semi-finished', 'semifinished',
  'ingrediente', 'ingredienti', 'ingredient', 'ingredients',
  'bulk', 'alla rinfusa', 'sfuso', 'sfusi', 'commodity', 'commodities',
  'granulo', 'granuli', 'granulare', 'polvere industriale', 'powder',
  'concentrato', 'concentrati', 'concentrate',
  'estratto', 'estratti', 'extract', 'extracts',
  'additivo', 'additivi', 'additive', 'additives',

  // Chimica / farmaceutica
  'principio attivo', 'principi attivi', 'active ingredient', 'API ',
  'eccipiente', 'eccipienti', 'excipient',
  'intermedio chimico', 'chemical intermediate',
  'solvente', 'solventi', 'solvent', 'solvents',
  'catalizzatore', 'catalizzatori', 'catalyst',
  'polimero', 'polimeri', 'polymer', 'polymers',
  'resina', 'resine', 'resin', 'resins',
  'pigmento', 'pigmenti', 'pigment', 'pigments',
  'tensioattivo', 'tensioattivi', 'surfactant',
  'acido', 'acidi solfor', 'acid', 'idrossido', 'hydroxide',

  // Alimentare / enologico
  'lievito', 'lieviti', 'yeast',
  'malto', 'malt', 'luppolo', 'hops',
  'farina', 'farine', 'flour', 'cereali', 'grain', 'grains',
  'aroma alimentare', 'flavour', 'flavoring',

  // Metalli / plastiche / gomma
  'lega metallica', 'alloy', 'alloys', 'metallo grezzo', 'raw metal',
  'gomma naturale', 'gomma sintetica', 'rubber',
  'fibra di vetro', 'fibra di carbonio', 'fiber', 'fibre',
  'cellulosa', 'pulp', 'polpa di legno',

  // Agricoltura
  'fertilizzante', 'fertilizzanti', 'fertilizer',
  'concime', 'concimi', 'agrochimic', 'agrochemical',
  'fitofarmac', 'biostimolante', 'biostimulant',
];

// ── Segnali NEGATIVI: prodotto finito / commerciale / servizio ────
const NEGATIVE_KEYWORDS = [
  // Prodotti di consumo finiti
  'abbigliamento', 'clothing', 'apparel', 'moda', 'fashion',
  'calzature', 'scarpe', 'shoes', 'footwear',
  'gioiell', 'jewelry', 'jewellery', 'bijoux',
  'arredamento', 'furniture', 'mobili', 'mobile da',
  'elettrodomestic', 'appliance', 'appliances',
  'elettronica di consumo', 'consumer electronics',
  'smartphone', 'tablet', 'laptop',
  'automobile', 'veicol', 'vehicle', 'auto usate',
  'giocattol', 'toy', 'toys',
  'borsa', 'borse', 'handbag', 'valigi', 'luggage',
  'cosmetico finito', 'crema viso', 'profumo per', 'makeup', 'trucco',
  'confezione regalo', 'gift',

  // Macchinari / attrezzature (capex, non materia prima)
  'macchinari per', 'macchina per', 'machinery', 'equipment',
  'impianto industriale', 'linea di produzione',
  'attrezzatura', 'attrezzature',

  // Servizi (non forniscono materiale fisico)
  'servizi di consulenza', 'consulting services', 'consulenza',
  'agenzia di marketing', 'marketing agency',
  'software', 'app mobile', 'sviluppo web',
  'servizi di traduzione', 'translation services',
  'servizi legali', 'legal services', 'studio legale',
  'recruiting', 'reclutamento', 'risorse umane', 'HR services',
  'trasporti e logistica', 'spedizioni', 'shipping services',
  'stampa digitale', 'printing services', 'tipografia',
  'noleggio', 'rental services', 'car rental',
  'agenzia immobiliare', 'real estate',
  'formazione', 'training', 'corsi di',
];

/**
 * Classifica un record grezzo Europages.
 * @param {object} raw - record originale (prima della trasformazione)
 * @returns {boolean|null}
 */
export function classifyRawMaterial(raw) {
  const description = (raw.description || raw.about || '').toLowerCase();
  const categories = Array.isArray(raw.categories)
    ? raw.categories.join(' ')
    : String(raw.categories || raw.category || '');
  const text = `${description} ${categories.toLowerCase()}`;

  let score = 0;
  for (const kw of POSITIVE_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) score += 1;
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) score -= 1;
  }

  // Bonus: se Europages classifica l'azienda come "Manufacturer/Producer"
  // o "Wholesaler" ed abbiamo almeno un segnale positivo, rafforza la fiducia.
  const catLower = categories.toLowerCase();
  const isProducerOrWholesaler =
    catLower.includes('manufacturer') || catLower.includes('producer') ||
    catLower.includes('wholesaler')  || catLower.includes('produttore') ||
    catLower.includes('fabbricante') || catLower.includes('grossista');

  // Se è SOLO "Service provider" e non ha nessun segnale positivo forte → probabile servizio
  const isOnlyService =
    catLower.includes('service provider') && !isProducerOrWholesaler;

  if (isOnlyService && score <= 0) return false;
  if (score > 0) return true;
  if (score < 0) return false;
  return null; // ambiguo → revisione manuale
}

/**
 * Ritorna anche il dettaglio del punteggio, utile per debug/log durante il pilota.
 */
export function classifyRawMaterialVerbose(raw) {
  const description = (raw.description || raw.about || '').toLowerCase();
  const categories = Array.isArray(raw.categories)
    ? raw.categories.join(' ')
    : String(raw.categories || raw.category || '');
  const text = `${description} ${categories.toLowerCase()}`;

  const matchedPositive = POSITIVE_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()));
  const matchedNegative = NEGATIVE_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()));

  return {
    result: classifyRawMaterial(raw),
    score: matchedPositive.length - matchedNegative.length,
    matchedPositive,
    matchedNegative,
  };
}
