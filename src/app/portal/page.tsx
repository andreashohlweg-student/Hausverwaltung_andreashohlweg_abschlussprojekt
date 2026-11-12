import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/access";
import { roleLabels } from "@/lib/account";
import Link from "next/link";
import { listDamages } from "@/lib/server/damages";
import { damageLanguage } from "@/lib/server/damage-language";
import { damageText } from "@/lib/damage";
import { DamageList } from "@/components/damage-view";
import {
  listOwnerProperties,
  loadTenantHome,
} from "@/lib/server/owner-properties";
import { OwnerPropertyCard } from "@/components/owner-property-card";
import { DamageRefresh } from "@/components/damage-forms";
export const metadata = { title: "Mein Zugang" };
export const dynamic = "force-dynamic";
export default async function PortalPage() {
  const user = await requireUser();
  if (user.role === "admin") redirect("/dashboard");
  const language = await damageLanguage();
  const t = damageText[language];
  const reports = await listDamages(user);
  const ownerProperties =
    user.role === "owner" ? await listOwnerProperties(user) : [];
  const home = await loadTenantHome(user);
  const properties = home ? [home] : [];
  return (
    <>
      <DamageRefresh />
      <div className="page-heading">
        <h1>
          {user.role === "owner"
            ? "Dashboard"
            : language === "de"
              ? "Meine Wohnung"
              : "My apartment"}
        </h1>
        {user.role === "tenant" && (
          <Link
            className="button primary damage-report-button"
            href="/portal/schaeden/neu"
          >
            {t.report}
          </Link>
        )}
      </div>
      <dl className="account-details">
        <dt>Name</dt>
        <dd>{user.name}</dd>
        <dt>{language === "de" ? "E-Mail-Adresse" : "Email"}</dt>
        <dd>{user.email}</dd>
        <dt>{language === "de" ? "Rolle" : "Role"}</dt>
        <dd>
          {language === "de"
            ? roleLabels[user.role]
            : user.role === "owner"
              ? "Owner"
              : "Tenant"}
        </dd>
      </dl>
      <div className="portal-properties">
        {user.role === "owner" ? (
          ownerProperties.length ? (
            ownerProperties.map((property) => (
              <OwnerPropertyCard
                key={property.id}
                property={property}
                language={language}
              />
            ))
          ) : (
            <p>
              {language === "de"
                ? "Keine Objekte zugeordnet."
                : "No buildings assigned."}
            </p>
          )
        ) : properties.length ? (
          properties.map((property) => (
            <article className="portal-property" key={property.propertyId}>
              <h2>{property.name}</h2>
              <p>
                {property.street}
                <br />
                {property.postalCode} {property.city}
              </p>
              <p>
                {property.unitName ??
                  (language === "de"
                    ? "Keine Wohnung zugeordnet."
                    : "No apartment assigned.")}
              </p>
            </article>
          ))
        ) : (
          <p>
            {language === "de"
              ? "Keine Wohnung zugeordnet."
              : "No apartment assigned."}
          </p>
        )}
      </div>
      <section className="section" aria-label={t.reports}>
        <div className="section-heading">
          <h2>{t.reports}</h2>
        </div>
        <DamageList reports={reports} language={language} />
      </section>
    </>
  );
}
