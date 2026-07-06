/**
 * import-europages.js
 * ─────────────────────────────────────────────────────────────────
 * Importa aziende da un file JSON di Apify (Europages scraper)
 * nel database BulkStrike (tabella companies).
 *
 * USO:
 *   node scripts/import-europages.js <file.json> [--dry-run] [--macro-area=alimentare-bevande]
 *
 * DIPENDENZE:
 *   npm install @supabase/supabase-js dotenv
 *
 * ENV (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL=https://uufueekpxboygcotqvhu.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
 * ─────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { classifyRawMaterial } from './raw-material-classifier.js';

// ── Config ──────────────────────────────────────────────────────
const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE) {
  console.error('❌  Mancano le variabili NEXT_PUBLIC_SUPABASE_URL e/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false }
});

// ── Argomenti CLI ────────────────────────────────────────────────
const args       = process.argv.slice(2);
const filePath   = args.find(a => !a.startsWith('--'));
const dryRun     = args.includes('--dry-run');
const macroArg   = args.find(a => a.startsWith('--macro-area='));
const macroSlug  = macroArg ? macroArg.split('=')[1] : null;

if (!filePath) {
  console.error('❌  Specifica il file JSON: node import-europages.js output.json [--dry-run]');
  process.exit(1);
}


function mapSupplierType(categories = []) {
  const joined = categories.join(' ').toLowerCase();
  if (joined.includes('manufactur') || joined.includes('produttore') || joined.includes('fabbricante')) {
    return 'producer';
  }
  return 'distributor';
}

// ── Mappa: employee range Europages → BulkStrike ─────────────────
function normalizeEmployeeRange(raw) {
  if (!raw) return null;
  // Europages usa stringhe tipo "1-9", "10-49", "50-249", "250-999", "1000+"
  const cleaned = String(raw).replace(/\s/g, '');
  const known = ['1-9','10-49','50-99','100-249','250-999','1000+'];
  return known.find(r => cleaned.startsWith(r.split('-')[0])) || cleaned;
}

// ── Trasforma record Apify → companies row ───────────────────────
function transformRecord(raw, idx) {
  // Europages restituisce campi con nomi leggermente diversi
  // a seconda dell'Actor scelto — gestiamo i più comuni.
  const name =
    raw.name || raw.business_name || raw.companyName || raw.company_name || '';

  if (!name) {
    console.warn(`  ⚠  Riga ${idx}: nessun nome, saltata.`);
    return null;
  }

  // Indirizzo: può essere oggetto o stringa
  let address = '';
  let city    = '';
  let country = 'Italia';
  if (typeof raw.address === 'string') {
    address = raw.address;
  } else if (raw.address?.street) {
    address = [raw.address.street, raw.address.postalCode, raw.address.city].filter(Boolean).join(', ');
    city    = raw.address.city || '';
    country = raw.address.country || 'Italia';
  }
  city    = city || raw.city || raw.town || '';
  country = country || raw.country || 'Italia';

  // Contatti
  const phone   = raw.phone || raw.phone_number || raw.phoneNumber || null;
  const fax     = raw.fax   || null;
  const website = raw.website || raw.website_url || raw.websiteUrl || null;
  const email   = raw.email || raw.contactEmail || null;

  // Profilo
  const description    = raw.description || raw.about || null;
  const logo_url       = raw.logoUrl || raw.logo_url || raw.logo || null;
  const founded_year   = raw.foundingYear || raw.founded_in || raw.foundedIn
    ? parseInt(raw.foundingYear || raw.founded_in || raw.foundedIn, 10) || null
    : null;
  const employee_range = normalizeEmployeeRange(
    raw.employeeRange || raw.employee_count || raw.employees
  );

  // Certificazioni aziendali
  const certs = [];
  if (Array.isArray(raw.certifications)) {
    raw.certifications.forEach(c => {
      const label = typeof c === 'string' ? c : (c.name || c.label || '');
      if (label) certs.push(label);
    });
  }

  // Supplier type
  const categories   = raw.categories || raw.category || raw.supplierTypes || [];
  const supplier_type = mapSupplierType(
    Array.isArray(categories) ? categories : [String(categories)]
  );

  // Geo
  const latitude  = raw.latitude  || raw.lat || null;
  const longitude = raw.longitude || raw.lng || raw.lon || null;

  // Social
  const linkedin_url  = raw.linkedin  || raw.linkedinUrl  || null;
  const facebook_url  = raw.facebook  || raw.facebookUrl  || null;

  // VAT (P.IVA)
  const vat = raw.vatId || raw.vat || raw.vat_id || raw.vatNumber || null;

  // ID univoco Europages per dedup
  const external_ref   = raw.europagesId || raw.id || raw.externalId || null;
  const europages_url  = raw.europagesUrl || raw.url || raw.profileUrl || null;

  // Paesi serviti
  const countries_served = Array.isArray(raw.countriesServed)
    ? raw.countriesServed
    : (raw.deliveryTo ? [raw.deliveryTo] : []);

  // Classificazione materia prima vs prodotto finito/servizio
  const raw_material_supplier = classifyRawMaterial(raw);

  return {
    legal_name:           name.trim(),
    vat:                  vat || null,
    country:              country.trim() || 'Italia',
    city:                 city.trim() || null,
    address:              address.trim() || null,
    phone,
    fax,
    website,
    support_email:        email,
    description,
    logo_url,
    founded_year,
    employee_count_range: employee_range,
    company_certifications: certs,
    latitude:             latitude ? parseFloat(latitude) : null,
    longitude:            longitude ? parseFloat(longitude) : null,
    linkedin_url,
    facebook_url,
    supplier_type,
    countries_served,
    is_supplier:          true,
    is_buyer:             false,
    status:               'pending',           // richiede verifica admin
    import_source:        'europages',
    external_ref:         external_ref ? String(external_ref) : null,
    europages_url,
    raw_material_supplier,
  };
}

// ── Batch upsert ─────────────────────────────────────────────────
async function upsertBatch(rows) {
  const { data, error } = await supabase
    .from('companies')
    .upsert(rows, {
      onConflict:        'external_ref',   // dedup su ID Europages
      ignoreDuplicates:  false,
    })
    .select('id, legal_name');

  if (error) throw error;
  return data || [];
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔷  BulkStrike — Europages Importer');
  console.log(`   File:     ${filePath}`);
  console.log(`   Dry run:  ${dryRun}`);
  if (macroSlug) console.log(`   Macro area: ${macroSlug}`);
  console.log('');

  let raw;
  try {
    raw = JSON.parse(readFileSync(resolve(filePath), 'utf8'));
  } catch (e) {
    console.error(`❌  Impossibile leggere il file: ${e.message}`);
    process.exit(1);
  }

  // Apify può wrappare i risultati in {items:[...]} o essere un array diretto
  const records = Array.isArray(raw) ? raw : (raw.items || raw.results || []);
  console.log(`📦  Record nel file: ${records.length}`);

  // Trasforma
  const rows = records
    .map((r, i) => transformRecord(r, i))
    .filter(Boolean);

  console.log(`✅  Validi dopo trasformazione: ${rows.length}`);
  console.log(`🗑   Saltati (senza nome): ${records.length - rows.length}`);

  // Report classificazione materie prime — utile per validare il pilota
  const rawTrue  = rows.filter(r => r.raw_material_supplier === true).length;
  const rawFalse = rows.filter(r => r.raw_material_supplier === false).length;
  const rawNull  = rows.filter(r => r.raw_material_supplier === null).length;
  console.log(`\n📊  Classificazione "materia prima":`);
  console.log(`   ✅ Materia prima (true):        ${rawTrue}`);
  console.log(`   ❌ Prodotto finito/servizio:     ${rawFalse}`);
  console.log(`   ❓ Ambiguo (revisione manuale):  ${rawNull}`);

  if (dryRun) {
    console.log('\n📋  DRY RUN — prime 5 righe (con classificazione):\n');
    rows.slice(0, 5).forEach((r, i) => {
      const tag = r.raw_material_supplier === true ? '✅' : r.raw_material_supplier === false ? '❌' : '❓';
      console.log(`  ${tag} [${i + 1}] ${r.legal_name} | ${r.city} | ${r.vat || 'VAT-'} | ${r.supplier_type}`);
    });
    console.log('\nNessuna scrittura su DB (--dry-run attivo).\n');
    return;
  }

  // Upsert a batch di 100
  const BATCH = 100;
  let inserted = 0, errors = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    try {
      const result = await upsertBatch(batch);
      inserted += result.length;
      process.stdout.write(`  ⬆  ${Math.min(i + BATCH, rows.length)}/${rows.length} \r`);
    } catch {
      // Prova record per record se il batch fallisce
      for (const row of batch) {
        try {
          await upsertBatch([row]);
          inserted++;
        } catch (singleErr) {
          console.error(`\n  ❌ Errore su "${row.legal_name}": ${singleErr.message}`);
          errors++;
        }
      }
    }
  }

  console.log(`\n\n🎉  Importazione completata:`);
  console.log(`   • Upserted:  ${inserted}`);
  console.log(`   • Errori:    ${errors}`);
  console.log(`\n   → I record importati hanno status='pending'.`);
  console.log(`   → Verifica manualmente in Supabase e cambia a 'verified' per renderli visibili.\n`);
}

main().catch(e => {
  console.error('❌ Errore fatale:', e.message);
  process.exit(1);
});
