import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/access";
import { listOwnerProperties } from "@/lib/server/owner-properties";
import { damageLanguage } from "@/lib/server/damage-language";
import { OwnerPropertyList } from "@/components/owner-property-list";
import { DamageRefresh } from "@/components/damage-forms";
export const metadata = { title: "Gebäude" };
export default async function OwnerBuildingsPage() {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/portal");
  const language = await damageLanguage();
  return (
    <>
      <DamageRefresh />
      <div className="page-heading">
        <h1>{language === "de" ? "Gebäude" : "Buildings"}</h1>
      </div>
      <OwnerPropertyList
        properties={await listOwnerProperties(user)}
        language={language}
      />
    </>
  );
}
