import ProfileShell from "@/components/BulkStrikeProfileShell";
import PromotionsPage from "@/components/BulkStrikePromotions";

export default function Page() {
  return (
    <ProfileShell active="promozioni">
      <PromotionsPage inShell />
    </ProfileShell>
  );
}
