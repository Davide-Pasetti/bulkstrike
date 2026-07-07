import BulkStrikeOrder from "@/components/BulkStrikeOrder";

// La pagina ordine può mostrare l'IBAN del fornitore (per i bonifici anticipati).
// Difesa in profondità: pur essendo già dietro login, blocchiamo indicizzazione e
// addestramento AI (noindex + noai). Il blocco dei crawler noti è in app/robots.ts.
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
  other: { robots: "noai, noimageai" },
};

export default function Page() {
  return <BulkStrikeOrder />;
}
