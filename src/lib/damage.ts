export const damageStatuses = [
  "created",
  "in_progress",
  "invoiced",
  "paid",
] as const;
export type DamageStatus = (typeof damageStatuses)[number];
export type DamageLanguage = "de" | "en";
export type MessageChannel = "tenant" | "owner";
export interface DamageSummary {
  id: string;
  location: string;
  description: string;
  language: DamageLanguage;
  status: DamageStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  serviceOrdered: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  invoiceNumber: string | null;
  ownerName: string | null;
  reporterName: string | null;
}
export interface DamageMessage {
  id: string;
  channel: MessageChannel;
  authorName: string;
  authorRole: "admin" | "owner" | "tenant";
  body: string;
  createdAt: string;
}
export interface DamageDetail {
  report: DamageSummary;
  messages: DamageMessage[];
  events: { status: DamageStatus; createdAt: string }[];
}
export interface InvoiceInput {
  issuer: string;
  taxId: string;
  recipientAddress: string;
  serviceDate: string;
  service: string;
  netCents: number;
  taxBasisPoints: number;
  taxNote: string;
  paymentDetails: string;
}
export interface InvoiceSnapshot extends InvoiceInput {
  number: string;
  issuedDate: string;
  recipientName: string;
  location: string;
  taxCents: number;
  totalCents: number;
}
export function invoiceTotals(netCents: number, taxBasisPoints: number) {
  const taxCents = Math.round((netCents * taxBasisPoints) / 10000);
  return { taxCents, totalCents: netCents + taxCents };
}
export function parseEuroCents(value: string): number | undefined {
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(value.trim())) return undefined;
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return cents > 0 ? cents : undefined;
}
export function nextDamageStatus(
  status: DamageStatus,
): DamageStatus | undefined {
  return damageStatuses[damageStatuses.indexOf(status) + 1];
}
export const damageText = {
  de: {
    report: "Schaden melden",
    reports: "Schadensmeldungen",
    description: "Was ist passiert?",
    placeholder: "Zum Beispiel: Der Wasserhahn in der Küche tropft.",
    send: "Schaden melden",
    sending: "Wird gesendet …",
    back: "Zur Übersicht",
    noReports: "Keine Schadensmeldungen vorhanden.",
    message: "Nachricht",
    reply: "Antworten",
    sendMessage: "Nachricht senden",
    conversation: "Nachrichten mit der Verwaltung",
    invoice: "Rechnung als PDF öffnen",
    history: "Verlauf",
    status: "Status",
    location: "Wohnung / Gebäude",
    saved: "Deine Schadensmeldung wurde gespeichert.",
    error: "Senden fehlgeschlagen. Bitte versuche es erneut.",
    missing:
      "Deiner Wohnung ist noch kein Gebäude zugeordnet. Bitte kontaktiere die Verwaltung.",
    administration: "Verwaltung",
    tenant: "Mieter",
    owner: "Eigentümer",
    statuses: {
      created: "Angelegt",
      in_progress: "In Bearbeitung",
      invoiced: "Abgeschlossen und Rechnung gestellt",
      paid: "Abgeschlossen und bezahlt",
    },
  },
  en: {
    report: "Report a problem",
    reports: "Reported problems",
    description: "What happened?",
    placeholder: "For example: The kitchen tap is leaking.",
    send: "Report problem",
    sending: "Sending …",
    back: "Back to overview",
    noReports: "No problems reported.",
    message: "Message",
    reply: "Reply",
    sendMessage: "Send message",
    conversation: "Messages with property management",
    invoice: "Open invoice PDF",
    history: "History",
    status: "Status",
    location: "Apartment / building",
    saved: "Your report has been saved.",
    error: "Could not send. Please try again.",
    missing:
      "Your apartment has no building assigned yet. Please contact property management.",
    administration: "Property management",
    tenant: "Tenant",
    owner: "Owner",
    statuses: {
      created: "Reported",
      in_progress: "In progress",
      invoiced: "Completed and invoiced",
      paid: "Completed and paid",
    },
  },
} as const;
