import "server-only";
import type { AppUser } from "@/lib/account";
import {
  invoiceTotals,
  nextDamageStatus,
  type DamageDetail,
  type DamageSummary,
  type DamageLanguage,
  type InvoiceSnapshot,
} from "@/lib/damage";
import {
  getPool,
  transaction,
  lockApplicationState,
  type DatabaseClient,
} from "./db";
import { RequestError } from "./errors";
import { renderDamageInvoice } from "./damage-invoice";
import type { DamageMessageInput, DamageUpdate } from "./damage-validation";
import { requireAdministrator } from "./policies/accounts";
import * as cases from "./repositories/damages";
import * as assignments from "./repositories/assignments";
import { findTenantHome } from "./repositories/housing";
import {
  publicReport,
  assertMessageChannel,
  writableMessageChannels,
} from "./policies/damages";

async function requireCase(
  client: DatabaseClient,
  id: string,
  user: AppUser,
  lock = false,
) {
  if (lock) await cases.lockDamage(client, id);
  const [row] = await cases.findDamages(client, user.id, { id });
  if (!row) throw new RequestError("Schadensmeldung nicht gefunden.", 404);
  return row;
}

export async function listDamages(
  user: AppUser,
  propertyId?: string,
): Promise<DamageSummary[]> {
  const rows = await cases.findDamages(getPool(), user.id, { propertyId });
  return rows.map((row) => publicReport(row, user));
}

export async function loadDamage(
  id: string,
  user: AppUser,
): Promise<DamageDetail> {
  return transaction(async (client) => {
    const row = await requireCase(client, id, user);
    const messages = await cases.findMessages(client, id, user.id);
    const events = await cases.findEvents(client, id, user.id);
    const ownerAssignments = await cases.findOwnerHistory(client, id, user.id);
    return {
      report: publicReport(row, user),
      messages,
      ownerAssignmentId: user.role === "tenant" ? null : row.ownerAssignmentId,
      writableMessageChannels: writableMessageChannels(row, user.role),
      events: events.map((event) => ({
        ...event,
        actorName: user.role === "admin" ? event.actorName : null,
      })),
      ownerAssignments,
    };
  }, true);
}

export async function tenantLocation(user: AppUser) {
  if (user.role !== "tenant") return null;
  return findTenantHome(getPool(), user.tenantId);
}

export async function createDamage(
  user: AppUser,
  input: { id: string; description: string; language: DamageLanguage },
) {
  if (user.role !== "tenant")
    throw new RequestError("Nur Mieter können Schäden melden.", 403);
  return transaction(async (client) => {
    await lockApplicationState(client);
    const previous = await cases.findReportIdentity(client, input.id);
    if (previous) {
      if (
        previous.reporter_id !== user.id ||
        previous.description !== input.description
      )
        throw new RequestError("Diese Meldung wurde bereits verwendet.", 409);
      return input.id;
    }
    const place = await findTenantHome(client, user.tenantId);
    if (!place)
      throw new RequestError(
        input.language === "en"
          ? "Your apartment has no building assigned. Please contact property management."
          : "Deiner Wohnung ist noch kein Gebäude zugeordnet. Bitte kontaktiere die Verwaltung.",
        409,
      );
    await cases.insertDamage(client, user, input, place);
    if (place.ownerId) {
      const owner = await assignments.findOwner(client, place.ownerId);
      if (owner)
        await assignments.assignOwner(
          client,
          input.id,
          owner,
          user.id,
          "report",
        );
    }
    await cases.appendStatus(client, input.id, "created", user);
    return input.id;
  });
}

