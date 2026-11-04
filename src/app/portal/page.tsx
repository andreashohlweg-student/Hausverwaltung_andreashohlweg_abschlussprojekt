import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/access";
import { getPool } from "@/lib/server/db";
import { roleLabels } from "@/lib/account";
import Link from "next/link";
import { listDamages } from "@/lib/server/damages";
import { damageLanguage } from "@/lib/server/damage-language";
import { damageText } from "@/lib/damage";
import { DamageList } from "@/components/damage-view";
import { DamageRefresh } from "@/components/damage-forms";
export const metadata = { title: "Mein Zugang" };
export const dynamic = "force-dynamic";
export default async function PortalPage() {
  const user = await requireUser();
  if (user.role === "admin") redirect("/dashboard");
  const language = await damageLanguage();
  const t = damageText[language];
  const reports = await listDamages(user);
  const properties =
    user.role === "owner"
      ? (
          await getPool().query(
            `SELECT p.id,p.name,p.street,p.postal_code,p.city,
              ARRAY(SELECT u.name FROM hausportal.units u WHERE u.property_id=p.id ORDER BY u.name,u.id) AS units
            FROM hausportal.properties p WHERE p.owner_id=$1 ORDER BY p.name`,
            [user.ownerId],
          )
        ).rows
      : (
          await getPool().query(
            `SELECT p.id,p.name,p.street,p.postal_code,p.city,u.name AS unit_name
            FROM hausportal.tenants t
            LEFT JOIN hausportal.units u ON t.unit_id=u.id
            JOIN hausportal.properties p ON p.id=coalesce(u.property_id,t.property_id)
            WHERE t.id=$1`,
            [user.tenantId],
          )
        ).rows;
  return (
    <>
      <DamageRefresh />
      <div className="page-heading">
        <h1>
          {user.role === "owner"
            ? language === "de"
              ? "Meine Objekte"
              : "My buildings"
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
        {properties.length ? (
          properties.map((property) => (
            <article className="portal-property" key={property.id}>
              <h2>{property.name}</h2>
              <p>
                {property.street}
                <br />
                {property.postal_code} {property.city}
              </p>
              {user.role === "owner" ? (
                property.units.length ? (
                  <ul>
                    {property.units.map((name: string) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    {language === "de"
                      ? "Keine Einheiten erfasst."
                      : "No apartments recorded."}
                  </p>
                )
              ) : (
                <p>
                  {property.unit_name ??
                    (language === "de"
                      ? "Keine Wohnung zugeordnet."
                      : "No apartment assigned.")}
                </p>
              )}
            </article>
          ))
        ) : (
          <p>
            {user.role === "owner"
              ? language === "de"
                ? "Keine Objekte zugeordnet."
                : "No buildings assigned."
              : language === "de"
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
