import BulkStrikeReceipt from "@/components/BulkStrikeReceipt";

// Pagina PUBBLICA di conferma ricezione via QR (DAV-74): nessun login, il
// token nell'URL è la credenziale (validato server-side contro
// orders.receipt_token, con rate limit sui tentativi errati).
// Contiene dati d'ordine: niente indicizzazione né addestramento AI.
export const metadata = {
  title: "Conferma ricezione ordine | BulkStrike",
  robots: { index: false, follow: false, nocache: true },
  other: { robots: "noai, noimageai" },
};

// cacheComponents: l'await di params (dato dinamico) deve stare dentro un
// <Suspense>, altrimenti la build rifiuta la route come "blocking".
import { Suspense } from "react";

async function ReceiptLoader({ params }) {
  const { orderId, token } = await params;
  return <BulkStrikeReceipt orderId={orderId} token={token} />;
}

export default function Page({ params }) {
  return (
    <Suspense fallback={null}>
      <ReceiptLoader params={params} />
    </Suspense>
  );
}
