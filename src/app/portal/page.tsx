import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/access";
import { getPool } from "@/lib/server/db";
import { roleLabels } from "@/lib/account";
import { SignOutButton } from "@/components/auth-forms";
export const metadata = { title: "Mein Zugang" };
export const dynamic = "force-dynamic";
export default async function PortalPage() {
  const user = await requireUser();
  if (user.role === "admin") redirect("/dashboard");
  const properties =
    user.role === "owner"
      ? (
          await getPool().query(
            "SELECT id,name,street,postal_code,city,units FROM hausportal.properties WHERE owner_id=$1 ORDER BY name",
            [user.ownerId],
          )
        ).rows
      : (
          await getPool().query(
            "SELECT p.id,p.name,p.street,p.postal_code,p.city,t.apartment FROM hausportal.properties p JOIN hausportal.tenants t ON t.property_id=p.id WHERE t.id=$1",
            [user.tenantId],
          )
        ).rows;
  return (
    <div className="portal-shell">
      <header className="topbar">
        <span className="brand">Hausportal</span>
        <SignOutButton />
      </header>
      <main className="portal-content">
        <div className="page-heading">
          <h1>{user.role === "owner" ? "Meine Objekte" : "Meine Wohnung"}</h1>
        </div>
        <dl className="account-details">
          <dt>Name</dt>
          <dd>{user.name}</dd>
          <dt>E-Mail-Adresse</dt>
          <dd>{user.email}</dd>
          <dt>Rolle</dt>
          <dd>{roleLabels[user.role]}</dd>
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
                  <p>{property.units} Wohneinheiten</p>
                ) : (
                  <p>{property.apartment}</p>
                )}
              </article>
            ))
          ) : (
            <p>
              {user.role === "owner"
                ? "Keine Objekte zugeordnet."
                : "Keine Wohnung zugeordnet."}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
