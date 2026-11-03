export type EntityKind =
  "owners" | "tenants" | "properties" | "units" | "employees";
export type Section =
  "eigentuemer" | "mieter" | "objekte" | "einheiten" | "mitarbeiter";

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
  unitId: string;
}
export interface Property extends BaseRecord {
  street: string;
  postalCode: string;
  city: string;
  ownerId: string;
}
export interface Unit extends BaseRecord {
  propertyId: string;
}
export interface Employee extends BaseRecord {
  email: string;
  role: "Verwaltung" | "Buchhaltung" | "Technik" | "Administrator";
}
export interface Records {
  owners: Owner;
  tenants: Tenant;
  properties: Property;
  units: Unit;
  employees: Employee;
}
export interface Database {
  version: 2;
  owners: Owner[];
  tenants: Tenant[];
  properties: Property[];
  units: Unit[];
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
  units: {
    section: "einheiten",
    singular: "Einheit",
    plural: "Einheiten",
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
  if (kind === "tenants") return !(record as Tenant).unitId;
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
  if (kind === "properties") {
    next.units = data.units.filter((unit) => unit.propertyId !== id);
    next.tenants = data.tenants.map((tenant) =>
      tenant.propertyId === id
        ? { ...tenant, propertyId: "", unitId: "" }
        : tenant,
    );
  }
  if (kind === "units")
    next.tenants = data.tenants.map((tenant) =>
      tenant.unitId === id ? { ...tenant, unitId: "" } : tenant,
    );
  return next;
}

/** Validate persisted data before rendering it. Unknown versions are never overwritten. */
export function isDatabase(value: unknown): value is Database {
  if (!value || typeof value !== "object") return false;
  const db = value as Record<string, unknown>;
  if (db.version !== 2) return false;
  const stringFields: Record<EntityKind, string[]> = {
    owners: ["id", "name", "email", "phone"],
    tenants: ["id", "name", "email", "phone", "propertyId", "unitId"],
    properties: ["id", "name", "street", "postalCode", "city", "ownerId"],
    units: ["id", "name", "propertyId"],
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
  const propertiesById = new Map(
    checked.properties.map((property) => [property.id, property]),
  );
  const unitsById = new Map(checked.units.map((unit) => [unit.id, unit]));
  const unitNames = new Set(
    checked.units.map((unit) =>
      JSON.stringify([unit.propertyId, unit.name.trim().toLowerCase()]),
    ),
  );
  return (
    unitNames.size === checked.units.length &&
    checked.units.every((unit) => propertiesById.has(unit.propertyId)) &&
    checked.properties.every(
      (property) =>
        !property.ownerId ||
        checked.owners.some((owner) => owner.id === property.ownerId),
    ) &&
    checked.tenants.every(
      (tenant) =>
        (!tenant.propertyId || propertiesById.has(tenant.propertyId)) &&
        (!tenant.unitId ||
          unitsById.get(tenant.unitId)?.propertyId === tenant.propertyId),
    ) &&
    checked.employees.every((employee) =>
      ["Verwaltung", "Buchhaltung", "Technik", "Administrator"].includes(
        employee.role,
      ),
    )
  );
}
