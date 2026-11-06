import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/server/access";
import { loadOwnerProperty } from "@/lib/server/owner-properties";
import { listDamages } from "@/lib/server/damages";
import { damageLanguage } from "@/lib/server/damage-language";
import { damageText, parseBuildingDamageFilter } from "@/lib/damage";
import { DamageList } from "@/components/damage-view";
import { DamageRefresh } from "@/components/damage-forms";
export const metadata = { title: "Gebäude" };
export default async function OwnerBuildingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/portal");
  const property = await loadOwnerProperty((await params).id, user);
  if (!property) notFound();
  const language = await damageLanguage();
  const t = damageText[language];
  const filter = parseBuildingDamageFilter((await searchParams).filter);
  const reports = await listDamages(user, property.id);
  const groups = {
    all: reports,
    open: reports.filter((report) => report.status === "in_progress"),
    invoice: reports.filter((report) => !!report.invoiceNumber),
  };
  const labels =
    language === "de"
      ? { all: "Alle", open: "Noch offen", invoice: "Rechnung" }
      : { all: "All", open: "Still open", invoice: "Invoice" };
  const href = `/portal/gebaeude/${encodeURIComponent(property.id)}`;
  return (
    <>
      <DamageRefresh />
      <Link className="back-link" href="/portal/gebaeude">
        {language === "de" ? "Zu den Gebäuden" : "Back to buildings"}
      </Link>
      <div className="page-heading">
        <h1>{property.name}</h1>
      </div>
      <p className="owner-building-address">
        {property.street}
        <br />
        {property.postalCode} {property.city}
      </p>
      <section className="section" aria-label={t.reports}>
        <div className="section-heading">
          <h2>{t.reports}</h2>
        </div>
        <nav
          className="owner-damage-filters"
          aria-label={
            language === "de" ? "Schadensmeldungen filtern" : "Filter reports"
          }
        >
          {(["all", "open", "invoice"] as const).map((key) => (
            <Link
              key={key}
              href={key === "all" ? href : `${href}?filter=${key}`}
              aria-current={filter === key ? "page" : undefined}
            >
              {labels[key]} <span>{groups[key].length}</span>
            </Link>
          ))}
        </nav>
        <DamageList
          reports={groups[filter]}
          language={language}
          owner
          buildingContext={{ id: property.id, filter }}
        />
      </section>
    </>
  );
}
