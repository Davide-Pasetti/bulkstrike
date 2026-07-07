import ProfileShell from "@/components/BulkStrikeProfileShell";
import BulkStrikeMessages from "@/components/BulkStrikeMessages";

export default function Page() {
  return (
    <ProfileShell active="messaggi">
      <BulkStrikeMessages inShell />
    </ProfileShell>
  );
}
