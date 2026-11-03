import { notFound } from "next/navigation";
import { entities, kindForSection } from "@/lib/domain";
import { EntityForm } from "@/components/entity-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const kind = kindForSection((await params).section);
  return {
    title: kind ? `${entities[kind].singular} anlegen` : "Nicht gefunden",
  };
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ gebaeude?: string | string[] }>;
}) {
  const kind = kindForSection((await params).section);
  const { gebaeude } = await searchParams;
  if (!kind) notFound();
  return (
    <EntityForm
      key={kind}
      kind={kind}
      building={typeof gebaeude === "string" ? gebaeude : undefined}
    />
  );
}
