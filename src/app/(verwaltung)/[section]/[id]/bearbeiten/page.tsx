import { notFound } from "next/navigation";
import { entities, kindForSection } from "@/lib/domain";
import { EntityForm } from "@/components/entity-form";

type Props = { params: Promise<{ section: string; id: string }> };
export async function generateMetadata({ params }: Props) {
  const kind = kindForSection((await params).section);
  return {
    title: kind ? `${entities[kind].singular} bearbeiten` : "Nicht gefunden",
  };
}
export default async function Page({ params }: Props) {
  const { section, id } = await params;
  const kind = kindForSection(section);
  if (!kind) notFound();
  return <EntityForm key={`${kind}-${id}`} kind={kind} id={id} />;
}
