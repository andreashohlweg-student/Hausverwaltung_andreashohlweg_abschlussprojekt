import { notFound, redirect } from "next/navigation";
import { requireUser, RequestError } from "@/lib/server/access";
import { damageId } from "@/lib/server/damage-http";
import { loadDamage } from "@/lib/server/damages";
import { damageLanguage } from "@/lib/server/damage-language";
import { DamageView } from "@/components/damage-view";
import { parseBuildingDamageFilter } from "@/lib/damage";
import {
  DamageRefresh,
  MarkDamageMessagesRead,
} from "@/components/damage-forms";
export const metadata = { title: "Schadensmeldung" };
export default async function DamagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    gebaeude?: string | string[];
    filter?: string | string[];
  }>;
}) {
  const user = await requireUser();
  const rawId = (await params).id;
  if (user.role === "admin") redirect(`/schaeden/${rawId}`);
  try {
    const id = damageId(rawId);
    const detail = await loadDamage(id, user);
    const query = await searchParams;
    const filter = parseBuildingDamageFilter(query.filter);
    const backHref =
      user.role === "owner" &&
      typeof query.gebaeude === "string" &&
      query.gebaeude === detail.report.propertyId
        ? `/portal/gebaeude/${encodeURIComponent(query.gebaeude)}${filter === "all" ? "" : `?filter=${filter}`}`
        : undefined;
    return (
      <>
        <DamageRefresh />
        <MarkDamageMessagesRead
          id={detail.report.id}
          messageIds={detail.messages
            .filter((message) => message.authorRole === "admin")
            .map((message) => message.id)}
        />
        <DamageView
          detail={detail}
          user={user}
          language={await damageLanguage()}
          created={query.created === "1"}
          backHref={backHref}
        />
      </>
    );
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) notFound();
    throw error;
  }
}
