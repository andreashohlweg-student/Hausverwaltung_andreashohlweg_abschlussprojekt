import "server-only";
import type {
  DamageDetail,
  DamageLanguage,
  DamageMessage,
  DamageStatus,
  DamageSummary,
  InvoiceSnapshot,
  MessageChannel,
} from "@/lib/damage";
import type { AppUser } from "@/lib/account";
import type { DatabaseClient } from "../db";

export interface DamageRow extends DamageSummary {
  reporterId: string | null;
  currentOwnerId: string | null;
  messageChannels: MessageChannel[];
  canManage: boolean;
  canReadInvoice: boolean;
}

const selectDamage = `SELECT d.id,d.property_id AS "propertyId",p.owner_id AS "currentOwnerId",
  d.location,d.description,d.language,d.status,d.version,d.reporter_id AS "reporterId",
  d.assignee_id AS "assigneeId",a.name AS "assigneeName",d.service_ordered AS "serviceOrdered",
  d.created_at::text AS "createdAt",d.updated_at::text AS "updatedAt",i.number AS "invoiceNumber",
  own.owner_id AS "ownerId",CASE WHEN i.damage_id IS NOT NULL THEN i.details->>'recipientName' ELSE coalesce(o.name,own.owner_name) END AS "ownerName",r.name AS "reporterName",
  access.message_channels AS "messageChannels",access.can_manage AS "canManage",
  access.can_read_invoice AS "canReadInvoice"
  FROM hausportal.damages d
  JOIN hausportal.damage_access access ON access.damage_id=d.id AND access.user_id=$1
  LEFT JOIN hausportal.properties p ON p.id=d.property_id
  LEFT JOIN hausportal.damage_invoices i ON i.damage_id=d.id
  LEFT JOIN hausportal.damage_owner_assignments own ON own.damage_id=d.id AND own.ended_at IS NULL
  LEFT JOIN hausportal.owners o ON o.id=own.owner_id
  LEFT JOIN hausportal.users a ON a.id=d.assignee_id
  LEFT JOIN hausportal.users r ON r.id=d.reporter_id`;

// Lists and individual cases use exactly the same access relation and projection.
export async function findDamages(
  client: DatabaseClient,
  userId: string,
  filter: { id?: string; propertyId?: string } = {},
) {
  const { rows } = await client.query<DamageRow>(
    `${selectDamage} WHERE ($2::uuid IS NULL OR d.id=$2) AND ($3::text IS NULL OR d.property_id=$3)
    ORDER BY d.created_at DESC,d.id`,
    [userId, filter.id ?? null, filter.propertyId ?? null],
  );
  return rows;
}

export async function lockDamage(client: DatabaseClient, id: string) {
  await client.query(
    "SELECT id FROM hausportal.damages WHERE id=$1 FOR UPDATE",
    [id],
  );
}

export async function findMessages(
  client: DatabaseClient,
  id: string,
  userId: string,
) {
  const { rows } = await client.query<DamageMessage>(
    `SELECT m.id,m.channel,m.author_name AS "authorName",m.author_role AS "authorRole",m.body,m.created_at::text AS "createdAt"
     FROM hausportal.damage_messages m
     JOIN hausportal.damage_access access ON access.damage_id=m.damage_id AND access.user_id=$2
     WHERE m.damage_id=$1 AND m.channel=ANY(access.message_channels) ORDER BY m.created_at,m.id`,
    [id, userId],
  );
  return rows;
}

export async function findEvents(
  client: DatabaseClient,
  id: string,
  userId: string,
) {
  const { rows } = await client.query<DamageDetail["events"][number]>(
    `SELECT e.status,e.created_at::text AS "createdAt",e.actor_name AS "actorName"
     FROM hausportal.damage_events e
     JOIN hausportal.damage_access access ON access.damage_id=e.damage_id AND access.user_id=$2
     WHERE e.damage_id=$1 ORDER BY e.id`,
    [id, userId],
  );
  return rows;
}

