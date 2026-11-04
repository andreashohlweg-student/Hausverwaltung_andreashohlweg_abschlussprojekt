import { notFound } from "next/navigation";
import { requireAdmin, RequestError } from "@/lib/server/access";
import { damageId } from "@/lib/server/damage-http";
import { loadDamage } from "@/lib/server/damages";
import { DamageView } from "@/components/damage-view";
import { DamageRefresh } from "@/components/damage-forms";
export const metadata = { title: "Schadensmeldung" };
export default async function DamagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  try {
    const detail = await loadDamage(damageId((await params).id), user);
    return (
      <>
        <DamageRefresh />
        <DamageView detail={detail} user={user} language="de" />
      </>
    );
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) notFound();
    throw error;
  }
}
