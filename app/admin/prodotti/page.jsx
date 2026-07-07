import ProfileShell from "@/components/BulkStrikeProfileShell";
import AdminProductsPage from "@/components/BulkStrikeAdminProducts";

export default function Page() {
  return (
    <ProfileShell active="admin">
      <AdminProductsPage inShell />
    </ProfileShell>
  );
}
