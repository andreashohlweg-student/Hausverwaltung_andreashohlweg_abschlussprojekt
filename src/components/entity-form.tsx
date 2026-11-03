"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import {
  entities,
  withoutAssignment,
  type EntityKind,
  type Records,
  type Property,
  type Tenant,
  type Unit,
  type Employee,
} from "@/lib/domain";
import { useData } from "./data-provider";
import { Icon } from "./icon";

export function EntityForm({
  kind,
  id,
  building,
}: {
  kind: EntityKind;
  id?: string;
  building?: string;
}) {
  const { data, ready } = useData();
  if (!ready)
    return (
      <div className="loading" role="status">
        Formular wird geladen …
      </div>
    );
  const record = id ? data[kind].find((item) => item.id === id) : undefined;
  if (id && !record)
    return (
      <div className="empty-state">
        <h1>Eintrag nicht gefunden</h1>
        <p>Dieser Eintrag ist nicht mehr vorhanden.</p>
        <Link className="button" href={`/${entities[kind].section}`}>
          Zur Liste
        </Link>
      </div>
    );
  return <LoadedForm kind={kind} record={record} building={building} />;
}

function LoadedForm({
  kind,
  record,
  building,
}: {
  kind: EntityKind;
  record?: Records[EntityKind];
  building?: string;
}) {
  const { data, save, invite } = useData();
  const config = entities[kind];
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const submitted = useRef(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [propertyId, setPropertyId] = useState(
    kind === "tenants" && record ? (record as Tenant).propertyId : "",
  );
  const [unitId, setUnitId] = useState(
    kind === "tenants" && record ? (record as Tenant).unitId : "",
  );
  const unitOptions = data.units
    .filter((unit) => unit.propertyId === propertyId)
    .sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
  const unit = kind === "units" ? (record as Unit | undefined) : undefined;
  const unitAssigned =
    !!unit && data.tenants.some((tenant) => tenant.unitId === unit.id);
  const buildingFilter =
    kind === "units" && data.properties.some((item) => item.id === building)
      ? building
      : undefined;
  const property =
    kind === "properties" ? (record as Property | undefined) : undefined;
  const listHref = `/${config.section}${buildingFilter ? `?gebaeude=${encodeURIComponent(buildingFilter)}` : ""}`;
  const hasContact = kind !== "properties" && kind !== "units";
  const title = `${config.singular} ${record ? "bearbeiten" : "anlegen"}`;
  const ownerOptions =
    kind === "properties"
      ? data.owners
          .map((owner) => ({
            ...owner,
            isOpen: withoutAssignment("owners", owner, data),
          }))
          .sort(
            (a, b) =>
              Number(b.isOpen) - Number(a.isOpen) ||
              a.name.localeCompare(b.name, "de", { sensitivity: "base" }),
          )
      : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitted.current) return;
    setError("");
    const formData = new FormData(event.currentTarget);
    const text = (key: string) => String(formData.get(key) ?? "").trim();
    const name = text("name");
    if (!name)
      return setError(
        "Bitte gib einen Namen ein. Leerzeichen allein reichen nicht aus.",
      );
    if (record && !data[kind].some((item) => item.id === record.id))
      return setError(
        "Dieser Eintrag wurde inzwischen gelöscht. Bitte kehre zur Liste zurück.",
      );
    const id = record?.id ?? crypto.randomUUID();
    let entry: Records[EntityKind];
    if (kind === "properties") {
      if (![text("street"), text("postalCode"), text("city")].every(Boolean))
        return setError("Bitte fülle die vollständige Adresse aus.");
      if (!/^\d{5}$/.test(text("postalCode")))
        return setError("Bitte gib eine fünfstellige Postleitzahl ein.");
      const ownerId = text("ownerId");
      if (ownerId && !data.owners.some((owner) => owner.id === ownerId))
        return setError(
          "Dieser Eigentümer existiert nicht mehr. Bitte wähle erneut.",
        );
      entry = {
        id,
        name,
        street: text("street"),
        postalCode: text("postalCode"),
        city: text("city"),
        ownerId,
      };
    } else if (kind === "units") {
      const buildingId = unitAssigned ? unit.propertyId : text("propertyId");
      if (!data.properties.some((property) => property.id === buildingId))
        return setError("Bitte wähle ein Gebäude aus.");
      if (
        data.units.some(
          (item) =>
            item.id !== id &&
            item.propertyId === buildingId &&
            item.name.toLowerCase() === name.toLowerCase(),
        )
      )
        return setError("Diese Bezeichnung gibt es in dem Gebäude bereits.");
      entry = { id, name, propertyId: buildingId };
    } else {
      const email = text("email").toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return setError("Bitte gib eine gültige E-Mail-Adresse ein.");
      if (
        data[kind].some(
          (item) =>
            item.id !== record?.id &&
            "email" in item &&
            item.email.toLowerCase() === email,
        )
      )
        return setError(
          "Diese E-Mail-Adresse ist in dieser Liste bereits vorhanden.",
        );
      if (kind === "employees")
        entry = { id, name, email, role: text("role") as Employee["role"] };
      else if (kind === "tenants") {
        if (
          propertyId &&
          !data.properties.some((property) => property.id === propertyId)
        )
          return setError(
            "Dieses Objekt existiert nicht mehr. Bitte wähle erneut.",
          );
        if (unitId && !unitOptions.some((unit) => unit.id === unitId))
          return setError("Diese Einheit ist in dem Gebäude nicht verfügbar.");
        entry = {
          id,
          name,
          email,
          phone: text("phone"),
          propertyId,
          unitId,
        };
      } else entry = { id, name, email, phone: text("phone") };
    }
    const next = {
      ...data,
      [kind]: record
        ? data[kind].map((item) => (item.id === record.id ? entry : item))
        : [...data[kind], entry],
    };
    submitted.current = true;
    setSaving(true);
    if (!(await save(next))) {
      submitted.current = false;
      setSaving(false);
      return setError(
        "Der Eintrag konnte nicht gespeichert werden. Bitte prüfe die Fehlermeldung.",
      );
    }
    if (!record && (kind === "owners" || kind === "tenants"))
      await invite(kind, entry.id);
    startTransition(() =>
      router.push(
        `${listHref}${buildingFilter ? "&" : "?"}saved=${record ? "updated" : "created"}`,
      ),
    );
  }

  return (
    <>
      <Link className="back-link" href={listHref}>
        <Icon name="back" size={17} />
        Zur Liste
      </Link>
      <div className="page-heading form-page-heading">
        <div>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="form-layout">
        <form className="entity-form" onSubmit={submit}>
          <div className="form-card-heading">
            <span className="form-heading-icon">
              <Icon name={kind} size={21} />
            </span>
            <div>
              <h2>
                {kind === "properties"
                  ? "Objektdaten"
                  : kind === "units"
                    ? "Einheitsdaten"
                    : "Persönliche Angaben"}
              </h2>
              <p>Mit * markierte Felder sind Pflichtfelder.</p>
            </div>
          </div>
          <div className="form-body">
            {error && (
              <div className="alert" role="alert">
                <Icon name="info" />
                <span>{error}</span>
              </div>
            )}
            <div className="form-grid">
              <label
                className={kind === "properties" ? "field full-width" : "field"}
              >
                <span>
                  {kind === "properties"
                    ? "Objektname"
                    : kind === "units"
                      ? "Bezeichnung"
                      : "Vollständiger Name"}{" "}
                  <span className="required">*</span>
                </span>
                <input
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={record?.name}
                  placeholder={
                    kind === "properties"
                      ? "z. B. Haus am Park"
                      : kind === "units"
                        ? "z. B. 1. OG links"
                        : "Vor- und Nachname"
                  }
                  autoComplete={hasContact ? "name" : "off"}
                />
              </label>
              {kind === "units" && (
                <label className="field">
                  <span>
                    Gebäude <span className="required">*</span>
                  </span>
                  <select
                    name="propertyId"
                    required
                    disabled={unitAssigned}
                    defaultValue={unit?.propertyId ?? buildingFilter ?? ""}
                  >
                    <option value="">Gebäude auswählen</option>
                    {data.properties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name} – {property.street}
                      </option>
                    ))}
                  </select>
                  {unitAssigned && (
                    <small>
                      Entferne zuerst die Mieterzuordnung, um das Gebäude zu
                      ändern.
                    </small>
                  )}
                  {data.properties.length === 0 && (
                    <Link href="/objekte/neu">Objekt anlegen</Link>
                  )}
                </label>
              )}
              {hasContact && (
                <label className="field">
                  <span>
                    E-Mail-Adresse <span className="required">*</span>
                  </span>
                  <input
                    name="email"
                    type="email"
                    required
                    maxLength={254}
                    defaultValue={
                      record && "email" in record ? record.email : ""
                    }
                    placeholder="name@example.com"
                    autoComplete="email"
                  />
                </label>
              )}
              {(kind === "owners" || kind === "tenants") && (
                <label className="field">
                  <span>
                    Telefonnummer <span className="optional">optional</span>
                  </span>
                  <input
                    name="phone"
                    type="tel"
                    maxLength={40}
                    defaultValue={
                      record && "phone" in record ? record.phone : ""
                    }
                    placeholder="z. B. 030 1234567"
                    autoComplete="tel"
                  />
                </label>
              )}
              {kind === "employees" && (
                <label className="field">
                  <span>
                    Rolle <span className="required">*</span>
                  </span>
                  <select
                    name="role"
                    defaultValue={
                      (record as Employee | undefined)?.role ?? "Verwaltung"
                    }
                  >
                    {[
                      "Verwaltung",
                      "Buchhaltung",
                      "Technik",
                      "Administrator",
                    ].map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                </label>
              )}
              {kind === "properties" && (
                <>
                  <label className="field full-width">
                    <span>
                      Straße und Hausnummer <span className="required">*</span>
                    </span>
                    <input
                      name="street"
                      required
                      maxLength={160}
                      defaultValue={property?.street}
                      placeholder="z. B. Parkstraße 12"
                      autoComplete="street-address"
                    />
                  </label>
                  <label className="field">
                    <span>
                      Postleitzahl <span className="required">*</span>
                    </span>
                    <input
                      name="postalCode"
                      required
                      pattern="[0-9]{5}"
                      inputMode="numeric"
                      maxLength={5}
                      title="Fünfstellige Postleitzahl"
                      defaultValue={property?.postalCode}
                      placeholder="z. B. 10405"
                      autoComplete="postal-code"
                    />
                  </label>
                  <label className="field">
                    <span>
                      Ort <span className="required">*</span>
                    </span>
                    <input
                      name="city"
                      required
                      maxLength={100}
                      defaultValue={property?.city}
                      placeholder="z. B. Berlin"
                      autoComplete="address-level2"
                    />
                  </label>
                  <label className="field">
                    <span>
                      Eigentümer <span className="optional">optional</span>
                    </span>
                    <select
                      name="ownerId"
                      defaultValue={property?.ownerId ?? ""}
                    >
                      <option value="">Später zuordnen</option>
                      {ownerOptions.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.name}
                          {owner.isOpen ? " (offen)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            {kind === "tenants" && (
              <>
                <div className="form-divider">
                  <h3>Wohnung zuordnen</h3>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>
                      Gebäude <span className="optional">optional</span>
                    </span>
                    <select
                      name="propertyId"
                      value={propertyId}
                      onChange={(event) => {
                        setPropertyId(event.target.value);
                        setUnitId("");
                      }}
                    >
                      <option value="">Später zuordnen</option>
                      {data.properties.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.name} – {property.street}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>
                      Einheit <span className="optional">optional</span>
                    </span>
                    <select
                      name="unitId"
                      value={unitId}
                      disabled={unitOptions.length === 0}
                      onChange={(event) => setUnitId(event.target.value)}
                    >
                      <option value="">
                        {propertyId && unitOptions.length === 0
                          ? "Keine Einheiten vorhanden"
                          : "Später zuordnen"}
                      </option>
                      {unitOptions.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}
          </div>
          <div className="form-actions">
            <button
              className="button primary"
              type="submit"
              disabled={pending || saving}
            >
              <Icon name="check" size={18} />
              {pending || saving
                ? "Wird gespeichert …"
                : record
                  ? "Änderungen speichern"
                  : `${config.singular} anlegen`}
            </button>
            <Link className="button" href={listHref}>
              Abbrechen
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
