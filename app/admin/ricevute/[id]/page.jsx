// ============================================================
// BulkStrike — Ricevuta stampabile (prestazione occasionale)
// Destinazione: app/admin/ricevute/[id]/page.jsx
//   → rinominare questo file in page.jsx dopo il posizionamento
//
// Il "PDF" si ottiene con il pulsante Stampa → Salva come PDF:
// layout A4 con CSS di stampa, zero dipendenze serverless.
// Solo admin (verifica ruolo lato client + RLS lato DB).
// ============================================================
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { RICEVUTA_EMITTENTE, PAYMENT_CONFIG } from '@/lib/payments/paymentConfig';

const eur = (n) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

const dataIt = (d) =>
  new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

// Con cacheComponents attivo (next.config.ts) non si può usare
// `export const dynamic = 'force-dynamic'`: useParams() va invece
// racchiuso in un boundary <Suspense>, altrimenti il prerender in build
// fallisce con "Uncached data was accessed outside of <Suspense>".
export default function RicevutaPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40 }}>Caricamento…</p>}>
      <RicevutaContent />
    </Suspense>
  );
}

function RicevutaContent() {
  const { id } = useParams();
  const supabase = createClient();
  const [ricevuta, setRicevuta] = useState(null);
  const [righe, setRighe] = useState([]);
  const [errore, setErrore] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: r, error } = await supabase
        .from('ricevute')
        .select('*, companies:carrier_id (legal_name, vat, address)')
        .eq('id', id)
        .single();
      if (error) { setErrore('Ricevuta non trovata o accesso non consentito.'); return; }
      setRicevuta(r);

      const { data: l } = await supabase
        .from('commission_ledger')
        .select('order_id, shipping_amount, commission_amount, accrued_at')
        .eq('ricevuta_id', id)
        .order('accrued_at');
      setRighe(l ?? []);
    })();
  }, [id]);

  if (errore) return <p style={{ padding: 40 }}>{errore}</p>;
  if (!ricevuta) return <p style={{ padding: 40 }}>Caricamento…</p>;

  const corriere = ricevuta.companies;

  return (
    <div className="ricevuta-wrap">
      <style>{`
        .ricevuta-wrap { background:#e8edf2; min-height:100vh; padding:24px; font-family:Georgia,'Times New Roman',serif; }
        .foglio { background:#fff; max-width:210mm; min-height:280mm; margin:0 auto; padding:22mm 20mm; color:#1a2530; box-shadow:0 2px 14px rgba(13,33,55,.18); }
        .testata { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #0D2137; padding-bottom:14px; }
        .testata h1 { font-size:21px; margin:0; letter-spacing:.5px; color:#0D2137; }
        .testata .num { text-align:right; font-size:14px; }
        .testata .num strong { font-size:19px; color:#0C4A6E; }
        .parti { display:flex; gap:32px; margin:26px 0; font-size:13.5px; line-height:1.65; }
        .parti > div { flex:1; }
        .etichetta { font-family:Arial,sans-serif; font-size:10px; text-transform:uppercase; letter-spacing:1.4px; color:#6b7a88; margin-bottom:5px; }
        table.dettaglio { width:100%; border-collapse:collapse; font-size:12.5px; margin-top:8px; }
        table.dettaglio th { font-family:Arial,sans-serif; font-size:10px; text-transform:uppercase; letter-spacing:1px; text-align:left; color:#6b7a88; border-bottom:1.5px solid #0D2137; padding:6px 4px; }
        table.dettaglio td { border-bottom:1px solid #dde4ea; padding:7px 4px; }
        table.dettaglio td.num, table.dettaglio th.num { text-align:right; font-variant-numeric:tabular-nums; }
        .totali { margin-top:22px; margin-left:auto; width:62%; font-size:14px; }
        .totali .riga { display:flex; justify-content:space-between; padding:6px 4px; }
        .totali .riga.finale { border-top:2.5px solid #0D2137; margin-top:6px; padding-top:10px; font-weight:bold; font-size:16.5px; color:#0D2137; }
        .note { margin-top:30px; font-size:11px; line-height:1.7; color:#44525f; border-top:1px solid #dde4ea; padding-top:14px; }
        .pagamento { margin-top:20px; font-size:13px; background:#f2f6f9; padding:12px 16px; border-left:4px solid #0C4A6E; }
        .bollo { float:right; width:70px; height:88px; border:1.5px dashed #9aa8b5; display:flex; align-items:center; justify-content:center; text-align:center; font-size:9px; color:#9aa8b5; font-family:Arial,sans-serif; margin-left:16px; }
        .azioni { max-width:210mm; margin:0 auto 14px; display:flex; justify-content:flex-end; }
        .azioni button { background:#0C4A6E; color:#fff; border:0; padding:10px 22px; font-size:14px; border-radius:6px; cursor:pointer; font-family:Arial,sans-serif; }
        @media print {
          .ricevuta-wrap { background:#fff; padding:0; }
          .foglio { box-shadow:none; padding:14mm 16mm; min-height:auto; }
          .azioni { display:none; }
          @page { size:A4; margin:0; }
        }
      `}</style>

      <div className="azioni">
        <button onClick={() => window.print()}>Stampa / Salva come PDF</button>
      </div>

      <div className="foglio">
        <div className="testata">
          <h1>Ricevuta per prestazione occasionale</h1>
          <div className="num">
            <strong>N. {ricevuta.numero}/{ricevuta.anno}</strong><br />
            Emessa il {dataIt(ricevuta.emessa_at)}
          </div>
        </div>

        {ricevuta.marca_da_bollo && (
          <div className="bollo">Marca da bollo<br />€ 2,00</div>
        )}

        <div className="parti">
          <div>
            <div className="etichetta">Prestatore</div>
            <strong>{RICEVUTA_EMITTENTE.nome}</strong><br />
            Nato a {RICEVUTA_EMITTENTE.natoA} il {RICEVUTA_EMITTENTE.natoIl}<br />
            {RICEVUTA_EMITTENTE.residenza}<br />
            C.F. {RICEVUTA_EMITTENTE.codiceFiscale}
          </div>
          <div>
            <div className="etichetta">Committente</div>
            <strong>{corriere?.legal_name}</strong><br />
            {corriere?.address ?? ''}<br />
            {corriere?.vat ? `P.IVA ${corriere.vat}` : ''}
          </div>
        </div>

        <div className="etichetta">
          Oggetto: servizi di intermediazione resi tramite la piattaforma BulkStrike —
          periodo {dataIt(ricevuta.periodo_da)} – {dataIt(ricevuta.periodo_a)}
        </div>

        <table className="dettaglio">
          <thead>
            <tr>
              <th>Data</th>
              <th>Riferimento ordine</th>
              <th className="num">Trasporto</th>
              <th className="num">Commissione ({PAYMENT_CONFIG.commissionRate * 100}%)</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.order_id + r.accrued_at}>
                <td>{new Date(r.accrued_at).toLocaleDateString('it-IT')}</td>
                <td>{r.order_id.slice(0, 8).toUpperCase()}</td>
                <td className="num">{eur(r.shipping_amount)}</td>
                <td className="num">{eur(r.commission_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="totali">
          <div className="riga">
            <span>Compenso lordo</span><span>{eur(ricevuta.importo_lordo)}</span>
          </div>
          <div className="riga">
            <span>Ritenuta d'acconto 20% (art. 25 DPR 600/73)</span>
            <span>− {eur(ricevuta.ritenuta_acconto)}</span>
          </div>
          <div className="riga">
            <span>Netto</span><span>{eur(ricevuta.importo_netto)}</span>
          </div>
          {ricevuta.marca_da_bollo && (
            <div className="riga">
              <span>Rimborso imposta di bollo (a carico del committente)</span>
              <span>+ {eur(ricevuta.importo_bollo)}</span>
            </div>
          )}
          <div className="riga finale">
            <span>Totale da bonificare</span><span>{eur(ricevuta.totale_da_bonificare)}</span>
          </div>
        </div>

        <div className="pagamento">
          <strong>Modalità di pagamento:</strong> bonifico bancario<br />
          Intestatario: {RICEVUTA_EMITTENTE.nome} — IBAN: {RICEVUTA_EMITTENTE.iban}
        </div>

        <div className="note">
          Operazione non soggetta a IVA ai sensi dell'art. 5 del DPR 633/72, trattandosi
          di prestazione occasionale resa al di fuori dell'esercizio abituale di arti e
          professioni. Il committente, in qualità di sostituto d'imposta, opererà la
          ritenuta d'acconto del 20% ai sensi dell'art. 25 del DPR 600/73 e ne verserà
          l'importo secondo i termini di legge.
          {ricevuta.marca_da_bollo && ' Imposta di bollo da € 2,00 assolta sull\u2019originale e posta a carico del committente ai sensi di legge.'}
        </div>
      </div>
    </div>
  );
}
