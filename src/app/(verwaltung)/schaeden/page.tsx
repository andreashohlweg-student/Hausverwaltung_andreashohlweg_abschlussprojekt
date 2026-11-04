import { requireAdmin } from "@/lib/server/access";
import { listDamages } from "@/lib/server/damages";
import { DamageList } from "@/components/damage-view";
import { DamageRefresh } from "@/components/damage-forms";
export const metadata = { title: "Schadensmeldungen" };
export default async function DamagesPage() {
  const user = await requireAdmin();
  const reports = await listDamages(user);
  return (
    <>
      <DamageRefresh />
      <div className="page-heading">
        <h1>
          Schadensmeldungen{" "}
          <span className="heading-count">{reports.length}</span>
        </h1>
      </div>
      <DamageList reports={reports} language="de" admin />
    </>
  );
}
