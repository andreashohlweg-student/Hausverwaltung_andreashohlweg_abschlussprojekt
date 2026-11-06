import Link from "next/link";
import type { OwnerProperty } from "@/lib/server/owner-properties";
import type { DamageLanguage } from "@/lib/damage";
export function OwnerPropertyCard({
  property,
  language,
}: {
  property: OwnerProperty;
  language: DamageLanguage;
}) {
  return (
    <Link
      className="portal-property owner-property-link"
      href={`/portal/gebaeude/${encodeURIComponent(property.id)}`}
    >
      <h2>{property.name}</h2>
      <p>
        {property.street}
        <br />
        {property.postalCode} {property.city}
      </p>
      {property.units.length ? (
        <ul>
          {property.units.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      ) : (
        <p>
          {language === "de"
            ? "Keine Einheiten erfasst."
            : "No apartments recorded."}
        </p>
      )}
    </Link>
  );
}
