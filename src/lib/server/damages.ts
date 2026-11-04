import type { PoolClient } from "pg";
import type { AppUser } from "@/lib/account";
import {
  invoiceTotals,
  nextDamageStatus,
  type DamageDetail,
  type DamageSummary,
  type DamageMessage,
  type DamageLanguage,
  type InvoiceSnapshot,
  type MessageChannel,
} from "@/lib/damage";
import { getPool } from "./db";
import { RequestError } from "./access";
import { renderDamageInvoice } from "./damage-invoice";
import type { DamageUpdate } from "./damage-validation";

interface DamageRow extends DamageSummary {
  reporterId: string | null;
  ownerAccessId: string | null;
}
const selectDamage = `SELECT d.id,d.location,d.description,d.language,d.status,d.version,
  d.reporter_id AS "reporterId",d.assignee_id AS "assigneeId",a.name AS "assigneeName",
  d.service_ordered AS "serviceOrdered",d.created_at::text AS "createdAt",d.updated_at::text AS "updatedAt",
  i.number AS "invoiceNumber",o.name AS "ownerName",r.name AS "reporterName",
  CASE WHEN i.damage_id IS NOT NULL THEN i.owner_id ELSE p.owner_id END AS "ownerAccessId"
  FROM hausportal.damages d
  LEFT JOIN hausportal.properties p ON p.id=d.property_id
  LEFT JOIN hausportal.damage_invoices i ON i.damage_id=d.id
  LEFT JOIN hausportal.owners o ON o.id=CASE WHEN i.damage_id IS NOT NULL THEN i.owner_id ELSE p.owner_id END
  LEFT JOIN hausportal.users a ON a.id=d.assignee_id
  LEFT JOIN hausportal.users r ON r.id=d.reporter_id`;

