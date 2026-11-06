import "server-only";
import { isDatabase, type Database, type EntityKind } from "@/lib/domain";
import type { AppUser } from "@/lib/account";
import { recordChanges } from "@/lib/record-changes";
import { getPool, transaction, lockApplicationState } from "./db";
import { RequestError } from "./errors";
import { requireAdministrator } from "./policies/accounts";
import * as records from "./repositories/records";
import {
  detachChangedBuildingOwner,
  detachRemovedOwners,
} from "./repositories/assignments";

export async function loadDatabase(user: AppUser) {
  requireAdministrator(user);
  return transaction(
    async (client) => ({
      data: await records.readRecords(client),
      revision: await records.readRevision(client),
    }),
    true,
  );
}

export async function saveDatabase(
  data: Database,
  expectedRevision: number,
  user: AppUser,
) {
  requireAdministrator(user);
  if (!isDatabase(data)) throw new RequestError("Ungültige Zuordnungen.", 400);
  return transaction(async (client) => {
    if ((await lockApplicationState(client)) !== expectedRevision)
      throw new RequestError(
        "Die Daten wurden inzwischen geändert. Bitte lade die Seite neu.",
        409,
      );
    const previous = await records.readRecords(client);
    for (const account of await records.activeContactAccounts(client)) {
      const contact = account.owner_id
        ? data.owners.find((row) => row.id === account.owner_id)
        : data.tenants.find((row) => row.id === account.tenant_id);
      if (
        contact &&
        contact.email.toLowerCase() !== account.email.toLowerCase()
      )
        throw new RequestError(
          "Die E-Mail-Adresse eines aktivierten Zugangs kann hier nicht geändert werden.",
          409,
        );
    }
    for (const unit of data.units) {
      const old = previous.units.find((row) => row.id === unit.id);
      if (
        old &&
        old.propertyId !== unit.propertyId &&
        (await records.unitHasReports(client, unit.id))
      )
        throw new RequestError(
          "Eine Einheit mit bestehenden Schadensfällen kann nicht in ein anderes Gebäude verschoben werden.",
          409,
        );
    }
    await records.deactivateMissingContacts(
      client,
      data.owners.map((row) => row.id),
      data.tenants.map((row) => row.id),
    );
    const removedOwners = previous.owners
      .filter((row) => !data.owners.some((next) => next.id === row.id))
      .map((row) => row.id);
    await detachRemovedOwners(client, removedOwners, user.id);
    for (const property of previous.properties) {
      const next = data.properties.find((row) => row.id === property.id);
      if (property.ownerId && next?.ownerId !== property.ownerId)
        await detachChangedBuildingOwner(
          client,
          property.id,
          property.ownerId,
          user.id,
        );
    }
    const kinds: EntityKind[] = [
      "owners",
      "properties",
      "units",
      "tenants",
      "employees",
    ];
    for (const kind of kinds) {
      const changes = recordChanges<Database[EntityKind][number]>(
        previous[kind],
        data[kind],
      );
      for (const record of changes.upserts)
        await records.upsertRecord(client, kind, record);
    }
    for (const kind of [
      "tenants",
      "units",
      "properties",
      "owners",
      "employees",
    ] as const) {
      const changes = recordChanges<Database[EntityKind][number]>(
        previous[kind],
        data[kind],
      );
      await records.deleteRecords(client, kind, changes.removed);
    }
    return records.incrementRevision(client);
  });
}

export async function loadAccountStatuses(user: AppUser) {
  requireAdministrator(user);
  return records.readAccountStatuses(getPool());
}
export async function ownerOptions(user: AppUser) {
  requireAdministrator(user);
  return records.readOwnerOptions(getPool());
}
