import { notFound } from "next/navigation";
import { requireAdmin, RequestError } from "@/lib/server/access";
import { damageId } from "@/lib/server/damage-http";
import { loadDamage } from "@/lib/server/damages";
import { DamageView } from "@/components/damage-view";
import {
  DamageRefresh,
  MarkDamageMessagesRead,
} from "@/components/damage-forms";
import { ownerOptions } from "@/lib/server/records";
export const metadata = { title: "Schadensmeldung" };
export default async function DamagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  try {
    const detail = await loadDamage(damageId((await params).id), user);
    const owners = await ownerOptions(user);
    return (
      <>
        <DamageRefresh />
        <MarkDamageMessagesRead
          id={detail.report.id}
          messageIds={detail.messages
            .filter((message) => message.authorRole !== "admin")
            .map((message) => message.id)}
        />
        <DamageView detail={detail} user={user} language="de" owners={owners} />
      </>
    );
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) notFound();
    throw error;
  }
}
