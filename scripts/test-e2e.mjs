import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import { checkDamages } from "./test-damages.mjs";
import {
  newInvitationToken,
  hashInvitationToken,
} from "../src/lib/invitation-token.ts";

if (!process.env.NEON_BRANCH?.startsWith("hausportal-check-"))
  throw new Error(
    "E2E-Tests dürfen nur auf einem isolierten hausportal-check-Branch laufen.",
  );
const base = process.env.E2E_BASE_URL || "http://localhost:3002";
const testMail = !process.argv.includes("--skip-mail");
const mailRecipient = testMail
  ? process.env.E2E_MAIL_TO
  : "e2e-record@example.com";
if (!mailRecipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailRecipient))
  throw new Error(
    "E2E_MAIL_TO muss eine ausdrücklich gewählte Testempfängeradresse enthalten. Der Test sendet eine Einladung dorthin.",
  );
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
});
await client.connect();
const run = randomUUID().slice(0, 8);
const password = randomBytes(24).toString("base64url");
let passed = 0;
function pass(message) {
  passed++;
  console.log(`PASS ${message}`);
}
class BrowserSession {
  cookies = new Map();
  async request(path, { method = "GET", body } = {}) {
    const headers = { Origin: base };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.cookies.size)
      headers.Cookie = Array.from(this.cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
    const response = await fetch(new URL(path, base), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    for (const cookie of response.headers.getSetCookie()) {
      const part = cookie.split(";")[0];
      const index = part.indexOf("=");
      const key = part.slice(0, index),
        value = part.slice(index + 1);
      if (value) this.cookies.set(key, value);
      else this.cookies.delete(key);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    let json;
    try {
      json = JSON.parse(text);
    } catch {}
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      bytes,
      json,
      text,
      location: response.headers.get("location"),
    };
  }
}
async function invitation(
  email,
  name,
  role,
  ownerId = null,
  tenantId = null,
  expired = false,
) {
  const token = newInvitationToken();
  await client.query(
    "INSERT INTO hausportal.invitations(id,email,name,role,owner_id,tenant_id,token_hash,expires_at,delivery_status) VALUES($1,$2,$3,$4,$5,$6,$7,now()+($8*interval '1 day'),'sent')",
    [
      randomUUID(),
      email,
      name,
      role,
      ownerId,
      tenantId,
      hashInvitationToken(token),
      expired ? -1 : 7,
    ],
  );
  return token;
}
const addresses = {
  admin: `e2e-admin-${run}@example.com`,
  owner: `e2e-owner-${run}@example.com`,
  tenant: `e2e-tenant-${run}@example.com`,
};
const ids = {
  owner: `e2e-owner-${run}`,
  otherOwner: `e2e-other-owner-${run}`,
  property: `e2e-property-${run}`,
  otherProperty: `e2e-other-property-${run}`,
  tenant: `e2e-tenant-${run}`,
  unit: `e2e-unit-${run}`,
  otherUnit: `e2e-other-unit-${run}`,
};
try {
  // Remove only this suite's previous mail fixture on its isolated branch.
  await client.query(
    "DELETE FROM hausportal.owners WHERE id LIKE 'e2e-mail-%' AND email=$1",
    [mailRecipient],
  );
  const anonymous = new BrowserSession();
  assert.equal((await anonymous.request("/api/data")).status, 401);
  pass("Unauthentifizierter Datenzugriff wird mit 401 verweigert");
  const protectedPage = await anonymous.request("/dashboard");
  assert.ok(
    [302, 303, 307, 308].includes(protectedPage.status) &&
      protectedPage.location?.includes("/anmelden"),
  );
  pass("Verwaltungsseite leitet ohne Anmeldung um");
  assert.equal(
    (
      await anonymous.request("/api/auth/sign-up/email", {
        method: "POST",
        body: { email: addresses.owner, name: "Uninvited", password },
      })
    ).status,
    403,
  );
  pass("Freie Registrierung ist gesperrt");
  await client.query(
    "INSERT INTO hausportal.owners(id,name,email) VALUES($1,$2,$3),($4,$5,$6)",
    [
      ids.owner,
      "E2E Eigentümer",
      addresses.owner,
      ids.otherOwner,
      "E2E Fremder Eigentümer",
      `e2e-other-${run}@example.com`,
    ],
  );
  await client.query(
    "INSERT INTO hausportal.properties(id,name,street,postal_code,city,owner_id) VALUES($1,$2,'Teststraße 1','10115','Berlin',$3),($4,$5,'Andere Straße 2','10115','Berlin',$6)",
    [
      ids.property,
      `Eigenes Haus ${run}`,
      ids.owner,
      ids.otherProperty,
      `Fremdes Haus ${run}`,
      ids.otherOwner,
    ],
  );
  await client.query(
    "INSERT INTO hausportal.units(id,name,property_id) VALUES($1,'EG links',$2),($3,'Fremde Einheit',$4)",
    [ids.unit, ids.property, ids.otherUnit, ids.otherProperty],
  );
  await client.query(
    "INSERT INTO hausportal.tenants(id,name,email,unit_id) VALUES($1,'E2E Mieter',$2,$3)",
    [ids.tenant, addresses.tenant, ids.unit],
  );
  const tokens = {
    admin: await invitation(addresses.admin, "E2E Administrator", "admin"),
    owner: await invitation(
      addresses.owner,
      "E2E Eigentümer",
      "owner",
      ids.owner,
    ),
    tenant: await invitation(
      addresses.tenant,
      "E2E Mieter",
      "tenant",
      null,
      ids.tenant,
    ),
  };
  assert.equal(
    Number(
      (
        await client.query(
          'SELECT count(*) FROM neon_auth."user" WHERE email=ANY($1::text[])',
          [Object.values(addresses)],
        )
      ).rows[0].count,
    ),
    0,
  );
  assert.equal(
    Number(
      (
        await client.query(
          "SELECT count(*) FROM hausportal.users WHERE email=ANY($1::text[])",
          [Object.values(addresses)],
        )
      ).rows[0].count,
    ),
    0,
  );
  pass("Einladungen erzeugen vor Passwortvergabe keine Benutzer");
  const sessions = {
    admin: new BrowserSession(),
    owner: new BrowserSession(),
    tenant: new BrowserSession(),
  };
  for (const role of ["admin", "owner", "tenant"]) {
    const response = await sessions[role].request("/api/invitations/accept", {
      method: "POST",
      body: { token: tokens[role], password },
    });
    assert.equal(
      response.status,
      200,
      `${role}: ${response.status} ${response.json?.error || ""}`,
    );
    assert.equal(
      response.json.redirectTo,
      role === "admin" ? "/dashboard" : "/portal",
    );
    const session = await sessions[role].request("/api/me");
    assert.equal(session.status, 200);
    assert.equal(session.json.user.role, role);
    assert.equal(
      (await sessions[role].request("/api/me")).json.user.id,
      session.json.user.id,
    );
    pass(
      `Neon Auth: Einladung, Passwort, Session und Wiederaufruf für ${role}`,
    );
  }
  assert.equal(
    Number(
      (
        await client.query(
          'SELECT count(*) FROM neon_auth."user" WHERE email=ANY($1::text[])',
          [Object.values(addresses)],
        )
      ).rows[0].count,
    ),
    3,
  );
  pass("Alle drei Identitäten sind in Neon Auth gespeichert");
  assert.equal(
    (
      await anonymous.request("/api/invitations/accept", {
        method: "POST",
        body: { token: tokens.owner, password },
      })
    ).status,
    410,
  );
  pass("Verwendeter Einladungslink kann nicht erneut eingelöst werden");
  const expiredEmail = `expired-${run}@example.com`;
  const expired = await invitation(
    expiredEmail,
    "Abgelaufen",
    "owner",
    ids.owner,
    null,
    true,
  );
  assert.equal(
    (
      await anonymous.request("/api/invitations/accept", {
        method: "POST",
        body: { token: expired, password },
      })
    ).status,
    410,
  );
  pass("Abgelaufener Einladungslink wird abgelehnt");
  assert.equal(
    Number(
      (
        await client.query(
          'SELECT count(*) FROM neon_auth."user" WHERE email=$1',
          [expiredEmail],
        )
      ).rows[0].count,
    ),
    0,
  );
  for (const role of ["owner", "tenant"]) {
    assert.equal((await sessions[role].request("/api/data")).status, 403);
    assert.equal(
      (
        await sessions[role].request("/api/invitations", {
          method: "POST",
          body: { kind: "owners", contactId: ids.owner },
        })
      ).status,
      403,
    );
    assert.equal(
      (await sessions[role].request("/api/data", { method: "PUT", body: {} }))
        .status,
      403,
    );
    const portal = await sessions[role].request("/portal");
    assert.equal(portal.status, 200);
    assert.ok(portal.text.includes(`Eigenes Haus ${run}`));
    assert.ok(!portal.text.includes(`Fremdes Haus ${run}`));
    assert.ok(portal.text.includes("EG links"));
    assert.ok(!portal.text.includes("Fremde Einheit"));
    assert.ok(
      (await sessions[role].request("/einheiten")).location?.includes(
        "/portal",
      ),
    );
    const adminPage = await sessions[role].request("/dashboard");
    assert.ok(adminPage.location?.includes("/portal"));
    pass(`Berechtigungen und Datentrennung für ${role}`);
  }
  await checkDamages({
    sessions,
    anonymous,
    client,
    ids,
    run,
    pass,
    BrowserSession,
    invitation,
  });
  const snapshot = await sessions.admin.request("/api/data");
  assert.equal(snapshot.status, 200);
  assert.equal(
    (await sessions.admin.request(`/einheiten?gebaeude=${ids.property}`))
      .status,
    200,
  );
  const editTenant = await sessions.admin.request(
    `/mieter/${ids.tenant}/bearbeiten`,
  );
  assert.equal(editTenant.status, 200);
  const unitSelect = editTenant.text.match(
    /<select[^>]*name="unitId"[^>]*>(.*?)<\/select>/s,
  )?.[1];
  assert.ok(unitSelect?.includes(`value="${ids.unit}"`));
  assert.ok(!unitSelect.includes(`value="${ids.otherUnit}"`));
  const newUnit = {
    id: `e2e-new-unit-${run}`,
    name: "DG rechts",
    propertyId: ids.property,
  };
  snapshot.json.data.units.push(newUnit);
  const tenant = snapshot.json.data.tenants.find(
    (record) => record.id === ids.tenant,
  );
  tenant.unitId = ids.otherUnit;
  assert.equal(
    (
      await sessions.admin.request("/api/data", {
        method: "PUT",
        body: { data: snapshot.json.data, revision: snapshot.json.revision },
      })
    ).status,
    400,
  );
  tenant.unitId = newUnit.id;
  snapshot.json.data.owners.push({
    id: `e2e-mail-${run}`,
    name: "E2E Mailversand",
    email: mailRecipient,
    phone: "",
  });
  const saved = await sessions.admin.request("/api/data", {
    method: "PUT",
    body: { data: snapshot.json.data, revision: snapshot.json.revision },
  });
  assert.equal(saved.status, 200);
  assert.equal(
    (await sessions.admin.request("/api/data")).json.data.owners.some(
      (owner) => owner.id === `e2e-mail-${run}`,
    ),
    true,
  );
  const updated = (await sessions.admin.request("/api/data")).json;
  assert.deepEqual(
    updated.data.units.find((unit) => unit.id === newUnit.id),
    newUnit,
  );
  assert.equal(
    updated.data.tenants.find((record) => record.id === ids.tenant).unitId,
    newUnit.id,
  );
  assert.ok(
    (await sessions.tenant.request("/portal")).text.includes("DG rechts"),
  );
  pass("Einheit gespeichert und zugeordnet, gebäudefremde Zuordnung abgelehnt");
  pass(
    "Admin-Datensatz wird per API in Postgres gespeichert und erneut gelesen",
  );
  assert.equal(
    (
      await sessions.admin.request("/api/data", {
        method: "PUT",
        body: { data: snapshot.json.data, revision: snapshot.json.revision },
      })
    ).status,
    409,
  );
  pass("Veraltete Datenstände überschreiben keine neueren Änderungen");
  updated.data.units = updated.data.units.filter(
    (unit) => unit.id !== newUnit.id,
  );
  updated.data.tenants.find((record) => record.id === ids.tenant).unitId = "";
  const removed = await sessions.admin.request("/api/data", {
    method: "PUT",
    body: { data: updated.data, revision: updated.revision },
  });
  assert.equal(removed.status, 200);
  const tenantWithoutUnit = await sessions.tenant.request("/portal");
  assert.ok(tenantWithoutUnit.text.includes(`Eigenes Haus ${run}`));
  assert.ok(tenantWithoutUnit.text.includes("Keine Wohnung zugeordnet."));
  pass("Einheit gelöscht, Mieter und Gebäudezuordnung erhalten");
  await sessions.owner.request("/api/auth/sign-out", {
    method: "POST",
    body: {},
  });
  assert.equal((await sessions.owner.request("/api/me")).status, 401);
  pass("Abmelden beendet den Browserzugang");
  const wrong = await sessions.owner.request("/api/auth/sign-in/email", {
    method: "POST",
    body: { email: addresses.owner, password: "definitely-wrong-password" },
  });
  assert.ok(wrong.status >= 400);
  pass("Falsches Passwort wird abgelehnt");
  const login = await sessions.owner.request("/api/auth/sign-in/email", {
    method: "POST",
    body: { email: addresses.owner, password },
  });
  assert.equal(login.status, 200);
  assert.equal(
    (await sessions.owner.request("/api/me")).json.user.role,
    "owner",
  );
  pass("Erneute Anmeldung mit gesetztem Passwort funktioniert");
  assert.equal(
    (await anonymous.request("/passwort-zuruecksetzen")).status,
    200,
  );
  pass("Passwort-Rücksetzung ist ohne Anmeldung erreichbar");
  if (testMail) {
    const native = await fetch(process.env.NEON_FUNCTION_HELLO_BASE_URL);
    assert.equal(native.status, 401);
    pass("Neon Function verweigert unautorisierte Direktaufrufe");
    const service = await sessions.admin.request("/api/services");
    assert.equal(service.status, 200, service.json?.error);
    assert.equal(service.json.ok, true);
    pass("App → Neon Function → Postgres antwortet erfolgreich");
    const sent = await sessions.admin.request("/api/invitations", {
      method: "POST",
      body: { kind: "owners", contactId: `e2e-mail-${run}` },
    });
    assert.equal(sent.status, 200, sent.json?.error);
    const invitationRow = await client.query(
      "SELECT delivery_status,role FROM hausportal.invitations WHERE owner_id=$1 AND revoked_at IS NULL",
      [`e2e-mail-${run}`],
    );
    assert.equal(invitationRow.rows[0].delivery_status, "sent");
    assert.equal(invitationRow.rows[0].role, "owner");
    pass("Admin → Einladung → Neon Function → SMTP-Versand erfolgreich");
  }
  console.log(
    `E2E erfolgreich: ${passed} Prüfungen bestanden. Ausschließlich isolierter Testbranch verwendet.`,
  );
} finally {
  await client.end();
}
