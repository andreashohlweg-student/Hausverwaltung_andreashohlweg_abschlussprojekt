import "server-only";
import type { DatabaseClient } from "../db";

export async function findOwner(client: DatabaseClient, id: string) {
  const { rows } = await client.query<{ id: string; name: string }>(
    "SELECT id,name FROM hausportal.owners WHERE id=$1 FOR SHARE",
    [id],
  );
  return rows[0];
}

export async function assignOwner(
  client: DatabaseClient,
  damageId: string,
  owner: { id: string; name: string },
  actorId: string,
  source: "report" | "manual",
) {
  await client.query(
    `INSERT INTO hausportal.damage_owner_assignments(damage_id,owner_id,owner_name,assigned_by,source) VALUES($1,$2,$3,$4,$5)`,
    [damageId, owner.id, owner.name, actorId, source],
  );
}

export async function endOwnerAssignment(
  client: DatabaseClient,
  id: string,
  actorId: string,
  reason: "reassigned" | "unassigned",
) {
  await client.query(
    `UPDATE hausportal.damage_owner_assignments SET ended_at=now(),ended_by=$2,end_reason=$3 WHERE damage_id=$1 AND ended_at IS NULL`,
    [id, actorId, reason],
  );
}

// Called by the master-data service, in the same transaction as the ownership change.
// Invoiced cases retain their original recipient; no replacement owner is granted access.
export async function detachChangedBuildingOwner(
  client: DatabaseClient,
  propertyId: string,
  oldOwnerId: string,
  actorId: string,
) {
  const { rows } = await client.query<{ damage_id: string }>(
    `UPDATE hausportal.damage_owner_assignments a
    SET ended_at=now(),ended_by=$3,end_reason='building_owner_changed'
    FROM hausportal.damages d WHERE d.id=a.damage_id AND d.property_id=$1 AND a.owner_id=$2 AND a.ended_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM hausportal.damage_invoices i WHERE i.damage_id=d.id)
    RETURNING a.damage_id`,
    [propertyId, oldOwnerId, actorId],
  );
  await bumpCases(
    client,
    rows.map((row) => row.damage_id),
  );
}

export async function detachRemovedOwners(
  client: DatabaseClient,
  ownerIds: string[],
  actorId: string,
) {
  if (!ownerIds.length) return;
  const { rows } = await client.query<{ damage_id: string }>(
    `UPDATE hausportal.damage_owner_assignments
    SET ended_at=now(),ended_by=$2,end_reason='owner_removed'
    WHERE owner_id=ANY($1::text[]) AND ended_at IS NULL RETURNING damage_id`,
    [ownerIds, actorId],
  );
  await bumpCases(
    client,
    rows.map((row) => row.damage_id),
  );
}

async function bumpCases(client: DatabaseClient, ids: string[]) {
  if (ids.length)
    await client.query(
      "UPDATE hausportal.damages SET version=version+1,updated_at=now() WHERE id=ANY($1::uuid[])",
      [ids],
    );
}
