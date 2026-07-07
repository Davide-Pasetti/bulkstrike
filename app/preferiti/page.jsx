import ProfileShell from "@/components/BulkStrikeProfileShell";
import BulkStrikeFollowedSuppliers from "@/components/BulkStrikeFollowedSuppliers";

export default function Page() {
  return (
    <ProfileShell active="preferiti">
      <BulkStrikeFollowedSuppliers inShell />
    </ProfileShell>
  );
}
