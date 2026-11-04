import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/access";
import { tenantLocation } from "@/lib/server/damages";
import { damageLanguage } from "@/lib/server/damage-language";
import { damageText } from "@/lib/damage";
import { NewDamageForm } from "@/components/damage-forms";
export const metadata = { title: "Schaden melden" };
export default async function NewDamagePage() {
  const user = await requireUser();
  if (user.role !== "tenant") redirect("/portal");
  const language = await damageLanguage();
  const t = damageText[language];
  const location = await tenantLocation(user);
  return (
    <div className="damage-new">
      <Link className="back-link" href="/portal">
        {t.back}
      </Link>
      <div className="page-heading">
        <h1>{t.report}</h1>
      </div>
      {location ? (
        <section className="damage-panel">
          <p className="damage-location">{location.location}</p>
          <NewDamageForm language={language} />
        </section>
      ) : (
        <p className="alert" role="alert">
          {t.missing}
        </p>
      )}
    </div>
  );
}