function canRead(user: AppUser, row: DamageRow) {
  return (
    user.role === "admin" ||
    (user.role === "tenant" && row.reporterId === user.id) ||
    (user.role === "owner" &&
      row.status !== "created" &&
      !!user.ownerId &&
      row.ownerAccessId === user.ownerId)
  );
}
function publicReport(row: DamageRow, user: AppUser): DamageSummary {
  const { reporterId: _reporter, ownerAccessId: _owner, ...report } = row;
  if (user.role !== "admin") {
    report.assigneeId = null;
    report.reporterName = null;
    if (user.role === "tenant") {
      report.invoiceNumber = null;
      report.ownerName = null;
      report.serviceOrdered = false;
    }
  }
  return report;
}
async function lockedReport(client: PoolClient, id: string, user: AppUser) {
  await client.query(
    "SELECT id FROM hausportal.damages WHERE id=$1 FOR UPDATE",
    [id],
  );
  const { rows } = await client.query<DamageRow>(
    `${selectDamage} WHERE d.id=$1`,
    [id],
  );
  if (!rows[0] || !canRead(user, rows[0]))
    throw new RequestError("Schadensmeldung nicht gefunden.", 404);
  return rows[0];
}
export async function listDamages(user: AppUser): Promise<DamageSummary[]> {
  let scope = "true";
  let value: string[] = [];
  if (user.role === "tenant") {
    scope = "d.reporter_id=$1";
    value = [user.id];
  }
  if (user.role === "owner") {
    scope =
      "d.status<>'created' AND (CASE WHEN i.damage_id IS NOT NULL THEN i.owner_id ELSE p.owner_id END)=$1";
    value = [user.ownerId ?? ""];
  }
  const { rows } = await getPool().query<DamageRow>(
    `${selectDamage} WHERE ${scope} ORDER BY d.created_at DESC,d.id`,
    value,
  );
  return rows.map((row) => publicReport(row, user));
}
export async function loadDamage(
  id: string,
  user: AppUser,
): Promise<DamageDetail> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows } = await client.query<DamageRow>(
      `${selectDamage} WHERE d.id=$1`,
      [id],
    );
    const row = rows[0];
    if (!row || !canRead(user, row))
      throw new RequestError("Schadensmeldung nicht gefunden.", 404);
    const messages = await client.query<DamageMessage>(
      `SELECT id,channel,author_name AS "authorName",author_role AS "authorRole",body,created_at::text AS "createdAt"
      FROM hausportal.damage_messages WHERE damage_id=$1 AND ($2='admin' OR channel=$2) ORDER BY created_at,id`,
      [id, user.role],
    );
    const events = await client.query<DamageDetail["events"][number]>(
      'SELECT status,created_at::text AS "createdAt" FROM hausportal.damage_events WHERE damage_id=$1 ORDER BY id',
      [id],
    );
    await client.query("COMMIT");
    return {
      report: publicReport(row, user),
      messages: messages.rows,
      events: events.rows,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function tenantLocation(user: AppUser) {
  if (user.role !== "tenant") return null;
  const { rows } = await getPool().query<{
    propertyId: string;
    unitId: string | null;
    location: string;
  }>(
    `SELECT p.id AS "propertyId",u.id AS "unitId",
    concat_ws(' · ',p.name,p.street,concat(p.postal_code,' ',p.city),u.name) AS location
    FROM hausportal.tenants t LEFT JOIN hausportal.units u ON u.id=t.unit_id
    JOIN hausportal.properties p ON p.id=coalesce(u.property_id,t.property_id) WHERE t.id=$1`,
    [user.tenantId],
  );
  return rows[0] ?? null;
}
export async function createDamage(
  user: AppUser,
  input: { id: string; description: string; language: DamageLanguage },
) {
  if (user.role !== "tenant")
    throw new RequestError("Nur Mieter können Schäden melden.", 403);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Serialize with assignment changes, so the location is captured consistently.
    await client.query(
      "SELECT revision FROM hausportal.state WHERE id=1 FOR UPDATE",
    );
    const previous = await client.query(
      "SELECT reporter_id,description FROM hausportal.damages WHERE id=$1",
      [input.id],
    );
    if (previous.rows[0]) {
      if (
        previous.rows[0].reporter_id !== user.id ||
        previous.rows[0].description !== input.description
      )
        throw new RequestError("Diese Meldung wurde bereits verwendet.", 409);
    } else {
      const location = await client.query<{
        propertyId: string;
        unitId: string | null;
        location: string;
      }>(
        `SELECT p.id AS "propertyId",u.id AS "unitId",
        concat_ws(' · ',p.name,p.street,concat(p.postal_code,' ',p.city),u.name) AS location
        FROM hausportal.tenants t LEFT JOIN hausportal.units u ON u.id=t.unit_id
        JOIN hausportal.properties p ON p.id=coalesce(u.property_id,t.property_id) WHERE t.id=$1`,
        [user.tenantId],
      );
      const place = location.rows[0];
      if (!place)
        throw new RequestError(
          input.language === "en"
            ? "Your apartment has no building assigned. Please contact property management."
            : "Deiner Wohnung ist noch kein Gebäude zugeordnet. Bitte kontaktiere die Verwaltung.",
          409,
        );
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
      await client.query(
        "INSERT INTO hausportal.damage_events(damage_id,status) VALUES($1,'created')",
        [input.id],
      );
    }
    await client.query("COMMIT");
    return input.id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function updateDamage(
  id: string,
  user: AppUser,
  input: DamageUpdate,
) {
  if (user.role !== "admin") throw new RequestError("Keine Berechtigung.", 403);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT revision FROM hausportal.state WHERE id=1 FOR UPDATE",
    );
    const report = await lockedReport(client, id, user);
    if (report.version !== input.version)
      throw new RequestError(
        "Der Fall wurde inzwischen geändert. Bitte lade ihn neu.",
        409,
      );
    let status = report.status;
    let assigneeId = report.assigneeId;
    if (input.action === "claim") {
      if (status === "paid")
        throw new RequestError("Dieser Fall ist bereits abgeschlossen.", 409);
      assigneeId = user.id;
      if (status === "created") status = "in_progress";
    } else {
      if (assigneeId !== user.id)
        throw new RequestError("Bitte übernimm zuerst den Fall.", 409);
      if (input.status && input.status !== status) {
        if (input.status !== nextDamageStatus(status))
          throw new RequestError(
            "Dieser Statuswechsel ist nicht möglich.",
            409,
          );
        status = input.status;
      }
    }
    if (status === "invoiced" && report.status !== "invoiced") {
      if (!input.invoice)
        throw new RequestError("Bitte ergänze die Rechnungsdaten.", 400);
      const recipient = await client.query(
        "SELECT o.id,o.name FROM hausportal.damages d JOIN hausportal.properties p ON p.id=d.property_id JOIN hausportal.owners o ON o.id=p.owner_id WHERE d.id=$1 FOR SHARE OF p,o",
        [id],
      );
      if (!recipient.rows[0])
        throw new RequestError(
          "Dem Gebäude ist kein Eigentümer zugeordnet.",
          409,
        );
      const { rows: dates } = await client.query(
        "SELECT (now() AT TIME ZONE 'Europe/Berlin')::date::text AS today, nextval('hausportal.damage_invoice_number')::text AS serial",
      );
      if (input.invoice.serviceDate > dates[0].today)
        throw new RequestError(
          "Das Leistungsdatum darf nicht in der Zukunft liegen.",
          400,
        );
      const invoice: InvoiceSnapshot = {
        ...input.invoice,
        ...invoiceTotals(input.invoice.netCents, input.invoice.taxBasisPoints),
        number: `HP-${dates[0].today.slice(0, 4)}-${dates[0].serial.padStart(6, "0")}`,
        issuedDate: dates[0].today,
        recipientName: recipient.rows[0].name,
        location: report.location,
      };
      const pdf = await renderDamageInvoice(invoice);
      await client.query(
        "INSERT INTO hausportal.damage_invoices(damage_id,number,owner_id,details,pdf) VALUES($1,$2,$3,$4,$5)",
        [id, invoice.number, recipient.rows[0].id, invoice, pdf],
      );
    }
    await client.query(
      `UPDATE hausportal.damages SET status=$2,assignee_id=$3,service_ordered=$4,version=version+1,updated_at=now() WHERE id=$1`,
      [id, status, assigneeId, input.serviceOrdered ?? report.serviceOrdered],
    );
    if (status !== report.status)
      await client.query(
        "INSERT INTO hausportal.damage_events(damage_id,status) VALUES($1,$2)",
        [id, status],
      );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function addDamageMessage(
  id: string,
  user: AppUser,
  input: { id: string; channel: MessageChannel; body: string },
) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const report = await lockedReport(client, id, user);
    if (user.role !== "admin" && input.channel !== user.role)
      throw new RequestError("Keine Berechtigung.", 403);
    if (
      input.channel === "owner" &&
      report.status !== "invoiced" &&
      report.status !== "paid"
    )
      throw new RequestError(
        "Rückfragen zur Rechnung sind nach der Rechnungsstellung möglich.",
        409,
      );
    const existing = await client.query(
      "SELECT author_id,damage_id,channel,body FROM hausportal.damage_messages WHERE id=$1",
      [input.id],
    );
    if (existing.rows[0]) {
      const message = existing.rows[0];
      if (
        message.author_id !== user.id ||
        message.damage_id !== id ||
        message.channel !== input.channel ||
        message.body !== input.body
      )
        throw new RequestError("Diese Nachricht wurde bereits verwendet.", 409);
    } else {
      await client.query(
        `INSERT INTO hausportal.damage_messages(id,damage_id,channel,author_id,author_name,author_role,body) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          input.id,
          id,
          input.channel,
          user.id,
          user.name,
          user.role,
          input.body,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function loadDamageInvoice(id: string, user: AppUser) {
  if (user.role === "tenant")
    throw new RequestError("Keine Berechtigung.", 403);
  // Use one statement for access and content so ownership checks cannot race a download.
  const { rows } = await getPool().query<{ number: string; pdf: Buffer }>(
    `SELECT i.number,i.pdf FROM hausportal.damage_invoices i
    JOIN hausportal.damages d ON d.id=i.damage_id
    WHERE d.id=$1 AND d.status IN ('invoiced','paid') AND ($2='admin' OR i.owner_id=$3)`,
    [id, user.role, user.ownerId],
  );
  if (!rows[0]) throw new RequestError("Rechnung nicht gefunden.", 404);
  return rows[0];
}
