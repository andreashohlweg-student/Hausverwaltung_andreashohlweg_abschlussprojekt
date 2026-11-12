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

  const buildingRoute = `/portal/gebaeude/${ids.property}`;
  const buildingIndex = await owner.request("/portal/gebaeude");
  assert.equal(buildingIndex.status, 200);
  assert.ok(buildingIndex.text.includes(buildingRoute));
  assert.ok(buildingIndex.text.includes("Gebäude suchen"));
  assert.ok(!buildingIndex.text.includes(`Fremdes Haus ${run}`));
  assert.equal(
    (await owner.request(`/portal/gebaeude/${ids.otherProperty}`)).status,
    404,
  );
  assert.equal(
    (await owner.request("/portal/gebaeude/missing-property")).status,
    404,
  );
  assert.ok(
    (await tenant.request(buildingRoute)).location?.includes("/portal"),
  );
  const hiddenReport = await owner.request(buildingRoute);
  assert.equal(hiddenReport.status, 200);
  assert.ok(!hiddenReport.text.includes(description));
  pass(
    "Gebäudeseiten zeigen nur eigene Gebäude und halten neue Meldungen verborgen",
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

  const openBuilding = await owner.request(buildingRoute + "?filter=open");
  assert.equal(openBuilding.status, 200);
  assert.ok(openBuilding.text.includes(description));
  assert.ok(
    !(await owner.request(buildingRoute + "?filter=invoice")).text.includes(
      description,
    ),
  );
  const dashboard = await owner.request("/portal");
  assert.ok(dashboard.text.includes("Dashboard"));
  assert.ok(dashboard.text.includes(buildingRoute));

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
  const invoicedBuilding = await owner.request(
    buildingRoute + "?filter=invoice",
  );
  assert.ok(invoicedBuilding.text.includes(description));
  assert.ok(
    !(await owner.request(buildingRoute + "?filter=open")).text.includes(
      description,
    ),
  );
  const scopedReport = await owner.request(
    `/portal/schaeden/${reportId}?gebaeude=${ids.property}&filter=invoice`,
  );
  assert.ok(
    scopedReport.text.includes(`href="${buildingRoute}?filter=invoice"`),
  );
  pass(
    "Gebäudefilter trennen offene und abgerechnete Fälle und erhalten den Rückweg",
  );

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
    409,
  );
  const invoiceMessage = {
    id: randomUUID(),
    channel: "owner",
    body: "Die Position umfasst das Material.",
  };
  assert.equal(
    (
      await admin.request(`${route}/messages`, {
        method: "POST",
        body: invoiceMessage,
      })
    ).status,
    200,
  );
  assert.ok(
    (await owner.request(route)).json.messages.some(
      (m) => m.id === invoiceMessage.id,
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
  assert.ok(ownerView.text.includes(invoiceMessage.body));
  assert.ok(!ownerView.text.includes('name="body"'));
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
  assert.equal(
    (
      await owner.request(`${route}/messages`, {
        method: "POST",
        body: ownerMessage,
      })
    ).status,
    409,
  );
  assert.ok(
    (await owner.request(buildingRoute + "?filter=invoice")).text.includes(
      description,
    ),
  );
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
    "Eigentümer liest Nachrichten und PDF zu abgeschlossenen Fällen ohne Schreibzugriff",
  );

  // Cases have explicit assignments; building ownership never silently grants access.
  const independentId = randomUUID();
  const independentRoute = `/api/damages/${independentId}`;
  assert.equal(
    (
      await tenant.request("/api/damages", {
        method: "POST",
        body: {
          id: independentId,
          description: "Eigenständiger Fall " + run,
          language: "de",
        },
      })
    ).status,
    200,
  );
  let independent = (await admin.request(independentRoute)).json.report;
  assert.equal(
    (
      await admin.request(independentRoute, {
        method: "PATCH",
        body: { action: "claim", version: independent.version },
      })
    ).status,
    200,
  );
  independent = (await admin.request(independentRoute)).json.report;
  assert.equal(independent.ownerId, ids.owner);
  assert.equal((await owner.request(independentRoute)).status, 200);

  // A failed aggregate write must also roll back its case-assignment changes.
  const invalidMaster = (await admin.request("/api/data")).json;
  invalidMaster.data.properties.find((p) => p.id === ids.property).ownerId =
    ids.otherOwner;
  invalidMaster.data.owners.push({
    id: `duplicate-${run}`,
    name: "Duplikat",
    email: invalidMaster.data.owners.find((o) => o.id === ids.owner).email,
    phone: "",
  });
  assert.equal(
    (await admin.request("/api/data", { method: "PUT", body: invalidMaster }))
      .status,
    409,
  );
  assert.equal(
    (await admin.request(independentRoute)).json.report.ownerId,
    ids.owner,
  );
  assert.equal(
    (await admin.request(independentRoute)).json.ownerAssignments.length,
    1,
  );
  assert.equal(
    (await admin.request("/api/data")).json.revision,
    invalidMaster.revision,
  );
  pass(
    "Fehler beim Stammdatenschreiben rollen Fallzuordnung und Revision vollständig zurück",
  );

  const master = (await admin.request("/api/data")).json;
  master.data.properties.find((p) => p.id === ids.property).ownerId =
    ids.otherOwner;
  assert.equal(
    (await admin.request("/api/data", { method: "PUT", body: master })).status,
    200,
  );
  const detached = (await admin.request(independentRoute)).json;
  assert.equal(detached.report.ownerId, null);
  assert.equal(
    detached.ownerAssignments[0].endReason,
    "building_owner_changed",
  );
  assert.equal((await owner.request(independentRoute)).status, 404);
  assert.equal((await otherOwner.request(independentRoute)).status, 404);
  assert.equal((await tenant.request(independentRoute)).status, 200);
  assert.equal(
    (await otherOwner.request("/api/damages")).json.reports.some(
      (r) => r.id === independentId,
    ),
    false,
  );
  assert.equal((await otherOwner.request(route)).status, 404);
  assert.equal((await otherOwner.request(`${route}/invoice`)).status, 404);
  assert.equal((await owner.request(route)).status, 200);
  assert.deepEqual((await owner.request(`${route}/invoice`)).bytes, pdf.bytes);
  pass(
    "Eigentümerwechsel lässt offene Fälle unzugeordnet; alter Rechnungsfall und PDF bleiben vollständig beim alten Empfänger",
  );

  assert.equal(
    (
      await otherOwner.request(independentRoute, {
        method: "PATCH",
        body: {
          action: "assign_owner",
          version: detached.report.version,
          ownerId: ids.otherOwner,
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await admin.request(independentRoute, {
        method: "PATCH",
        body: {
          action: "assign_owner",
          version: detached.report.version,
          ownerId: ids.otherOwner,
        },
      })
    ).status,
    200,
  );
  assert.equal((await otherOwner.request(independentRoute)).status, 200);
  assert.deepEqual(
    (await otherOwner.request(independentRoute)).json.ownerAssignments,
    [],
  );
  assert.equal((await owner.request(independentRoute)).status, 404);
  assert.equal(
    (
      await admin.request(independentRoute, {
        method: "PATCH",
        body: {
          action: "assign_owner",
          version: detached.report.version,
          ownerId: ids.owner,
        },
      })
    ).status,
    409,
  );
  let fixed = (await admin.request(route)).json.report;
  assert.equal(
    (
      await admin.request(route, {
        method: "PATCH",
        body: {
          action: "assign_owner",
          version: fixed.version,
          ownerId: ids.otherOwner,
        },
      })
    ).status,
    409,
  );
  const assignmentPage = await admin.request(`/schaeden/${independentId}`);
  assert.ok(assignmentPage.text.includes("Eigentümer zuordnen"));
  assert.ok(assignmentPage.text.includes("Eigentümerhistorie"));
  pass(
    "Nur die Verwaltung ordnet Fälle zu; Zuordnung und Rechnungsschutz gelten für Liste, Detail und PDF",
  );

  // Detach without deleting the case, then assign a contact who has no login yet.
  independent = (await admin.request(independentRoute)).json.report;
  assert.equal(
    (
      await admin.request(independentRoute, {
        method: "PATCH",
        body: {
          action: "assign_owner",
          version: independent.version,
          ownerId: null,
        },
      })
    ).status,
    200,
  );
  assert.equal((await otherOwner.request(independentRoute)).status, 404);
  const formerOwnerId = `former-owner-${run}`;
  const formerName = `Ehemaliger Eigentümer ${run}`;
  const withContact = (await admin.request("/api/data")).json;
  withContact.data.owners.push({
    id: formerOwnerId,
    name: formerName,
    email: `former-${run}@example.com`,
    phone: "",
  });
  assert.equal(
    (await admin.request("/api/data", { method: "PUT", body: withContact }))
      .status,
    200,
  );
  independent = (await admin.request(independentRoute)).json.report;
  assert.equal(
    (
      await admin.request(independentRoute, {
        method: "PATCH",
        body: {
          action: "assign_owner",
          version: independent.version,
          ownerId: formerOwnerId,
        },
      })
    ).status,
    200,
  );
  independent = (await admin.request(independentRoute)).json.report;
  assert.equal(
    (
      await admin.request(independentRoute, {
        method: "PATCH",
        body: {
          action: "update",
          version: independent.version,
          status: "invoiced",
          invoice,
        },
      })
    ).status,
    200,
  );
  const lateOwner = new BrowserSession();
  const lateToken = await invitation(
    `former-${run}@example.com`,
    formerName,
    "owner",
    formerOwnerId,
  );
  assert.equal(
    (
      await lateOwner.request("/api/invitations/accept", {
        method: "POST",
        body: { token: lateToken, password: `Isolated-${randomUUID()}` },
      })
    ).status,
    200,
  );
  assert.equal((await lateOwner.request(independentRoute)).status, 200);
  assert.equal(
    (await lateOwner.request(`${independentRoute}/invoice`)).status,
    200,
  );
  pass(
    "Später aktivierter Eigentümerzugang erhält Zugriff aus der bestehenden Fallzuordnung ohne doppelte Empfängerliste",
  );
  const historicalPdf = await admin.request(`${independentRoute}/invoice`);
  assert.equal(historicalPdf.status, 200);
  const withoutContact = (await admin.request("/api/data")).json;
  withoutContact.data.owners = withoutContact.data.owners.filter(
    (o) => o.id !== formerOwnerId,
  );
  assert.equal(
    (await admin.request("/api/data", { method: "PUT", body: withoutContact }))
      .status,
    200,
  );
  const preserved = (await admin.request(independentRoute)).json;
  assert.equal(preserved.report.ownerId, null);
  assert.equal((await lateOwner.request(independentRoute)).status, 401);
  assert.equal(
    (await lateOwner.request(`${independentRoute}/invoice`)).status,
    401,
  );
  assert.equal(preserved.report.status, "invoiced");
  assert.equal(preserved.ownerAssignments.at(-1).ownerName, formerName);
  assert.equal(preserved.ownerAssignments.at(-1).ownerId, null);
  assert.equal(preserved.ownerAssignments.at(-1).endReason, "owner_removed");
  assert.deepEqual(
    (await admin.request(`${independentRoute}/invoice`)).bytes,
    historicalPdf.bytes,
  );
  assert.equal((await otherOwner.request(independentRoute)).status, 404);
  assert.equal((await owner.request(independentRoute)).status, 404);
  pass(
    "Entfernter Eigentümer bleibt namentlich in der Historie; Fall und ausgestellte PDF bleiben erhalten",
  );

  // Restore the building fixture for the remaining registration tests.
  const restore = (await admin.request("/api/data")).json;
  restore.data.properties.find((p) => p.id === ids.property).ownerId =
    ids.owner;
  assert.equal(
    (await admin.request("/api/data", { method: "PUT", body: restore })).status,
    200,
  );

  await client.query("BEGIN");
  try {
    await client.query("SAVEPOINT invalid_profile");
    await assert.rejects(
      client.query(
        "INSERT INTO hausportal.users(id,email,name,role,owner_id) VALUES($1,$2,'Ungültig','admin',$3)",
        [`invalid-${run}`, `invalid-${run}@example.com`, ids.owner],
      ),
      { code: "23514" },
    );
    await client.query("ROLLBACK TO SAVEPOINT invalid_profile");
    await client.query("SAVEPOINT conflicting_assignment");
    await assert.rejects(
      client.query(
        "INSERT INTO hausportal.damage_owner_assignments(damage_id,owner_id,owner_name,source) VALUES($1,$2,'Doppelt','manual')",
        [reportId, ids.otherOwner],
      ),
      { code: "23505" },
    );
    await client.query("ROLLBACK TO SAVEPOINT conflicting_assignment");
  } finally {
    await client.query("ROLLBACK");
  }
  pass(
    "Datenbank verhindert widersprüchliche Nutzerprofile und doppelte aktuelle Fallzuordnungen",
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
