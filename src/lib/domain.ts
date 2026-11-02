export type EntityKind = "owners" | "tenants" | "properties" | "employees";
export type Section = "eigentuemer" | "mieter" | "objekte" | "mitarbeiter";

interface BaseRecord {
  id: string;
  name: string;
}
export interface Owner extends BaseRecord {
  email: string;
  phone: string;
}
export interface Tenant extends BaseRecord {
  email: string;
  phone: string;
  propertyId: string;
  apartment: string;
}
export interface Property extends BaseRecord {
  street: string;
  postalCode: string;
  city: string;
  units: number;
  ownerId: string;
}
export interface Employee extends BaseRecord {
  email: string;
  role: "Verwaltung" | "Buchhaltung" | "Technik" | "Administrator";
}
export interface Records {
  owners: Owner;
  tenants: Tenant;
  properties: Property;
  employees: Employee;
}
export interface Database {
  version: 1;
  owners: Owner[];
  tenants: Tenant[];
  properties: Property[];
  employees: Employee[];
}

export const entities = {
  owners: {
    section: "eigentuemer",
    singular: "Eigentümer",
    plural: "Eigentümer",
    description: "Kontaktdaten und zugeordnete Objekte im Überblick.",
  },
  tenants: {
    section: "mieter",
    singular: "Mieter",
    plural: "Mieter",
    description: "Alle Mieterkontakte und ihre Zuordnung zu einem Objekt.",
  },
  properties: {
    section: "objekte",
    singular: "Objekt",
    plural: "Objekte",
    description: "Deine verwalteten Immobilien an einem Ort.",
  },
  employees: {
    section: "mitarbeiter",
    singular: "Mitarbeiter",
    plural: "Mitarbeiter",
    description: "Das Team deiner Hausverwaltung verwalten.",
  },
} as const;

export function kindForSection(section: string): EntityKind | undefined {
  return (Object.keys(entities) as EntityKind[]).find(
    (kind) => entities[kind].section === section,
  );
}

export function withoutAssignment(
  kind: EntityKind,
  record: Records[EntityKind],
  data: Database,
): boolean {
  if (kind === "owners")
    return !data.properties.some((property) => property.ownerId === record.id);
  if (kind === "tenants")
    return (
      !(record as Tenant).propertyId || !(record as Tenant).apartment.trim()
    );
  if (kind === "properties") return !(record as Property).ownerId;
  return false;
}

/** Keep related records when a record is removed, clearing only its references. */
export function removeRecord(
  data: Database,
  kind: EntityKind,
  id: string,
): Database {
  const next = {
    ...data,
    [kind]: data[kind].filter((record) => record.id !== id),
  };
  if (kind === "owners")
    next.properties = data.properties.map((property) =>
      property.ownerId === id ? { ...property, ownerId: "" } : property,
    );
  if (kind === "properties")
    next.tenants = data.tenants.map((tenant) =>
      tenant.propertyId === id
        ? { ...tenant, propertyId: "", apartment: "" }
        : tenant,
    );
  return next;
}

/** Validate persisted data before rendering it. Unknown versions are never overwritten. */
export function isDatabase(value: unknown): value is Database {
  if (!value || typeof value !== "object") return false;
  const db = value as Record<string, unknown>;
  if (db.version !== 1) return false;
  const stringFields: Record<EntityKind, string[]> = {
    owners: ["id", "name", "email", "phone"],
    tenants: ["id", "name", "email", "phone", "propertyId", "apartment"],
    properties: ["id", "name", "street", "postalCode", "city", "ownerId"],
    employees: ["id", "name", "email", "role"],
  };
  for (const kind of Object.keys(entities) as EntityKind[]) {
    const rows = db[kind];
    if (!Array.isArray(rows)) return false;
    if (
      !rows.every(
        (row) =>
          row &&
          typeof row === "object" &&
          stringFields[kind].every((field) => typeof row[field] === "string") &&
          row.id.trim() &&
          row.name.trim(),
      )
    )
      return false;
    if (new Set(rows.map((row) => row.id)).size !== rows.length) return false;
  }
  const checked = value as Database;
  return (
    checked.properties.every(
      (property) =>
        Number.isSafeInteger(property.units) &&
        property.units > 0 &&
        (!property.ownerId ||
          checked.owners.some((owner) => owner.id === property.ownerId)),
    ) &&
    checked.tenants.every(
      (tenant) =>
        !tenant.propertyId ||
        checked.properties.some(
          (property) => property.id === tenant.propertyId,
        ),
    ) &&
    checked.employees.every((employee) =>
      ["Verwaltung", "Buchhaltung", "Technik", "Administrator"].includes(
        employee.role,
      ),
    )
  );
}