export async function findOwnerHistory(
  client: DatabaseClient,
  id: string,
  userId: string,
) {
  const { rows } = await client.query<DamageDetail["ownerAssignments"][number]>(
    `SELECT a.id::text,a.owner_id AS "ownerId",a.owner_name AS "ownerName",a.source,
     a.assigned_at::text AS "assignedAt",a.ended_at::text AS "endedAt",a.end_reason AS "endReason"
     FROM hausportal.damage_owner_assignments a
     JOIN hausportal.damage_access access ON access.damage_id=a.damage_id AND access.user_id=$2 AND access.can_manage
     WHERE a.damage_id=$1 ORDER BY a.id`,
    [id, userId],
  );
  return rows;
}

export async function findInvoice(
  client: DatabaseClient,
  id: string,
  userId: string,
) {
  const { rows } = await client.query<{ number: string; pdf: Buffer }>(
    `SELECT i.number,i.pdf FROM hausportal.damage_invoices i
     JOIN hausportal.damage_access access ON access.damage_id=i.damage_id AND access.user_id=$2 AND access.can_read_invoice
     WHERE i.damage_id=$1`,
    [id, userId],
  );
  return rows[0];
}

export async function findReportIdentity(client: DatabaseClient, id: string) {
  const { rows } = await client.query<{
    reporter_id: string | null;
    description: string;
  }>("SELECT reporter_id,description FROM hausportal.damages WHERE id=$1", [
    id,
  ]);
  return rows[0];
}

export async function insertDamage(
  client: DatabaseClient,
  user: AppUser,
  input: { id: string; description: string; language: DamageLanguage },
  place: { propertyId: string; unitId: string | null; location: string },
) {
  await client.query(
    `INSERT INTO hausportal.damages(id,reporter_id,tenant_id,property_id,unit_id,location,description,language)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.id,
      user.id,
      user.tenantId,
      place.propertyId,
      place.unitId,
      place.location,
      input.description,
      input.language,
    ],
  );
}

export async function appendStatus(
  client: DatabaseClient,
  id: string,
  status: DamageStatus,
  actor: AppUser,
) {
  await client.query(
    "INSERT INTO hausportal.damage_events(damage_id,status,actor_id,actor_name) VALUES($1,$2,$3,$4)",
    [id, status, actor.id, actor.name],
  );
}

export async function saveDamage(
  client: DatabaseClient,
  id: string,
  changes: {
    status: DamageStatus;
    assigneeId: string | null;
    serviceOrdered: boolean;
  },
) {
  await client.query(
    `UPDATE hausportal.damages SET status=$2,assignee_id=$3,service_ordered=$4,version=version+1,updated_at=now() WHERE id=$1`,
    [id, changes.status, changes.assigneeId, changes.serviceOrdered],
  );
}

export async function findMessageIdentity(client: DatabaseClient, id: string) {
  const { rows } = await client.query<{
    author_id: string | null;
    damage_id: string;
    channel: string;
    body: string;
  }>(
    "SELECT author_id,damage_id,channel,body FROM hausportal.damage_messages WHERE id=$1",
    [id],
  );
  return rows[0];
}

export async function insertMessage(
  client: DatabaseClient,
  id: string,
  user: AppUser,
  input: { id: string; channel: MessageChannel; body: string },
) {
  await client.query(
    `INSERT INTO hausportal.damage_messages(id,damage_id,channel,author_id,author_name,author_role,body) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [input.id, id, input.channel, user.id, user.name, user.role, input.body],
  );
}

export async function nextInvoiceNumber(client: DatabaseClient) {
  const { rows } = await client.query<{ today: string; serial: string }>(
    "SELECT (now() AT TIME ZONE 'Europe/Berlin')::date::text AS today, nextval('hausportal.damage_invoice_number')::text AS serial",
  );
  return rows[0];
}

export async function insertInvoice(
  client: DatabaseClient,
  id: string,
  ownerId: string,
  invoice: InvoiceSnapshot,
  pdf: Buffer,
) {
  await client.query(
    "INSERT INTO hausportal.damage_invoices(damage_id,number,owner_id,details,pdf) VALUES($1,$2,$3,$4,$5)",
    [id, invoice.number, ownerId, invoice, pdf],
  );
}
