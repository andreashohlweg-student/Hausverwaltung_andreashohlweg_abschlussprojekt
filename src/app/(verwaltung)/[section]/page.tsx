import { Suspense } from "react";
import { notFound } from "next/navigation";
import { entities, kindForSection } from "@/lib/domain";
import { EntityList } from "@/components/entity-list";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const kind = kindForSection((await params).section);
  return { title: kind ? entities[kind].plural : "Nicht gefunden" };
}
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const kind = kindForSection((await params).section);
  if (!kind) notFound();
  return (
    <Suspense fallback={<div className="loading">Ansicht wird geladen …</div>}>
      <EntityList kind={kind} />
    </Suspense>
  );
}
