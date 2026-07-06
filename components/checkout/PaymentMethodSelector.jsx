// ============================================================
// BulkStrike — Selettore metodo di pagamento per sub-ordine
// Destinazione: components/checkout/PaymentMethodSelector.jsx
//
// Da montare nel checkout UNA VOLTA PER FORNITORE (la soglia
// €10.000 è per sub-ordine, non sul totale carrello):
//
//   <PaymentMethodSelector
//     buyerId={buyerCompanyId}
//     supplierId={subOrder.supplierId}
//     supplierName={subOrder.supplierName}
//     subOrderTotal={subOrder.totaleIvaEsclusa}
//     value={metodoScelto}
//     onChange={(m) => setMetodo(subOrder.supplierId, m)}
//   />
//
// subOrderTotal = orders.goods_subtotal + orders.shipping_amount
// (imponibile, IVA esclusa — orders.vat_amount escluso dal confronto soglia)
//
// Usa la RPC get_available_payment_methods (migration
// 20260706_payment_escrow_system.sql).
// ============================================================
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const ETICHETTE = {
  escrow_sepa: {
    titolo: 'Pagamento protetto (deposito in garanzia)',
    descr: 'Addebito SEPA sul tuo conto. I fondi restano in deposito presso l\u2019istituto di pagamento e vengono rilasciati al fornitore solo dopo la consegna confermata.',
    nota: 'Commissione servizio di garanzia esposta separatamente al riepilogo.',
  },
  escrow_premium: {
    titolo: 'Pagamento protetto premium (deposito in garanzia)',
    descr: 'Come il pagamento protetto, per ordini di importo elevato. Pagamento con carta, fondi rilasciati al fornitore solo dopo la consegna confermata.',
    nota: 'Servizio opzionale con commissione maggiorata, esposta separatamente prima della conferma.',
  },
  bonifico_anticipato: {
    titolo: 'Bonifico bancario anticipato',
    descr: 'Paghi la merce direttamente al fornitore, il cui IBAN ti viene mostrato qui in piattaforma dopo la conferma.',
    nota: null, // l'avviso rischi è nel blocco dedicato sotto
  },
  termini_dilazionati: {
    titolo: 'Pagamento dilazionato',
    descr: 'Ricevi la merce e paghi il fornitore con bonifico alla scadenza concordata.',
    nota: null,
  },
};

const AVVISO_BONIFICO = [
  'Il fornitore ti verrà reso noto e riceverai il suo IBAN esclusivamente qui in piattaforma: non fidarti di coordinate bancarie ricevute via email o altri canali.',
  'Il pagamento avviene fuori da ogni circuito di garanzia: nessuna protezione in caso di mancata o difforme consegna.',
  'BulkStrike non riceve né trasferisce questi fondi e non risponde del buon esito del pagamento o della fornitura.',
];

