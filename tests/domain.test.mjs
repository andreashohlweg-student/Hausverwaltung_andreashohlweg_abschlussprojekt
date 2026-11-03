import test from "node:test";
import assert from "node:assert/strict";
import {
  isDatabase,
  removeRecord,
  withoutAssignment,
  kindForSection,
} from "../src/lib/domain.ts";

function fixture() {
  return {
    version: 2,
    owners: [
      { id: "o1", name: "Eigentümer", email: "owner@example.com", phone: "" },
    ],
    properties: [
      {
        id: "p1",
        name: "Haus",
        street: "Straße 1",
        postalCode: "10115",
        city: "Berlin",
        ownerId: "o1",
      },
    ],
    units: [{ id: "u1", name: "EG", propertyId: "p1" }],
    tenants: [
      {
        id: "t1",
        name: "Mieter",
        email: "tenant@example.com",
        phone: "",
        propertyId: "p1",
        unitId: "u1",
      },
    ],
    employees: [],
  };
}

test("deleting an owner preserves properties and tenants, clearing owner links", () => {
  const original = fixture();
  const next = removeRecord(original, "owners", "o1");
  assert.equal(next.owners.length, 0);
  assert.equal(next.properties.length, 1);
  assert.equal(next.properties[0].ownerId, "");
  assert.equal(next.tenants[0].propertyId, "p1");
  assert.equal(original.properties[0].ownerId, "o1");
  assert.ok(isDatabase(next));
});

test("deleting a property preserves people and clears the apartment assignment", () => {
  const original = fixture();
  const next = removeRecord(original, "properties", "p1");
  assert.equal(next.properties.length, 0);
  assert.equal(next.units.length, 0);
  assert.equal(next.owners.length, 1);
  assert.equal(next.tenants.length, 1);
  assert.equal(next.tenants[0].propertyId, "");
  assert.equal(next.tenants[0].unitId, "");
  assert.equal(original.tenants[0].unitId, "u1");
  assert.ok(withoutAssignment("owners", next.owners[0], next));
  assert.ok(withoutAssignment("tenants", next.tenants[0], next));
  assert.ok(isDatabase(next));
});

test("deleting a unit keeps its building and the tenant's building assignment", () => {
  const db = fixture();
  const next = removeRecord(db, "units", "u1");
  assert.equal(next.units.length, 0);
  assert.deepEqual(next.properties, db.properties);
  assert.equal(next.tenants[0].unitId, "");
  assert.equal(next.tenants[0].propertyId, "p1");
  assert.ok(isDatabase(next));
});

test("deleting contacts leaves unrelated records untouched", () => {
  const db = fixture();
  const next = removeRecord(db, "tenants", "t1");
  assert.equal(next.tenants.length, 0);
  assert.deepEqual(next.properties, db.properties);
  assert.deepEqual(next.owners, db.owners);
});

test("invalid persisted data and broken foreign keys are rejected", () => {
  assert.ok(isDatabase(fixture()));
  for (const value of [null, {}, [], { ...fixture(), version: 1 }])
    assert.equal(isDatabase(value), false);
  const missingOwner = fixture();
  missingOwner.owners = [];
  assert.equal(isDatabase(missingOwner), false);
  const brokenProperty = fixture();
  brokenProperty.tenants[0].propertyId = "missing";
  assert.equal(isDatabase(brokenProperty), false);
  const duplicate = fixture();
  duplicate.owners.push({ ...duplicate.owners[0] });
  assert.equal(isDatabase(duplicate), false);
  const missingUnit = fixture();
  missingUnit.units = [];
  assert.equal(isDatabase(missingUnit), false);
  const wrongBuilding = fixture();
  wrongBuilding.properties.push({ ...wrongBuilding.properties[0], id: "p2" });
  wrongBuilding.units[0].propertyId = "p2";
  assert.equal(isDatabase(wrongBuilding), false);
  const duplicateUnit = fixture();
  duplicateUnit.units.push({ id: "u2", name: "eg", propertyId: "p1" });
  assert.equal(isDatabase(duplicateUnit), false);
  const wrongField = fixture();
  wrongField.tenants[0].email = 42;
  assert.equal(isDatabase(wrongField), false);
});

test("assignment filters reflect actual references", () => {
  const db = fixture();
  assert.equal(withoutAssignment("owners", db.owners[0], db), false);
  assert.equal(withoutAssignment("tenants", db.tenants[0], db), false);
  db.tenants[0].unitId = "";
  assert.equal(withoutAssignment("tenants", db.tenants[0], db), true);
  assert.equal(withoutAssignment("properties", db.properties[0], db), false);
  db.properties[0].ownerId = "";
  assert.equal(withoutAssignment("owners", db.owners[0], db), true);
  assert.equal(withoutAssignment("properties", db.properties[0], db), true);
});

test("unknown and excluded sections cannot become management pages", () => {
  assert.equal(kindForSection("objekte"), "properties");
  assert.equal(kindForSection("einheiten"), "units");
  assert.equal(kindForSection("profil"), undefined);
  assert.equal(kindForSection("invalid"), undefined);
});
