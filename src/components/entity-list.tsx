"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  entities,
  removeRecord,
  withoutAssignment,
  type EntityKind,
  type Owner,
  type Tenant,
  type Unit,
  type Property,
  type Employee,
  type Records,
} from "@/lib/domain";
import { useData } from "./data-provider";
import { Icon } from "./icon";
const accountLabels: Record<string, string> = {
  active: "Aktiv",
  pending: "Eingeladen",
  failed: "Versand fehlgeschlagen",
  expired: "Einladung abgelaufen",
};

export function EntityList({ kind }: { kind: EntityKind }) {
  const { data, ready, save, accounts, invite } = useData();
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<
    Records[EntityKind] | null
  >(null);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const config = entities[kind];
  const canFilterUnassigned = kind !== "employees" && kind !== "units";
  const unassigned =
    canFilterUnassigned && searchParams.get("filter") === "unassigned";
  const building = kind === "units" ? (searchParams.get("gebaeude") ?? "") : "";
  const buildingQuery = building
    ? `?gebaeude=${encodeURIComponent(building)}`
    : "";
  const listHref = `/${config.section}`;
  const createHref = `${listHref}/neu${buildingQuery}`;
  const scopedRecords =
    kind === "units" && building
      ? data.units.filter((unit) => unit.propertyId === building)
      : data[kind];

  useEffect(() => {
    if (pendingDelete) dialog.current?.showModal();
    else dialog.current?.close();
  }, [pendingDelete]);
  useEffect(() => {
    setQuery("");
    setNotice("");
  }, [kind]);

  const success = searchParams.get("saved");
  const normalize = (text: string) =>
    text
      .toLocaleLowerCase("de")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  function searchable(record: Records[EntityKind]) {
    let extra = "";
    if (kind === "owners")
      extra = data.properties
        .filter((property) => property.ownerId === record.id)
        .map((property) => property.name)
        .join(" ");
    if (kind === "tenants" || kind === "units") {
      const property = data.properties.find(
        (property) => property.id === (record as Tenant | Unit).propertyId,
      );
      const unit =
        kind === "tenants"
          ? data.units.find((unit) => unit.id === (record as Tenant).unitId)
          : undefined;
      extra = `${property?.name ?? ""} ${property?.street ?? ""} ${unit?.name ?? ""}`;
    }
    if (kind === "properties")
      extra =
        data.owners.find((owner) => owner.id === (record as Property).ownerId)
          ?.name ?? "";
    return normalize(`${Object.values(record).join(" ")} ${extra}`);
  }
  const rows = scopedRecords.filter(
    (record) =>
      (!unassigned || withoutAssignment(kind, record, data)) &&
      searchable(record).includes(normalize(query.trim())),
  );

  function closeDialog() {
    setPendingDelete(null);
    setDeleteError("");
  }
  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    if (await save(removeRecord(data, kind, pendingDelete.id))) {
      setNotice(`${config.singular} wurde gelöscht.`);
      router.replace(
        `${listHref}${unassigned ? "?filter=unassigned" : buildingQuery}`,
        { scroll: false },
      );
      closeDialog();
    } else
      setDeleteError("Löschen fehlgeschlagen. Bitte prüfe die Fehlermeldung.");
    setDeleting(false);
  }

  function cells(record: Records[EntityKind]) {
    if (kind === "owners") {
      const owner = record as Owner;
      const properties = data.properties.filter(
        (property) => property.ownerId === owner.id,
      );
      return (
        <>
          <td>
            <span className="cell-primary">{owner.email}</span>
            <span className="cell-secondary">
              {owner.phone || "Keine Telefonnummer"}
            </span>
          </td>
          <td>
            {properties.length ? (
              <span className="property-names">
                {properties.map((property) => property.name).join(", ")}
              </span>
            ) : (
              <span className="badge warning">Ohne Objekt</span>
            )}
          </td>
        </>
      );
    }
    if (kind === "tenants") {
      const tenant = record as Tenant;
      const unit = data.units.find((unit) => unit.id === tenant.unitId);
      const property = data.properties.find(
        (property) => property.id === tenant.propertyId,
      );
      return (
        <>
          <td>
            <span className="cell-primary">{tenant.email}</span>
            <span className="cell-secondary">
              {tenant.phone || "Keine Telefonnummer"}
            </span>
          </td>
          <td>
            {property ? (
              <>
                <span className="cell-primary">{property.name}</span>
                <span className="cell-secondary">
                  {unit?.name ?? "Wohnung noch offen"}
                </span>
              </>
            ) : (
              <span className="badge warning">Ohne Wohnung</span>
            )}
          </td>
        </>
      );
    }
    if (kind === "properties") {
      const property = record as Property;
      const owner = data.owners.find((owner) => owner.id === property.ownerId);
      return (
        <>
          <td>
            <span className="cell-primary">{property.street}</span>
            <span className="cell-secondary">
              {property.postalCode} {property.city}
            </span>
          </td>
          <td>
            {owner ? (
              owner.name
            ) : (
              <span className="badge warning">Ohne Eigentümer</span>
            )}
          </td>
          <td>
            <Link
              className="edit-link"
              href={`/einheiten?gebaeude=${encodeURIComponent(property.id)}`}
              aria-label={`Einheiten für ${property.name} verwalten`}
            >
              {
                data.units.filter((unit) => unit.propertyId === property.id)
                  .length
              }{" "}
              Einheiten
            </Link>
          </td>
        </>
      );
    }
    if (kind === "units") {
      const property = data.properties.find(
        (item) => item.id === (record as Unit).propertyId,
      );
      const tenants = data.tenants.filter(
        (tenant) => tenant.unitId === record.id,
      );
      return (
        <>
          <td>
            <span className="cell-primary">{property?.name}</span>
            <span className="cell-secondary">{property?.street}</span>
          </td>
          <td>
            {tenants.map((tenant) => tenant.name).join(", ") ||
              "Ohne Mieterzuordnung"}
          </td>
        </>
      );
    }
    return (
      <>
        <td>{(record as Employee).email}</td>
        <td>
          <span className="badge neutral">{(record as Employee).role}</span>
        </td>
      </>
    );
  }

  if (!ready)
    return (
      <div className="loading" role="status">
        Daten werden geladen …
      </div>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {config.plural} verwalten
            <span className="heading-count">{scopedRecords.length}</span>
          </h1>
        </div>
        <Link className="button primary" href={createHref}>
          <Icon name="plus" size={18} />
          {config.singular} anlegen
        </Link>
      </div>
      {(notice || success === "created" || success === "updated") && (
        <div className="success-notice" role="status">
          <Icon name="check" size={19} />
          {notice ||
            `${config.singular} wurde ${success === "created" ? "angelegt" : "gespeichert"}.`}
        </div>
      )}
      <section className="table-panel" aria-label={`${config.plural}übersicht`}>
        <div className="table-toolbar">
          {kind === "units" ? (
            <label className="field">
              <span>Gebäude</span>
              <select
                value={building}
                onChange={(event) => {
                  const selected = event.target.value;
                  router.push(
                    selected
                      ? `${listHref}?gebaeude=${encodeURIComponent(selected)}`
                      : listHref,
                  );
                }}
              >
                <option value="">Alle Gebäude</option>
                {building &&
                  !data.properties.some(
                    (property) => property.id === building,
                  ) && <option value={building}>Gebäude nicht gefunden</option>}
                {data.properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name} – {property.street}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="list-tabs">
              <Link
                href={`/${config.section}`}
                className={!unassigned ? "selected" : ""}
              >
                Alle {config.plural}
                <span>{data[kind].length}</span>
              </Link>
              {canFilterUnassigned && (
                <Link
                  href={`/${config.section}?filter=unassigned`}
                  className={unassigned ? "selected" : ""}
                >
                  Ohne Zuordnung
                  <span>
                    {
                      data[kind].filter((record) =>
                        withoutAssignment(kind, record, data),
                      ).length
                    }
                  </span>
                </Link>
              )}
            </div>
          )}
          <label className="search-field">
            <Icon name="search" size={18} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`${config.plural} suchen …`}
              aria-label={`${config.plural} suchen`}
            />
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  {kind === "properties"
                    ? "Objekt"
                    : kind === "units"
                      ? "Bezeichnung"
                      : "Name"}
                </th>
                <th>
                  {kind === "properties"
                    ? "Adresse"
                    : kind === "units"
                      ? "Gebäude"
                      : kind === "employees"
                        ? "E-Mail-Adresse"
                        : "Kontakt"}
                </th>
                <th>
                  {kind === "properties"
                    ? "Eigentümer"
                    : kind === "units"
                      ? "Mieter"
                      : kind === "employees"
                        ? "Rolle"
                        : "Objekt / Zuordnung"}
                </th>
                {kind === "properties" && <th>Einheiten</th>}
                {(kind === "owners" || kind === "tenants") && <th>Zugang</th>}
                <th className="actions-heading">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((record) => (
                <tr key={record.id}>
                  <td>
                    <div className="name-cell">
                      <span
                        className={`table-avatar ${kind === "properties" ? "square" : ""}`}
                      >
                        {kind === "properties" ? (
                          <Icon name="properties" size={20} />
                        ) : (
                          record.name
                            .split(/\s+/)
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join("")
                        )}
                      </span>
                      <span className="record-name">{record.name}</span>
                    </div>
                  </td>
                  {cells(record)}
                  {(kind === "owners" || kind === "tenants") && (
                    <td>
                      <span className="badge neutral">
                        {accountLabels[
                          accounts.find(
                            (account) =>
                              account.contactId === record.id &&
                              account.role ===
                                (kind === "owners" ? "owner" : "tenant"),
                          )?.status ?? ""
                        ] ?? "Nicht eingeladen"}
                      </span>
                    </td>
                  )}
                  <td>
                    <div className="row-actions">
                      {(kind === "owners" || kind === "tenants") &&
                        !accounts.some(
                          (account) =>
                            account.contactId === record.id &&
                            account.role ===
                              (kind === "owners" ? "owner" : "tenant") &&
                            account.status === "active",
                        ) && (
                          <button
                            className="edit-link"
                            disabled={sendingInvite !== null}
                            aria-label={`${record.name} einladen`}
                            onClick={async () => {
                              setSendingInvite(record.id);
                              try {
                                if (await invite(kind, record.id))
                                  setNotice("Einladung versendet.");
                              } finally {
                                setSendingInvite(null);
                              }
                            }}
                          >
                            {sendingInvite === record.id
                              ? "Wird gesendet …"
                              : accounts.some(
                                    (account) =>
                                      account.contactId === record.id &&
                                      account.role ===
                                        (kind === "owners"
                                          ? "owner"
                                          : "tenant"),
                                  )
                                ? "Erneut senden"
                                : "Einladen"}
                          </button>
                        )}
                      <Link
                        className="edit-link"
                        href={`/${config.section}/${record.id}/bearbeiten${buildingQuery}`}
                        aria-label={`${record.name} bearbeiten`}
                      >
                        <Icon name="edit" size={15} />
                        <span>Bearbeiten</span>
                      </Link>
                      <button
                        className="icon-button delete-button"
                        onClick={() => setPendingDelete(record)}
                        aria-label={`${record.name} löschen`}
                        title="Löschen"
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name={kind} size={28} />
            </span>
            <h2>
              {query
                ? "Keine Treffer"
                : unassigned
                  ? "Alles zugeordnet"
                  : `Noch keine ${config.plural}`}
            </h2>
            <p>
              {query
                ? "Versuche es mit einem anderen Suchbegriff."
                : unassigned
                  ? "Hier gibt es aktuell keine offenen Zuordnungen."
                  : ""}
            </p>
            {query ? (
              <button className="button" onClick={() => setQuery("")}>
                Suche zurücksetzen
              </button>
            ) : (
              <Link
                className="button"
                href={unassigned ? listHref : createHref}
              >
                {unassigned ? "Alle anzeigen" : `${config.singular} anlegen`}
              </Link>
            )}
          </div>
        )}
        <div className="table-footer">
          <span>
            {rows.length} von {scopedRecords.length} {config.plural}
            {rows.length === 1 && kind === "properties" ? "n" : ""}
          </span>
        </div>
      </section>
      <dialog
        ref={dialog}
        className="confirm-dialog"
        onCancel={closeDialog}
        onClose={closeDialog}
        aria-labelledby="delete-title"
        aria-describedby="delete-description"
      >
        <div className="dialog-content">
          <span className="delete-symbol">
            <Icon name="trash" size={25} />
          </span>
          <h2 id="delete-title">{config.singular} löschen?</h2>
          <p id="delete-description">
            „{pendingDelete?.name}“ wird aus der Verwaltung entfernt.
            {kind === "owners" &&
              " Die zugehörigen Objekte bleiben erhalten und verlieren ihre Eigentümerzuordnung."}
            {kind === "properties" &&
              " Die Einheiten des Gebäudes werden ebenfalls gelöscht. Die Mieter bleiben erhalten und verlieren ihre Gebäude- und Wohnungszuordnung."}
            {kind === "units" &&
              " Zugeordnete Mieter bleiben erhalten und verlieren ihre Wohnungszuordnung."}
          </p>
          {deleteError && (
            <p role="alert" className="form-error">
              {deleteError}
            </p>
          )}
          <div className="dialog-actions">
            <button className="button" autoFocus onClick={closeDialog}>
              Abbrechen
            </button>
            <button
              className="button danger"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? "Wird gelöscht …" : "Endgültig löschen"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
