"use client";
import { useState } from "react";
import type { OwnerProperty } from "@/lib/server/owner-properties";
import type { DamageLanguage } from "@/lib/damage";
import { OwnerPropertyCard } from "./owner-property-card";
export function OwnerPropertyList({
  properties,
  language,
}: {
  properties: OwnerProperty[];
  language: DamageLanguage;
}) {
  const [query, setQuery] = useState("");
  const normalize = (value: string) =>
    value
      .toLocaleLowerCase("de")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ß/g, "ss");
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const matches = properties.filter((property) => {
    const text = normalize(
      `${property.name} ${property.street} ${property.postalCode} ${property.city}`,
    );
    return words.every((word) => text.includes(word));
  });
  return (
    <>
      <label className="field owner-property-search">
        <span>{language === "de" ? "Gebäude suchen" : "Search buildings"}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            language === "de"
              ? "Name, Straße, Ort oder Postleitzahl"
              : "Name, street, city or postal code"
          }
        />
      </label>
      <p className="owner-property-count" role="status">
        {language === "de"
          ? `${matches.length} von ${properties.length} Gebäuden`
          : `${matches.length} of ${properties.length} buildings`}
      </p>
      <div className="portal-properties">
        {matches.map((property) => (
          <OwnerPropertyCard
            key={property.id}
            property={property}
            language={language}
          />
        ))}
      </div>
      {matches.length === 0 && (
        <p className="damage-empty">
          {query.trim()
            ? language === "de"
              ? "Keine passenden Gebäude gefunden."
              : "No matching buildings found."
            : language === "de"
              ? "Keine Gebäude zugeordnet."
              : "No buildings assigned."}
        </p>
      )}
    </>
  );
}
