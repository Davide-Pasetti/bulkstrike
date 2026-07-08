import ProfileShell from "@/components/BulkStrikeProfileShell";
import AdminSuppliersPage from "@/components/BulkStrikeAdminSuppliers";

export default function Page() {
  return (
    <ProfileShell active="admin-fornitori">
      <AdminSuppliersPage inShell />
    </ProfileShell>
  );
}
