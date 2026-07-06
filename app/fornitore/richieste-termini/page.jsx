// ============================================================
// BulkStrike — Pannello fornitore: pagamenti dilazionati
// Destinazione: app/fornitore/richieste-termini/page.jsx
//   → rinominare questo file in page.jsx dopo il posizionamento
//
// Due sezioni:
//  1. Richieste in attesa (approva / rifiuta)
//  2. Acquirenti abilitati (whitelist attiva, con revoca)
// L'upsert in whitelist all'approvazione è gestito dal trigger
// DB fn_apply_approved_terms: qui basta aggiornare lo status.
// ============================================================
'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

const dataIt = (d) => new Date(d).toLocaleDateString('it-IT');

const AVVERTENZA = `Abilitando il pagamento dilazionato per questo acquirente:
• Il rischio di mancato pagamento è interamente a tuo carico: BulkStrike non presta alcuna garanzia né interviene nel recupero del credito.
• I corrispettivi dovuti al trasportatore, comprensivi della commissione di piattaforma, restano dovuti alle scadenze pattuite anche se l'acquirente non ti ha ancora pagato.
Confermi l'abilitazione?`;

export default function RichiesteTerminiPage() {
  const supabase = createClient();
  const [companyId, setCompanyId] = useState(null);
  const [richieste, setRichieste] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState(null); // id riga in aggiornamento

  const carica = useCallback(async (cid) => {
    const [{ data: r }, { data: w }] = await Promise.all([
      supabase
        .from('payment_terms_requests')
        .select('*, buyer:buyer_id (name, vat_number)')
        .eq('supplier_id', cid)
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase
        .from('supplier_trusted_buyers')
        .select('*, buyer:buyer_id (name, vat_number)')
        .eq('supplier_id', cid)
        .eq('status', 'active')
        .order('granted_at', { ascending: false }),
    ]);
    setRichieste(r ?? []);
    setWhitelist(w ?? []);
    setCaricamento(false);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: membro } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .single();
      if (!membro) { setCaricamento(false); return; }
      setCompanyId(membro.company_id);
      carica(membro.company_id);
    })();
  }, []);

  async function rispondi(richiesta, esito) {
    if (esito === 'approved' && !window.confirm(AVVERTENZA)) return;
    setInCorso(richiesta.id);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('payment_terms_requests')
      .update({ status: esito, responded_by: user.id })
      .eq('id', richiesta.id);
    setInCorso(null);
    if (error) { alert(`Operazione non riuscita: ${error.message}`); return; }
    carica(companyId);
  }

  async function revoca(riga) {
    if (!window.confirm(`Revocare i termini a ${riga.buyer?.name}? Dai prossimi ordini non potrà più scegliere il pagamento dilazionato.`)) return;
    setInCorso(riga.id);
    const { error } = await supabase
      .from('supplier_trusted_buyers')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', riga.id);
    setInCorso(null);
    if (error) { alert(`Operazione non riuscita: ${error.message}`); return; }
    carica(companyId);
  }

  return (
    <div className="rt-wrap">
      <style>{`
        .rt-wrap { max-width: 880px; margin: 0 auto; padding: 32px 20px 64px; font-family: Arial, Helvetica, sans-serif; color: #1a2530; }
        .rt-wrap h1 { font-size: 24px; color: #0D2137; margin: 0 0 6px; }
        .rt-sotto { color: #6b7a88; font-size: 14px; margin-bottom: 28px; }
        .rt-sezione { font-size: 12px; text-transform: uppercase; letter-spacing: 1.4px; color: #0C4A6E; border-bottom: 2px solid #0C4A6E; padding-bottom: 6px; margin: 32px 0 14px; }
        .rt-card { border: 1px solid #dde4ea; border-radius: 10px; padding: 16px 18px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; background: #fff; }
        .rt-card .chi strong { font-size: 15.5px; }
        .rt-card .chi .meta { font-size: 12.5px; color: #6b7a88; margin-top: 3px; }
        .rt-badge { display: inline-block; background: #e5f3fb; color: #0C4A6E; font-weight: bold; font-size: 12.5px; padding: 3px 10px; border-radius: 999px; margin-left: 8px; }
        .rt-msg { font-size: 13px; color: #44525f; font-style: italic; margin-top: 6px; max-width: 480px; }
        .rt-azioni { display: flex; gap: 8px; }
        .rt-azioni button { border: 0; border-radius: 7px; padding: 9px 16px; font-size: 13.5px; cursor: pointer; font-weight: 600; }
        .rt-azioni button:disabled { opacity: .5; cursor: wait; }
        .btn-ok { background: #0C4A6E; color: #fff; }
        .btn-no { background: #f2f6f9; color: #44525f; }
        .btn-revoca { background: #fff; color: #a33; border: 1px solid #dbb !important; }
        .rt-vuoto { color: #8a97a3; font-size: 14px; padding: 18px 4px; }
      `}</style>

      <h1>Pagamenti dilazionati</h1>
      <p className="rt-sotto">
        Gli acquirenti abilitati potranno scegliere il pagamento a 30 o 60 giorni
        per gli ordini con i tuoi prodotti. Il rischio di credito è a tuo carico.
      </p>

      <div className="rt-sezione">Richieste in attesa ({richieste.length})</div>
      {caricamento && <p className="rt-vuoto">Caricamento…</p>}
      {!caricamento && richieste.length === 0 && (
        <p className="rt-vuoto">Nessuna richiesta in attesa.</p>
      )}
      {richieste.map((r) => (
        <div className="rt-card" key={r.id}>
          <div className="chi">
            <strong>{r.buyer?.name}</strong>
            <span className="rt-badge">{r.requested_terms_days} giorni</span>
            <div className="meta">
              {r.buyer?.vat_number ? `P.IVA ${r.buyer.vat_number} · ` : ''}
              richiesta del {dataIt(r.created_at)}
            </div>
            {r.message && <div className="rt-msg">“{r.message}”</div>}
          </div>
          <div className="rt-azioni">
            <button className="btn-no" disabled={inCorso === r.id}
              onClick={() => rispondi(r, 'denied')}>Rifiuta</button>
            <button className="btn-ok" disabled={inCorso === r.id}
              onClick={() => rispondi(r, 'approved')}>Abilita</button>
          </div>
        </div>
      ))}

      <div className="rt-sezione">Acquirenti abilitati ({whitelist.length})</div>
      {!caricamento && whitelist.length === 0 && (
        <p className="rt-vuoto">Nessun acquirente abilitato al pagamento dilazionato.</p>
      )}
      {whitelist.map((w) => (
        <div className="rt-card" key={w.id}>
          <div className="chi">
            <strong>{w.buyer?.name}</strong>
            <span className="rt-badge">{w.terms_days} giorni</span>
            <div className="meta">
              {w.buyer?.vat_number ? `P.IVA ${w.buyer.vat_number} · ` : ''}
              abilitato il {dataIt(w.granted_at)}
            </div>
          </div>
          <div className="rt-azioni">
            <button className="btn-revoca" disabled={inCorso === w.id}
              onClick={() => revoca(w)}>Revoca</button>
          </div>
        </div>
      ))}
    </div>
  );
}
