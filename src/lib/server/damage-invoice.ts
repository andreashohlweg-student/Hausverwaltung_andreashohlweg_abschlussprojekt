import "server-only";
import PDFDocument from "pdfkit";
import path from "node:path";
import type { InvoiceSnapshot } from "../damage";

export async function renderDamageInvoice(
  invoice: InvoiceSnapshot,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 52,
    font: path.join(process.cwd(), "src/assets/fonts/NotoSans-Regular.ttf"),
    info: {
      Title: `Rechnung ${invoice.number}`,
      Author: invoice.issuer.split("\n")[0],
    },
  });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const euro = (cents: number) =>
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);
  const date = (value: string) => value.split("-").reverse().join(".");
  doc.fillColor("#225b4a").fontSize(22).text("Rechnung");
  doc.moveDown(0.4).fillColor("#202b35").fontSize(11).text(invoice.number);
  doc
    .moveDown()
    .fontSize(10)
    .text(`Rechnungsdatum ${date(invoice.issuedDate)}`);
  doc.text(`Leistungsdatum ${date(invoice.serviceDate)}`);
  doc.moveDown(1.5).fontSize(9).fillColor("#65716b").text("RECHNUNGSSTELLER");
  doc.moveDown(0.4).fontSize(11).fillColor("#202b35").text(invoice.issuer);
  doc.fontSize(9).text(`Steuernummer / USt-IdNr. ${invoice.taxId}`);
  doc.moveDown(1.4).fillColor("#65716b").text("RECHNUNGSEMPFÄNGER");
  doc
    .moveDown(0.4)
    .fontSize(11)
    .fillColor("#202b35")
    .text(invoice.recipientName);
  doc.text(invoice.recipientAddress);
  doc.moveDown(1.5).fontSize(9).fillColor("#65716b").text("GEBÄUDE / WOHNUNG");
  doc.moveDown(0.4).fontSize(11).fillColor("#202b35").text(invoice.location);
  doc
    .moveDown(1.5)
    .fontSize(9)
    .fillColor("#65716b")
    .text("AUSGEFÜHRTE LEISTUNG");
  doc
    .moveDown(0.4)
    .fontSize(11)
    .fillColor("#202b35")
    .text(invoice.service, { lineGap: 3 });
  // Keep the amount block together, including when the service spans pages.
  if (doc.y > doc.page.height - 210) doc.addPage();
  doc.moveDown(1.5);
  const y = doc.y;
  const width = doc.page.width - 104;
  doc
    .moveTo(52, y)
    .lineTo(52 + width, y)
    .strokeColor("#d8e3dc")
    .stroke();
  doc
    .moveDown(0.8)
    .fontSize(11)
    .text(`Nettobetrag    ${euro(invoice.netCents)}`, { align: "right" });
  doc.text(
    `Umsatzsteuer ${invoice.taxBasisPoints / 100} %    ${euro(invoice.taxCents)}`,
    { align: "right" },
  );
  doc
    .moveDown(0.3)
    .fontSize(14)
    .fillColor("#225b4a")
    .text(`Gesamtbetrag    ${euro(invoice.totalCents)}`, { align: "right" });
  doc.fontSize(10).fillColor("#202b35");
  if (invoice.taxNote) doc.moveDown().text(invoice.taxNote);
  if (invoice.paymentDetails) doc.moveDown(1.2).text(invoice.paymentDetails);
  doc.end();
  return output;
}
