import ProfileShell from "@/components/BulkStrikeProfileShell";
import AdminPromotionsPage from "@/components/BulkStrikeAdminPromotions";

export default function Page() {
  return (
    <ProfileShell active="admin-promozioni">
      <AdminPromotionsPage inShell />
    </ProfileShell>
  );
}
