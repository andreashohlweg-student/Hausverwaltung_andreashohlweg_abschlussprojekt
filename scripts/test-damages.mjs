import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

export async function checkDamages({
  sessions,
  anonymous,
  client,
  ids,
  run,
  pass,
  BrowserSession,
  invitation,
}) {
  const reportId = randomUUID();
  const description = `Wasserhahn tropft. Проверка ${run}`;
  const route = `/api/damages/${reportId}`;
  const newReport = { id: reportId, description, language: "de" };
  const tenant = sessions.tenant;
  const admin = sessions.admin;
  const owner = sessions.owner;
  assert.equal((await anonymous.request("/api/damages")).status, 401);
  assert.equal(
    (
      await anonymous.request("/api/damages", {
        method: "POST",
        body: newReport,
      })
    ).status,
    401,
  );
  assert.equal(
    (await owner.request("/api/damages", { method: "POST", body: newReport }))
      .status,
    403,
  );
  assert.equal(
    (await tenant.request("/api/damages", { method: "POST", body: newReport }))
      .status,
    200,
  );
  assert.equal(
    (await tenant.request("/api/damages", { method: "POST", body: newReport }))
      .status,
    200,
  );
  const ownList = await tenant.request("/api/damages");
  assert.equal(ownList.json.reports.filter((r) => r.id === reportId).length, 1);
  assert.equal((await tenant.request(route)).json.report.status, "created");
  assert.equal((await owner.request(route)).status, 404);
  assert.equal(
    (await owner.request("/api/damages")).json.reports.some(
      (r) => r.id === reportId,
    ),
    false,
  );
  assert.equal(
    (await owner.request(`/portal/schaeden/${reportId}`)).status,
    404,
  );
  assert.equal(
    (
      await tenant.request(route, {
        method: "PATCH",
        body: { action: "claim", version: 1 },
      })
    ).status,
    403,
  );
  pass(
    "Mieter meldet mit einem Textfeld; Wiederholung erzeugt keinen zweiten Fall; Eigentümer sieht Angelegt nicht",
  );

  const otherTenantId = `damage-other-tenant-${run}`;
  const otherTenantEmail = `damage-other-tenant-${run}@example.com`;
  await client.query(
    "INSERT INTO hausportal.tenants(id,name,email,unit_id) VALUES($1,'Anderer Mieter',$2,$3)",
    [otherTenantId, otherTenantEmail, ids.otherUnit],
  );
  const otherTenant = new BrowserSession();
  const otherOwner = new BrowserSession();
  for (const [session, email, role, contact] of [
    [otherTenant, otherTenantEmail, "tenant", otherTenantId],
    [otherOwner, `e2e-other-${run}@example.com`, "owner", ids.otherOwner],
  ]) {
    const token = await invitation(
      email,
      "Fremder Zugang",
      role,
      role === "owner" ? contact : null,
      role === "tenant" ? contact : null,
    );
    assert.equal(
      (
        await session.request("/api/invitations/accept", {
          method: "POST",
          body: { token, password: `Isolated-${randomUUID()}` },
        })
      ).status,
      200,
    );
    assert.equal((await session.request(route)).status, 404);
  }
  let report = (await admin.request(route)).json.report;
  assert.equal(
    (
      await admin.request(route, {
        method: "PATCH",
        body: { action: "update", version: report.version, status: "paid" },
      })
    ).status,
    409,
  );
  const claim = await admin.request(route, {
    method: "PATCH",
    body: { action: "claim", version: report.version },
  });
  assert.equal(claim.status, 200, claim.json?.error);
  assert.equal(
    (
      await admin.request(route, {
        method: "PATCH",
        body: { action: "claim", version: report.version },
      })
    ).status,
    409,
  );
  assert.equal((await owner.request(route)).json.report.status, "in_progress");
  assert.equal((await otherOwner.request(route)).status, 404);
  report = (await admin.request(route)).json.report;
  assert.equal(
    (
      await admin.request(route, {
        method: "PATCH",
        body: {
          action: "update",
          version: report.version,
          serviceOrdered: true,
        },
      })
    ).status,
    200,
  );
  pass(
    "Übernahme startet Bearbeitung; Eigentümersicht und parallele Bearbeitung sind geschützt",
  );

  const tenantMessage = {
    id: randomUUID(),
    channel: "tenant",
    body: `Private Rückfrage ${run}`,
  };
  assert.equal(
    (
      await admin.request(`${route}/messages`, {
        method: "POST",
        body: tenantMessage,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await admin.request(`${route}/messages`, {
        method: "POST",
        body: tenantMessage,
      })
    ).status,
    200,
  );
  assert.equal(
    (await tenant.request(route)).json.messages.filter(
      (m) => m.id === tenantMessage.id,
    ).length,
    1,
  );
  assert.equal((await owner.request(route)).json.messages.length, 0);
  assert.equal(
    (
      await tenant.request(`${route}/messages`, {
        method: "POST",
        body: {
          id: randomUUID(),
          channel: "tenant",
          body: "Es tropft seit gestern.",
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await tenant.request(`${route}/messages`, {
        method: "POST",
        body: { id: randomUUID(), channel: "owner", body: "Falscher Kanal" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await otherTenant.request(`${route}/messages`, {
        method: "POST",
        body: { id: randomUUID(), channel: "tenant", body: "Fremder Fall" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await owner.request(`${route}/messages`, {
        method: "POST",
        body: { id: randomUUID(), channel: "owner", body: "Zu früh" },
      })
    ).status,
    409,
  );
  assert.equal((await tenant.request(`${route}/invoice`)).status, 403);
  assert.equal((await owner.request(`${route}/invoice`)).status, 404);
  pass(
    "Rückfragen und Antworten bleiben im richtigen Gespräch; fremde Mieter und Rechnungszugriff sind gesperrt",
  );

  report = (await admin.request(route)).json.report;
  const invoice = {
    issuer: "Testverwaltung GmbH\nMusterstraße 1\n10115 Berlin",
    taxId: "DE123456789",
    recipientAddress: "Eigentümerweg 2\n10115 Berlin",
    serviceDate: "2026-01-01",
    service:
      "Austausch der Dichtung am Küchenwasserhahn einschließlich Material und Anfahrt.",
    netCents: 12050,
    taxBasisPoints: 1900,
    taxNote: "",
    paymentDetails: "Zahlbar innerhalb von 14 Tagen.",
  };
  assert.equal(
    (
      await admin.request(route, {
        method: "PATCH",
        body: { action: "update", version: report.version, status: "invoiced" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await admin.request(route, {
        method: "PATCH",
        body: {
          action: "update",
          version: report.version,
          status: "invoiced",
          invoice: { ...invoice, taxBasisPoints: 0 },
        },
      })
    ).status,
    400,
  );
  assert.equal((await admin.request(route)).json.report.status, "in_progress");
  const attempts = await Promise.all(
    [1, 2].map(() =>
      admin.request(route, {
        method: "PATCH",
        body: {
          action: "update",
          version: report.version,
          status: "invoiced",
          invoice,
        },
      }),
    ),
  );
  assert.deepEqual(attempts.map((result) => result.status).sort(), [200, 409]);
  const invoiceRows = await client.query(
    "SELECT number,details FROM hausportal.damage_invoices WHERE damage_id=$1",
    [reportId],
  );
  assert.equal(invoiceRows.rowCount, 1);
  assert.equal(invoiceRows.rows[0].details.taxCents, 2290);
  assert.equal(invoiceRows.rows[0].details.totalCents, 14340);
  const pdf = await owner.request(`${route}/invoice`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.contentType, "application/pdf");
  assert.equal(Buffer.from(pdf.bytes).subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.bytes.length > 1000);
  if (process.env.E2E_PDF_OUTPUT)
    await writeFile(process.env.E2E_PDF_OUTPUT, pdf.bytes, { mode: 0o600 });
  assert.equal((await otherOwner.request(`${route}/invoice`)).status, 404);
  assert.equal((await tenant.request(`${route}/invoice`)).status, 403);
  pass(
    "Rechnung und Status werden gemeinsam gespeichert; auch bei Parallelaufrufen entsteht genau eine PDF",
  );

  report = (await admin.request(route)).json.report;
  assert.equal(
    (
      await admin.request(route, {
        method: "PATCH",
        body: { action: "claim", version: report.version },
      })
    ).status,
    200,
  );
  assert.equal((await admin.request(route)).json.report.status, "invoiced");
  const ownerMessage = {
    id: randomUUID(),
    channel: "owner",
    body: `Private Rechnungsfrage ${run}`,
  };
  assert.equal(
    (
      await owner.request(`${route}/messages`, {
        method: "POST",
        body: ownerMessage,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await admin.request(`${route}/messages`, {
        method: "POST",
        body: {
          id: randomUUID(),
          channel: "owner",
          body: "Die Position umfasst das Material.",
        },
      })
    ).status,
    200,
  );
  assert.ok(
    (await admin.request(route)).json.messages.some(
      (m) => m.id === ownerMessage.id,
    ),
  );
  assert.ok(
    !(await tenant.request(route)).json.messages.some(
      (m) => m.channel === "owner",
    ),
  );
  const ownerView = await owner.request(`/portal/schaeden/${reportId}`);
  assert.equal(ownerView.status, 200);
  assert.ok(!ownerView.text.includes(tenantMessage.body));
  report = (await admin.request(route)).json.report;
  assert.equal(
    (
      await admin.request(route, {
        method: "PATCH",
        body: { action: "update", version: report.version, status: "paid" },
      })
    ).status,
    200,
  );
  assert.equal((await owner.request(route)).json.report.status, "paid");
  const paidPDF = await owner.request(`${route}/invoice`);
  assert.deepEqual(paidPDF.bytes, pdf.bytes);
  assert.equal(
    (
      await admin.request(route, {
        method: "PATCH",
        body: {
          action: "update",
          version: report.version + 1,
          status: "created",
        },
      })
    ).status,
    409,
  );
  pass(
    "Eigentümer fragt zur Rechnung nach; Mieterchat bleibt privat; Bezahlung verändert die ausgestellte PDF nicht",
  );

  const newPage = await tenant.request("/portal/schaeden/neu");
  assert.equal(newPage.status, 200);
  assert.ok(newPage.text.includes('name="description"'));
  assert.ok(!newPage.text.includes("<select"));
  tenant.cookies.set("hausportal-language", "en");
  const english = await tenant.request("/portal/schaeden/neu");
  assert.ok(english.text.includes("What happened?"));
  assert.ok(english.text.includes("Report problem"));
  tenant.cookies.delete("hausportal-language");
  pass("Meldeseite bietet Deutsch und Englisch und benötigt keine Combobox");
}
