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
  type Employee,
} from "@/lib/domain";
import { useData } from "./data-provider";
import { Icon } from "./icon";

export function EntityForm({ kind, id }: { kind: EntityKind; id?: string }) {
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
  return <LoadedForm kind={kind} record={record} />;
}

function LoadedForm({
  kind,
  record,
}: {
  kind: EntityKind;
  record?: Records[EntityKind];
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
  const [apartment, setApartment] = useState(
    kind === "tenants" && record ? (record as Tenant).apartment : "",
  );
  const property =
    kind === "properties" ? (record as Property | undefined) : undefined;
  const listHref = `/${config.section}`;
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
      const units = Number(text("units"));
      if (![text("street"), text("postalCode"), text("city")].every(Boolean))
        return setError("Bitte fülle die vollständige Adresse aus.");
      if (!/^\d{5}$/.test(text("postalCode")))
        return setError("Bitte gib eine fünfstellige Postleitzahl ein.");
      if (!Number.isSafeInteger(units) || units < 1)
        return setError(
          "Die Anzahl der Wohneinheiten muss eine positive ganze Zahl sein.",
        );
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
        units,
        ownerId,
      };
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
        entry = {
          id,
          name,
          email,
          phone: text("phone"),
          propertyId,
          apartment: propertyId ? apartment.trim() : "",
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
      router.push(`${listHref}?saved=${record ? "updated" : "created"}`),
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
                {kind === "properties" ? "Objektdaten" : "Persönliche Angaben"}
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
                  {kind === "properties" ? "Objektname" : "Vollständiger Name"}{" "}
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
                      : "Vor- und Nachname"
                  }
                  autoComplete={kind === "properties" ? "off" : "name"}
                />
              </label>
              {kind !== "properties" && (
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
                      Anzahl Wohneinheiten <span className="required">*</span>
                    </span>
                    <input
                      name="units"
                      type="number"
                      min={1}
                      max={100000}
                      step={1}
                      required
                      defaultValue={property?.units ?? 1}
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
                  <p>Die Zuordnung kannst du auch später ergänzen.</p>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>
                      Objekt <span className="optional">optional</span>
                    </span>
                    <select
                      name="propertyId"
                      value={propertyId}
                      onChange={(event) => {
                        setPropertyId(event.target.value);
                        setApartment("");
                      }}
                    >
                      <option value="">Später zuordnen</option>
                      {data.properties.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>
                      Wohnungsbezeichnung{" "}
                      <span className="optional">optional</span>
                    </span>
                    <input
                      name="apartment"
                      value={apartment}
                      disabled={!propertyId}
                      onChange={(event) => setApartment(event.target.value)}
                      maxLength={100}
                      placeholder="z. B. 1. OG links"
                    />
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
