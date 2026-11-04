import { notFound, redirect } from "next/navigation";
import { requireUser, RequestError } from "@/lib/server/access";
import { damageId } from "@/lib/server/damage-http";
import { loadDamage } from "@/lib/server/damages";
import { damageLanguage } from "@/lib/server/damage-language";
import { DamageView } from "@/components/damage-view";
import { DamageRefresh } from "@/components/damage-forms";
export const metadata = { title: "Schadensmeldung" };
export default async function DamagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await requireUser();
  const rawId = (await params).id;
  if (user.role === "admin") redirect(`/schaeden/${rawId}`);
  try {
    const id = damageId(rawId);
    const detail = await loadDamage(id, user);
    return (
      <>
        <DamageRefresh />
        <DamageView
          detail={detail}
          user={user}
          language={await damageLanguage()}
          created={(await searchParams).created === "1"}
        />
      </>
    );
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) notFound();
    throw error;
  }
}
