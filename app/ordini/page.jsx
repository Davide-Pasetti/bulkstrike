import ProfileShell from "@/components/BulkStrikeProfileShell";
import BulkStrikeOrders from "@/components/BulkStrikeOrders";

export default function Page() {
  return (
    <ProfileShell active="ordini">
      <BulkStrikeOrders inShell />
    </ProfileShell>
  );
}
