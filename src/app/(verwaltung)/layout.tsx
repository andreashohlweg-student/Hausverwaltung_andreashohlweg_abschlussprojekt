import { requireAdmin } from "@/lib/server/access";
import { loadDatabase, loadAccountStatuses } from "@/lib/server/records";
import { DataProvider } from "@/components/data-provider";
import { AppShell } from "@/components/app-shell";
export const dynamic = "force-dynamic";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  const [{ data, revision }, accounts] = await Promise.all([
    loadDatabase(user),
    loadAccountStatuses(user),
  ]);
  return (
    <DataProvider
      initialData={data}
      initialRevision={revision}
      initialAccounts={accounts}
    >
      <AppShell user={user}>{children}</AppShell>
    </DataProvider>
  );
}
