import BulkStrikeAndamentoPrezzi from "@/components/BulkStrikeAndamentoPrezzi";

export const metadata = {
  title: "Andamento prezzi materie prime | BulkStrike",
  description: "Prezzi reali delle materie prime sulla piattaforma BulkStrike affiancati ai riferimenti di mercato (ISMEA/CUN, indici settoriali Eurostat).",
};

export default function Page() {
  return <BulkStrikeAndamentoPrezzi />;
}