export default function PaymentMethodSelector({
  buyerId,
  supplierId,
  supplierName,
  subOrderTotal,
  value,
  onChange,
}) {
  const supabase = createClient();
  const [metodi, setMetodi] = useState(null);
  const [richiestaInviata, setRichiestaInviata] = useState(false);
  const [invioInCorso, setInvioInCorso] = useState(false);
  const [giorniRichiesti, setGiorniRichiesti] = useState(30);
  const [errore, setErrore] = useState(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('get_available_payment_methods', {
        p_buyer_id: buyerId,
        p_supplier_id: supplierId,
        p_order_total: subOrderTotal,
      });
      if (error) { setErrore('Impossibile caricare i metodi di pagamento. Riprova.'); return; }
      setMetodi(data);
      // Preseleziona il default se il padre non ha ancora un valore
      const def = data?.find((m) => m.default);
      if (def && !value) onChange?.(def.method);
    })();
  }, [buyerId, supplierId, subOrderTotal]);

  async function richiediTermini() {
    setInvioInCorso(true);
    const { error } = await supabase.from('payment_terms_requests').insert({
      buyer_id: buyerId,
      supplier_id: supplierId,
      requested_terms_days: giorniRichiesti,
    });
    setInvioInCorso(false);
    if (error) {
      setErrore(
        error.code === '23505'
          ? 'Hai già una richiesta in attesa per questo fornitore.'
          : `Invio non riuscito: ${error.message}`
      );
      return;
    }
    setRichiestaInviata(true);
  }

  if (errore && !metodi) return <p className="pms-errore">{errore}</p>;
  if (!metodi) return <p className="pms-caricamento">Caricamento metodi di pagamento…</p>;

  const richiestaDisponibile = metodi.some((m) => m.method === 'request_terms_available');
  const selezionabili = metodi.filter((m) => m.method !== 'request_terms_available');

  return (
    <div className="pms">
      <style>{`
        .pms { border: 1px solid #dde4ea; border-radius: 12px; padding: 18px 20px; margin-bottom: 18px; background: #fff; font-family: Arial, Helvetica, sans-serif; }
        .pms-fornitore { font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: #0C4A6E; margin-bottom: 12px; font-weight: bold; }
        .pms-opzione { display: flex; gap: 12px; padding: 12px; border: 1.5px solid #dde4ea; border-radius: 10px; margin-bottom: 10px; cursor: pointer; transition: border-color .15s; }
        .pms-opzione:hover { border-color: #0C4A6E; }
        .pms-opzione.attiva { border-color: #0C4A6E; background: #f2f8fc; }
        .pms-opzione input { margin-top: 3px; accent-color: #0C4A6E; }
        .pms-titolo { font-size: 14.5px; font-weight: 600; color: #1a2530; }
        .pms-descr { font-size: 13px; color: #44525f; margin-top: 3px; line-height: 1.5; }
        .pms-nota { font-size: 12px; color: #0C4A6E; margin-top: 5px; }
        .pms-avviso { background: #fdf6ec; border: 1px solid #e8d5b0; border-radius: 10px; padding: 12px 14px; margin: 4px 0 10px; }
        .pms-avviso .pms-titolo { color: #7a5a1e; font-size: 13px; }
        .pms-avviso ul { margin: 6px 0 0; padding-left: 18px; font-size: 12.5px; color: #6b5320; line-height: 1.6; }
        .pms-richiesta { border-top: 1px dashed #dde4ea; margin-top: 6px; padding-top: 12px; font-size: 13px; color: #44525f; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .pms-richiesta select { padding: 6px 8px; border: 1px solid #cdd7df; border-radius: 6px; font-size: 13px; }
        .pms-richiesta button { background: #fff; color: #0C4A6E; border: 1.5px solid #0C4A6E; border-radius: 7px; padding: 7px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .pms-richiesta button:disabled { opacity: .5; cursor: wait; }
        .pms-conferma { color: #1e7a3c; font-size: 13px; font-weight: 600; }
        .pms-errore { color: #a33; font-size: 13px; }
        .pms-caricamento { color: #8a97a3; font-size: 13px; }
      `}</style>

      <div className="pms-fornitore">Pagamento — {supplierName}</div>

      {selezionabili.map((m) => {
        const info = ETICHETTE[m.method];
        const attiva = value === m.method;
        return (
          <label key={m.method} className={`pms-opzione${attiva ? ' attiva' : ''}`}>
            <input
              type="radio"
              name={`metodo-${supplierId}`}
              checked={attiva}
              onChange={() => onChange?.(m.method)}
            />
            <div>
              <div className="pms-titolo">
                {info.titolo}
                {m.method === 'termini_dilazionati' && m.terms_days
                  ? ` — ${m.terms_days} giorni`
                  : ''}
              </div>
              <div className="pms-descr">{info.descr}</div>
              {info.nota && <div className="pms-nota">{info.nota}</div>}
            </div>
          </label>
        );
      })}

      {value === 'bonifico_anticipato' && (
        <div className="pms-avviso">
          <div className="pms-titolo">Prima di scegliere il bonifico anticipato</div>
          <ul>
            {AVVISO_BONIFICO.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      {richiestaDisponibile && !richiestaInviata && (
        <div className="pms-richiesta">
          <span>Lavori spesso con questo fornitore? Richiedi il pagamento dilazionato:</span>
          <select value={giorniRichiesti} onChange={(e) => setGiorniRichiesti(Number(e.target.value))}>
            <option value={30}>30 giorni</option>
            <option value={60}>60 giorni</option>
          </select>
          <button disabled={invioInCorso} onClick={richiediTermini}>
            Invia richiesta al fornitore
          </button>
          {errore && <span className="pms-errore">{errore}</span>}
        </div>
      )}
      {richiestaInviata && (
        <div className="pms-richiesta">
          <span className="pms-conferma">
            Richiesta inviata. Il fornitore la valuterà: se accolta, l'opzione
            comparirà qui dai prossimi ordini.
          </span>
        </div>
      )}
    </div>
  );
}
