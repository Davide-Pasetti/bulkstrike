import ProfileShell from "@/components/BulkStrikeProfileShell";
import SampleRequestsSupplierPage from "@/components/BulkStrikeSampleRequestsSupplier";

export default function Page() {
  return (
    <ProfileShell active="campionature">
      <SampleRequestsSupplierPage inShell />
    </ProfileShell>
  );
}
