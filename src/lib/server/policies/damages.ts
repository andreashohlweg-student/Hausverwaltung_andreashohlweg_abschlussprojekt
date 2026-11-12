import "server-only";
import type { AppUser } from "@/lib/account";
import type { DamageSummary, DamageStatus, MessageChannel } from "@/lib/damage";
import type { DamageRow } from "../repositories/damages";
import { RequestError } from "../errors";

export function assertMessageChannel(
  channels: MessageChannel[],
  channel: MessageChannel,
  status: DamageStatus,
  role: AppUser["role"],
) {
  if (!channels.includes(channel))
    throw new RequestError("Keine Berechtigung.", 403);
  if (channel === "owner" && status !== "invoiced" && status !== "paid")
    throw new RequestError(
      "Für diesen Fall liegt noch keine Rechnung vor.",
      409,
    );
  if (channel === "owner" && role === "owner")
    throw new RequestError(
      "Der Fall ist abgeschlossen. Du kannst keine Nachricht mehr senden.",
      409,
    );
}

export function publicReport(row: DamageRow, user: AppUser): DamageSummary {
  const {
    reporterId: _reporter,
    currentOwnerId,
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
