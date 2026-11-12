import "server-only";
import type { AppUser } from "@/lib/account";
import type { DamageSummary, MessageChannel } from "@/lib/damage";
import type { DamageRow } from "../repositories/damages";
import { RequestError } from "../errors";

export function writableMessageChannels(
  report: DamageRow,
  role: AppUser["role"],
) {
  return report.messageChannels.filter(
    (channel) =>
      channel === "tenant" ||
      (report.ownerAssignmentId !== null &&
        (report.status === "in_progress" ||
          (role === "admin" && report.status !== "created"))),
  );
}

export function assertMessageChannel(
  report: DamageRow,
  channel: MessageChannel,
  role: AppUser["role"],
) {
  if (!report.messageChannels.includes(channel))
    throw new RequestError("Keine Berechtigung.", 403);
  if (!writableMessageChannels(report, role).includes(channel))
    throw new RequestError(
      role === "owner"
        ? "Der Fall ist abgeschlossen. Du kannst keine Nachricht mehr senden."
        : "Für diesen Fall sind derzeit keine Nachrichten an den Eigentümer möglich.",
      409,
    );
}

export function publicReport(row: DamageRow, user: AppUser): DamageSummary {
  const {
    reporterId: _reporter,
    currentOwnerId,
    ownerAssignmentId: _assignment,
    messageChannels: _channels,
    canManage: _manage,
    canReadInvoice: _invoice,
    ...report
  } = row;
  if (user.role === "owner" && currentOwnerId !== user.ownerId)
    report.propertyId = null;
  if (user.role !== "admin") {
    report.assigneeId = null;
    report.reporterName = null;
    report.ownerId = null;
    if (user.role === "tenant") {
      report.invoiceNumber = null;
      report.ownerName = null;
      report.serviceOrdered = false;
    }
  }
  return report;
}
