import ProfileShell from "@/components/BulkStrikeProfileShell";
import CarrierProfilePage from "@/components/BulkStrikeCarrierProfile";

export default function Page() {
  return (
    <ProfileShell active="servizi">
      <CarrierProfilePage inShell />
    </ProfileShell>
  );
}