export async function updateDamage(
  id: string,
  user: AppUser,
  input: DamageUpdate,
) {
  requireAdministrator(user);
  return transaction(async (client) => {
    await lockApplicationState(client);
    const report = await requireCase(client, id, user, true);
    if (!report.canManage) throw new RequestError("Keine Berechtigung.", 403);
    if (report.version !== input.version)
      throw new RequestError(
        "Der Fall wurde inzwischen geändert. Bitte lade ihn neu.",
        409,
      );
    if (input.action === "assign_owner") {
      if (report.ownerId === input.ownerId) return;
      if (report.invoiceNumber)
        throw new RequestError(
          "Der Fall ist bereits abgerechnet. Der Rechnungsempfänger kann hier nicht geändert werden.",
          409,
        );
      const owner = input.ownerId
        ? await assignments.findOwner(client, input.ownerId)
        : null;
      if (input.ownerId && !owner)
        throw new RequestError("Eigentümer nicht gefunden.", 404);
      await assignments.endOwnerAssignment(
        client,
        id,
        user.id,
        owner ? "reassigned" : "unassigned",
      );
      if (owner)
        await assignments.assignOwner(client, id, owner, user.id, "manual");
      await cases.saveDamage(client, id, report);
      return;
    }
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
    if (
      input.action === "update" &&
      status === "invoiced" &&
      report.status !== "invoiced"
    ) {
      if (!input.invoice)
        throw new RequestError("Bitte ergänze die Rechnungsdaten.", 400);
      const recipient = report.ownerId
        ? await assignments.findOwner(client, report.ownerId)
        : null;
      if (!recipient)
        throw new RequestError("Dem Fall ist kein Eigentümer zugeordnet.", 409);
      const dates = await cases.nextInvoiceNumber(client);
      if (input.invoice.serviceDate > dates.today)
        throw new RequestError(
          "Das Leistungsdatum darf nicht in der Zukunft liegen.",
          400,
        );
      const invoice: InvoiceSnapshot = {
        ...input.invoice,
        ...invoiceTotals(input.invoice.netCents, input.invoice.taxBasisPoints),
        number: `HP-${dates.today.slice(0, 4)}-${dates.serial.padStart(6, "0")}`,
        issuedDate: dates.today,
        recipientName: recipient.name,
        location: report.location,
      };
      await cases.insertInvoice(
        client,
        id,
        recipient.id,
        invoice,
        await renderDamageInvoice(invoice),
      );
    }
    await cases.saveDamage(client, id, {
      status,
      assigneeId,
      serviceOrdered:
        input.action === "update"
          ? (input.serviceOrdered ?? report.serviceOrdered)
          : report.serviceOrdered,
    });
    if (status !== report.status)
      await cases.appendStatus(client, id, status, user);
  });
}

export async function addDamageMessage(
  id: string,
  user: AppUser,
  input: DamageMessageInput,
) {
  return transaction(async (client) => {
    await lockApplicationState(client);
    const report = await requireCase(client, id, user, true);
    assertMessageChannel(report, input.channel, user.role);
    const ownerAssignmentId =
      input.channel === "owner" ? report.ownerAssignmentId : null;
    if (
      input.channel === "owner" &&
      input.ownerAssignmentId !== ownerAssignmentId
    )
      throw new RequestError(
        "Die Eigentümerzuordnung hat sich geändert. Bitte lade den Fall neu.",
        409,
      );
    const previous = await cases.findMessageIdentity(client, input.id);
    if (previous) {
      if (
        previous.author_id !== user.id ||
        previous.damage_id !== id ||
        previous.channel !== input.channel ||
        previous.owner_assignment_id !== ownerAssignmentId ||
        previous.body !== input.body
      )
        throw new RequestError("Diese Nachricht wurde bereits verwendet.", 409);
    } else
      await cases.insertMessage(client, id, user, {
        ...input,
        ownerAssignmentId,
      });
  });
}

export async function loadDamageInvoice(id: string, user: AppUser) {
  if (user.role === "tenant")
    throw new RequestError("Keine Berechtigung.", 403);
  const invoice = await cases.findInvoice(getPool(), id, user.id);
  if (!invoice) throw new RequestError("Rechnung nicht gefunden.", 404);
  return invoice;
}
