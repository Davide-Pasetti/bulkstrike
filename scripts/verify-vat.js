/**
 * verify-vat.js
 * ─────────────────────────────────────────────────────────────────
 * Verifica GRATUITA delle P.IVA dei fornitori importati da Europages:
 *
 *   1. CHECKSUM: valida il formato formale della P.IVA italiana
 *      (algoritmo ufficiale a 11 cifre — non richiede internet)
 *   2. VIES: interroga il registro IVA europeo ufficiale (gratuito,
 *      nessuna API key) per verificare se la P.IVA è attualmente
 *      attiva, e recupera ragione sociale/indirizzo registrati.
 *
 * NB: VIES ≠ visura camerale. Conferma solo che la P.IVA esiste ed
 * è attiva secondo l'Agenzia delle Entrate/Commissione UE — non dà
 * accesso a bilanci, PEC, atti camerali (per quello serve
 * InfoCamere Telemaco, a pagamento — vedi guida).
 *
 * USO:
 *   node scripts/verify-vat.js [--limit=200] [--dry-run]
 *
 * ENV richieste: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * ─────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE) {
  console.error('❌  Mancano NEXT_PUBLIC_SUPABASE_URL e/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE, { auth: { persistSession: false } });

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit    = limitArg ? parseInt(limitArg.split('=')[1], 10) : 200;

const VIES_ENDPOINT = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';

// ── 1. Checksum formale P.IVA italiana (11 cifre) ─────────────────
function isValidItalianVatChecksum(vat) {
  if (!vat) return false;
  const clean = String(vat).replace(/^IT/i, '').replace(/\s/g, '');
  if (!/^\d{11}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let digit = parseInt(clean[i], 10);
    if (i % 2 === 1) { // posizioni pari (2ª, 4ª, ... 10ª cifra, indice 1,3,5,7,9)
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(clean[10], 10);
}

// ── 2. Verifica VIES (con retry leggero, il servizio a volte è instabile) ─
async function checkVies(vat, retries = 2) {
  const clean = String(vat).replace(/^IT/i, '').replace(/\s/g, '');

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(VIES_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryCode: 'IT', vatNumber: clean }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Diverse implementazioni VIES usano nomi campo leggermente diversi
      const isValid = data.isValid ?? data.valid ?? false;
      const traderName = data.name || data.traderName || null;

      return {
        found: true,
        active: !!isValid,
        traderName,
        traderAddress: data.address || data.traderAddress || null,
        raw: data,
      };
    } catch (err) {
      if (attempt === retries) {
        return { found: false, error: err.message };
      }
      await new Promise(r => setTimeout(r, 1500)); // backoff prima del retry
    }
  }
}

// ── Confronto fuzzy nome azienda (Levenshtein-lite semplificato) ──
function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\b(srl|s\.r\.l\.|spa|s\.p\.a\.|snc|sas|s\.s\.|ss|di|e figli|& figli)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesLikelyMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return null;
  if (na === nb) return true;
  // match parziale: una contenuta nell'altra
  if (na.includes(nb) || nb.includes(na)) return true;
  // quota di parole in comune
  const wordsA = new Set(na.split(' '));
  const wordsB = new Set(nb.split(' '));
  const common = [...wordsA].filter(w => wordsB.has(w) && w.length > 2);
  const ratio = common.length / Math.max(wordsA.size, wordsB.size);
  return ratio >= 0.5;
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔷  BulkStrike — Verifica gratuita P.IVA (checksum + VIES)\n');

  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, legal_name, vat, country')
    .eq('import_source', 'europages')
    .eq('vat_verified', false)
    .not('vat', 'is', null)
    .limit(limit);

  if (error) throw error;
  console.log(`📦  Aziende da verificare: ${companies.length}\n`);

  let checksumFail = 0, viesActive = 0, viesInactive = 0, viesNotFound = 0, nameMismatch = 0;

  for (const c of companies) {
    const checksumOk = c.country?.toLowerCase().includes('ital')
      ? isValidItalianVatChecksum(c.vat)
      : true; // per ora verifichiamo solo formato IT; altri paesi passano senza checksum locale

    if (!checksumOk) {
      checksumFail++;
      console.log(`  ❌ ${c.legal_name} — P.IVA "${c.vat}" non valida (checksum fallito)`);
      if (!dryRun) {
        await supabase.from('companies').update({
          vat_verified: true,
          vat_verified_at: new Date().toISOString(),
          vat_verification_source: 'checksum',
          vat_verification_notes: 'Checksum formale fallito — P.IVA probabilmente errata o non italiana',
          cciaa_status: 'non_trovata',
        }).eq('id', c.id);
      }
      continue;
    }

    const vies = await checkVies(c.vat);

    if (!vies.found) {
      viesNotFound++;
      console.log(`  ⚠️  ${c.legal_name} — VIES non raggiungibile (${vies.error})`);
      // Non marchiamo vat_verified=true: riproveremo al prossimo run
      continue;
    }

    let notes = '';
    if (vies.active) {
      viesActive++;
      const match = namesLikelyMatch(c.legal_name, vies.traderName);
      if (match === false) {
        nameMismatch++;
        notes = `⚠ Nome VIES diverso: "${vies.traderName}" vs "${c.legal_name}" — verificare manualmente`;
        console.log(`  🟡 ${c.legal_name} — attiva su VIES ma nome diverso: "${vies.traderName}"`);
      } else {
        notes = `VIES: attiva, nome corrispondente (${vies.traderName || 'n/d'})`;
        console.log(`  ✅ ${c.legal_name} — P.IVA attiva su VIES`);
      }
    } else {
      viesInactive++;
      notes = 'VIES: P.IVA non attiva o non trovata nel registro europeo';
      console.log(`  ❌ ${c.legal_name} — P.IVA non attiva su VIES`);
    }

    if (!dryRun) {
      await supabase.from('companies').update({
        vat_verified: true,
        vat_verified_at: new Date().toISOString(),
        vat_verification_source: 'vies',
        vat_verification_notes: notes,
      }).eq('id', c.id);
    }

    // Rispetto del rate limit gentile di VIES (~10 richieste/sec, ma restiamo prudenti)
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`\n📊  Riepilogo:`);
  console.log(`   • Checksum falliti:        ${checksumFail}`);
  console.log(`   • VIES attive:             ${viesActive}`);
  console.log(`   • VIES non attive:         ${viesInactive}`);
  console.log(`   • VIES irraggiungibile:    ${viesNotFound}`);
  console.log(`   • Nomi diversi (da rivedere manualmente): ${nameMismatch}`);
  console.log(`\n${dryRun ? '(dry-run, nessuna scrittura su DB)' : 'Risultati salvati su companies.vat_verified*'}\n`);
}

main().catch(e => {
  console.error('❌ Errore fatale:', e.message);
  process.exit(1);
});
