import { Suspense } from "react";
import BulkStrikeBachecaDettaglio from "@/components/BulkStrikeBachecaDettaglio";

async function Loader({ params }) {
  const { id } = await params;
  return <BulkStrikeBachecaDettaglio id={id} />;
}

export default function Page({ params }) {
  return (
    <Suspense fallback={null}>
      <Loader params={params} />
    </Suspense>
  );
}
