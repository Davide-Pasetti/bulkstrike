// ============================================================
// BulkStrike — Generazione ricevute mensili verso i corrieri
// Destinazione: app/api/admin/ricevute-mensili/route.js
//
// POST /api/admin/ricevute-mensili   body: { year: 2026, month: 6 }
//   → per ogni corriere con commissioni 'accrued' nel mese:
//     crea la ricevuta (lordo / ritenuta 20% / netto / bollo),
//     assegna progressivo per anno, marca le righe ledger 'invoiced'
//
// GET  /api/admin/ricevute-mensili?year=2026
//   → elenco ricevute dell'anno
//
// Solo admin. Il PDF si genera in un secondo momento (pdf_path
// resta null); i dati della ricevuta sono già completi qui.
// ============================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PAYMENT_CONFIG, RICEVUTA_EMITTENTE } from '@/lib/payments/paymentConfig';

// Client creato al primo utilizzo (non al caricamento del modulo): durante
// "Collecting page data" in build Next.js valuta il modulo senza che le env
// var server-side siano necessariamente pronte, e createClient() a livello
// top-level lanciava "supabaseKey is required" e faceva fallire il build.
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY // service role: bypassa RLS, solo server-side
    );
  }
  return _supabase;
}

async function assertAdmin(request) {
  const supabase = getSupabase();
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  // Admin di PIATTAFORMA = companies.is_platform_admin.
  // NB: profiles.role è il ruolo DENTRO l'azienda (owner/admin/member):
  // usarlo qui darebbe accesso alle ricevute a qualsiasi admin aziendale.
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();
  if (!profile?.company_id) return null;
  const { data: company } = await supabase
    .from('companies')
    .select('is_platform_admin')
    .eq('id', profile.company_id)
    .single();
  return company?.is_platform_admin ? user : null;
}

