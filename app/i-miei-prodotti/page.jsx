import ProfileShell from "@/components/BulkStrikeProfileShell";
import MyProductsPage from "@/components/BulkStrikeMyProducts";

export default function Page() {
  return (
    <ProfileShell active="prodotti">
      <MyProductsPage inShell />
    </ProfileShell>
  );
}
