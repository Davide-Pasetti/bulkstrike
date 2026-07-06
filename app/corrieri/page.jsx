// app/corrieri/page.jsx — anagrafica pubblica di tutti i corrieri.
// La voce "Corrieri" della navbar punta qui; la gestione del proprio
// listino tariffe resta nel profilo corriere (/corriere).
import BulkStrikeCarriers from "@/components/BulkStrikeCarriers";

export default function Page() {
  return <BulkStrikeCarriers />;
}
