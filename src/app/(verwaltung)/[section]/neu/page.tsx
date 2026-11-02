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
}: {
  params: Promise<{ section: string }>;
}) {
  const kind = kindForSection((await params).section);
  if (!kind) notFound();
  return <EntityForm key={kind} kind={kind} />;
}
