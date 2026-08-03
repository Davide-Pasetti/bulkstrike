import ProfileShell from "@/components/BulkStrikeProfileShell";
import SampleRequestsBuyerPage from "@/components/BulkStrikeSampleRequestsBuyer";

export default function Page() {
  return (
    <ProfileShell active="richieste-campioni">
      <SampleRequestsBuyerPage inShell />
    </ProfileShell>
  );
}