export async function POST(request) {
  const supabase = getSupabase();
  const admin = await assertAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  const { year, month } = await request.json();
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'year/month non validi' }, { status: 400 });
  }

  // 1. Aggregato mensile per corriere (solo flusso tradizionale, status accrued)
  const { data: aggregati, error: aggErr } = await supabase.rpc(
    'get_monthly_commissions',
    { p_year: year, p_month: month }
  );
  if (aggErr) {
    return NextResponse.json({ error: aggErr.message }, { status: 500 });
  }
  if (!aggregati?.length) {
    return NextResponse.json({ message: 'Nessuna commissione da fatturare nel periodo', ricevute: [] });
  }

  // 2. Prossimo progressivo per l'anno
  const { data: last } = await supabase
    .from('ricevute')
    .select('numero')
    .eq('anno', year)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextNumero = (last?.numero ?? 0) + 1;

  const periodoDa = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodoA = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  // Idempotenza: una doppia chiamata (doppio click, retry di rete) non deve
  // generare ricevute duplicate. I corrieri già fatturati per questo periodo
  // vengono saltati; il vincolo UNIQUE (anno, numero) resta l'ultima difesa
  // contro la race sul progressivo (vedi retry più sotto).
  const { data: esistenti, error: exErr } = await supabase
    .from('ricevute')
    .select('carrier_id')
    .eq('anno', year)
    .eq('periodo_da', periodoDa)
    .neq('stato', 'annullata');
  if (exErr) {
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }
  const giaFatturati = new Set((esistenti ?? []).map((r) => r.carrier_id));

  const create = [];
  const saltate = [];

  for (const agg of aggregati) {
    if (giaFatturati.has(agg.carrier_id)) {
      saltate.push(agg.carrier_name);
      continue;
    }
    const lordo = Number(agg.total_commission);
    const ritenuta = Math.round(lordo * PAYMENT_CONFIG.ritenutaAcconto * 100) / 100;
    const netto = Math.round((lordo - ritenuta) * 100) / 100;
    // Il bollo è un rimborso del costo del documento, non un compenso:
    // non entra nel calcolo della ritenuta, si somma al netto da bonificare
    const marcaDaBollo = lordo > PAYMENT_CONFIG.sogliaMarcaDaBollo;
    const bollo = marcaDaBollo ? PAYMENT_CONFIG.importoBollo : 0;
    const totaleDaBonificare = Math.round((netto + bollo) * 100) / 100;

    // 3. Crea la ricevuta. Il progressivo è calcolato in JS (max+1), quindi
    // due chiamate concorrenti possono collidere: il vincolo UNIQUE
    // (anno, numero) fa fallire l'insert con 23505 e qui si ritenta
    // rileggendo il massimo, invece di generare duplicati.
    let ricevuta = null;
    for (let tentativo = 0; tentativo < 3; tentativo++) {
      const { data, error: recErr } = await supabase
        .from('ricevute')
        .insert({
          numero: nextNumero,
          anno: year,
          carrier_id: agg.carrier_id,
          periodo_da: periodoDa,
          periodo_a: periodoA,
          importo_lordo: lordo,
          ritenuta_acconto: ritenuta,
          importo_netto: netto,
          marca_da_bollo: marcaDaBollo,
          importo_bollo: bollo,
          totale_da_bonificare: totaleDaBonificare,
          stato: 'emessa',
        })
        .select()
        .single();

      if (!recErr) {
        ricevuta = data;
        break;
      }
      if (recErr.code === '23505') {
        // progressivo già usato da una chiamata concorrente: rilegge il max
        const { data: ultimo } = await supabase
          .from('ricevute')
          .select('numero')
          .eq('anno', year)
          .order('numero', { ascending: false })
          .limit(1)
          .maybeSingle();
        nextNumero = (ultimo?.numero ?? 0) + 1;
        continue;
      }
      return NextResponse.json(
        { error: `Ricevuta per ${agg.carrier_name}: ${recErr.message}`, ricevute_create: create },
        { status: 500 }
      );
    }
    if (!ricevuta) {
      return NextResponse.json(
        { error: `Ricevuta per ${agg.carrier_name}: progressivo in conflitto dopo 3 tentativi`, ricevute_create: create },
        { status: 500 }
      );
    }

    // 4. Marca le righe ledger del periodo come 'invoiced' e le lega alla ricevuta
    const { error: updErr } = await supabase
      .from('commission_ledger')
      .update({ status: 'invoiced', ricevuta_id: ricevuta.id })
      .eq('carrier_id', agg.carrier_id)
      .eq('flow_type', 'traditional')
      .eq('status', 'accrued')
      .gte('accrued_at', periodoDa)
      .lte('accrued_at', `${periodoA}T23:59:59`);

    if (updErr) {
      return NextResponse.json(
        { error: `Ledger update per ${agg.carrier_name}: ${updErr.message}` },
        { status: 500 }
      );
    }

    create.push({
      numero: `${ricevuta.numero}/${year}`,
      corriere: agg.carrier_name,
      ordini: Number(agg.n_orders),
      spedizioni_totali: Number(agg.total_shipping),
      lordo,
      ritenuta_20: ritenuta,
      netto,
      marca_da_bollo: marcaDaBollo,
      bollo_a_carico_corriere: bollo,
      totale_da_bonificare: totaleDaBonificare,
      emittente: RICEVUTA_EMITTENTE.nome,
    });
    nextNumero += 1;
  }

  return NextResponse.json({
    message:
      `${create.length} ricevute generate per ${month}/${year}` +
      (saltate.length ? ` (${saltate.length} già emesse, saltate)` : ''),
    ricevute: create,
    gia_emesse: saltate,
  });
}

export async function GET(request) {
  const supabase = getSupabase();
  const admin = await assertAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  const year = new URL(request.url).searchParams.get('year') ?? new Date().getFullYear();

  const { data, error } = await supabase
    .from('ricevute')
    // NB: la colonna si chiama legal_name ("name" non esiste su companies:
    // con "name" PostgREST restituiva errore a runtime, mai in build)
    .select('*, companies:carrier_id (legal_name)')
    .eq('anno', year)
    .order('numero', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ricevute: data });
}
