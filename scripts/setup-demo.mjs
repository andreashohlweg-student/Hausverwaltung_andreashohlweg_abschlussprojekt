import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, chmod } from "node:fs/promises";
import pg from "pg";
import {
  newInvitationToken,
  hashInvitationToken,
} from "../src/lib/invitation-token.ts";

process.loadEnvFile(".env.local");
const base = new URL(process.env.APP_URL).origin;
const connection = new URL(process.env.DATABASE_URL_UNPOOLED);
connection.searchParams.set("sslmode", "verify-full");
const stateFile = process.env.DEMO_ACCOUNTS_FILE || ".demo-accounts.local.json";
const scope = `${connection.hostname}${connection.pathname}|${base}`;
const accounts = [
  {
    role: "admin",
    label: "Verwaltung",
    email: "demo.admin@example.com",
    name: "Demo Verwaltung",
    ownerId: null,
    tenantId: null,
  },
  {
    role: "owner",
    label: "Eigentümer",
    email: "clara.hoffmann@example.com",
    name: "Clara Hoffmann",
    ownerId: "owner-1",
    tenantId: null,
  },
  {
    role: "tenant",
    label: "Mieter",
    email: "anna.schneider@example.com",
    name: "Anna Schneider",
    ownerId: null,
    tenantId: "tenant-1",
  },
];
let state;
try {
  state = JSON.parse(await readFile(stateFile, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (state) {
  assert.equal(
    state.scope,
    scope,
    "Die gespeicherten Demozugänge gehören zu einer anderen Datenbank oder App.",
  );
  for (const account of accounts) {
    assert.equal(state.accounts[account.role]?.email, account.email);
    assert.ok(
      typeof state.accounts[account.role]?.password === "string" &&
        state.accounts[account.role].password.length >= 12,
    );
  }
} else {
  state = {
    scope,
    accounts: Object.fromEntries(
      accounts.map((account) => [
        account.role,
        {
          email: account.email,
          password: `Demo-2026-${randomBytes(5).toString("hex")}!`,
        },
      ]),
    ),
  };
  await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
}
await chmod(stateFile, 0o600);
class Session {
  cookies = new Map();
  async request(path, method = "GET", body) {
    const headers = { Origin: base };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.cookies.size)
      headers.Cookie = [...this.cookies]
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
    const response = await fetch(new URL(path, base), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const index = pair.indexOf("=");
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    let data;
    if (response.headers.get("content-type")?.includes("application/json"))
      data = JSON.parse(new TextDecoder().decode(bytes));
    return { status: response.status, data, bytes };
  }
  async ok(path, method = "GET", body) {
    const result = await this.request(path, method, body);
    assert.equal(
      result.status,
      200,
      `${method} ${path}: ${result.status} ${result.data?.error ?? ""}`,
    );
    return result;
  }
}
const client = new pg.Client({ connectionString: connection.href });
await client.connect();
const sessions = {};
const memberships = {};
try {
  // This setup is separate from SQL migrations because identities use the existing invitation flow.
  const contacts =
    await client.query(`SELECT o.id AS owner_id,t.id AS tenant_id FROM hausportal.owners o
    JOIN hausportal.properties p ON p.owner_id=o.id JOIN hausportal.units u ON u.property_id=p.id
    JOIN hausportal.tenants t ON t.unit_id=u.id
    WHERE o.id='owner-1' AND lower(o.email)='clara.hoffmann@example.com'
    AND t.id='tenant-1' AND lower(t.email)='anna.schneider@example.com'`);
  assert.equal(
    contacts.rowCount,
    1,
    "Zuerst die Beispieldaten migrieren und die Zuordnung von Clara und Anna prüfen.",
  );
  for (const account of accounts) {
    const existing = (
      await client.query(
        "SELECT id,role,owner_id,tenant_id,active FROM hausportal.users WHERE lower(email)=lower($1)",
        [account.email],
      )
    ).rows[0];
    const session = new Session();
    const password = state.accounts[account.role].password;
    if (existing) {
      assert.equal(
        existing.role,
        account.role,
        "Vorhandener Zugang hat eine andere Rolle.",
      );
      assert.equal(existing.owner_id, account.ownerId);
      assert.equal(existing.tenant_id, account.tenantId);
      assert.equal(
        existing.active,
        true,
        "Vorhandener Demozugang ist deaktiviert.",
      );
      await session.ok("/api/auth/sign-in/email", "POST", {
        email: account.email,
        password,
      });
    } else {
      const token = newInvitationToken();
      await client.query("BEGIN");
      try {
        await client.query(
          `UPDATE hausportal.invitations SET revoked_at=now() WHERE lower(email)=lower($1) AND role=$2
          AND owner_id IS NOT DISTINCT FROM $3::text AND tenant_id IS NOT DISTINCT FROM $4::text
          AND accepted_at IS NULL AND revoked_at IS NULL`,
          [account.email, account.role, account.ownerId, account.tenantId],
        );
        await client.query(
          `INSERT INTO hausportal.invitations(id,email,name,role,owner_id,tenant_id,token_hash,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '1 day')`,
          [
            randomUUID(),
            account.email,
            account.name,
            account.role,
            account.ownerId,
            account.tenantId,
            hashInvitationToken(token),
          ],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      await session.ok("/api/invitations/accept", "POST", { token, password });
    }
    const membership = (await session.ok("/api/me")).data.user;
    assert.equal(membership.role, account.role);
    sessions[account.role] = session;
    memberships[account.role] = membership;
    await session.ok(account.role === "admin" ? "/dashboard" : "/portal");
    console.log(`PASS Anmeldung und Ansicht für ${account.label}`);
  }
  const examples = [
    {
      id: "7a018b8c-6b25-4d52-8ca2-08849cf58ef3",
      description:
        "Der Heizkörper im Wohnzimmer bleibt kalt, obwohl das Thermostat aufgedreht ist.",
      status: "in_progress",
      question: "Sind die anderen Heizkörper in der Wohnung warm?",
      answer:
        "Ja, Küche und Schlafzimmer werden warm. Nur der Heizkörper im Wohnzimmer bleibt kalt.",
    },
    {
      id: "f7bdf9f2-a00d-4bcf-b80f-51cdb337b667",
      description:
        "Der Wasserhahn in der Küche tropft auch bei geschlossenem Griff.",
      status: "invoiced",
      question: "Seit wann tropft der Wasserhahn?",
      answer: "Seit Montag. Das Wasser läuft direkt ins Spülbecken.",
    },
  ];
  const admin = sessions.admin,
    owner = sessions.owner,
    tenant = sessions.tenant;
  for (const [index, example] of examples.entries()) {
    const existingCase = (
      await client.query(
        "SELECT reporter_id,description FROM hausportal.damages WHERE id=$1",
        [example.id],
      )
    ).rows[0];
    if (existingCase) {
      assert.equal(
        existingCase.reporter_id,
        memberships.tenant.id,
        "Der Beispiel-Fall gehört zu einem anderen Konto.",
      );
      assert.equal(
        existingCase.description,
        example.description,
        "Der Beispiel-Fall wurde verändert.",
      );
    }
    const messageId = (number) =>
      example.id.slice(0, -4) + String(number).padStart(4, "0");
    const initialized = state.examples?.[example.id] === true;
    if (!initialized) {
      await tenant.ok("/api/damages", "POST", {
        id: example.id,
        description: example.description,
        language: "de",
      });
      let report = (await admin.ok(`/api/damages/${example.id}`)).data.report;
      if (
        report.status === "created" ||
        (report.status === "in_progress" &&
          report.assigneeId !== memberships.admin.id)
      ) {
        await admin.ok(`/api/damages/${example.id}`, "PATCH", {
          action: "claim",
          version: report.version,
        });
      }
      report = (await admin.ok(`/api/damages/${example.id}`)).data.report;
      await admin.ok(`/api/damages/${example.id}`, "PATCH", {
        action: "update",
        version: report.version,
        serviceOrdered: true,
      });
      await admin.ok(`/api/damages/${example.id}/messages`, "POST", {
        id: messageId(1),
        channel: "tenant",
        body: example.question,
      });
      await tenant.ok(`/api/damages/${example.id}/messages`, "POST", {
        id: messageId(2),
        channel: "tenant",
        body: example.answer,
      });
      if (example.status === "invoiced") {
        report = (await admin.ok(`/api/damages/${example.id}`)).data.report;
        if (report.status === "in_progress") {
          const { ownerAssignmentId } = (
            await owner.ok(`/api/damages/${example.id}`)
          ).data;
          await owner.ok(`/api/damages/${example.id}/messages`, "POST", {
            id: messageId(3),
            channel: "owner",
            ownerAssignmentId,
            body: "Sind Material und Montage für den Austausch eingeplant?",
          });
          await admin.ok(`/api/damages/${example.id}/messages`, "POST", {
            id: messageId(4),
            channel: "owner",
            ownerAssignmentId,
            body: "Ja, Material und Montage sind eingeplant.",
          });
          const serviceDate = new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Europe/Berlin",
          }).format(new Date());
          await admin.ok(`/api/damages/${example.id}`, "PATCH", {
            action: "update",
            version: report.version,
            status: "invoiced",
            invoice: {
              issuer:
                "Beispiel Hausverwaltung GmbH\nVerwaltungsstraße 10\n10115 Berlin",
              taxId: "DE000000000",
              recipientAddress: "Eigentümerstraße 5\n10405 Berlin",
              serviceDate,
              service:
                "Austausch des defekten Küchenwasserhahns einschließlich Material und Montage.",
              netCents: 12050,
              taxBasisPoints: 1900,
              taxNote: "",
              paymentDetails: "Zahlbar innerhalb von 14 Tagen.",
            },
          });
        }
      }
    }
    state.examples ??= {};
    state.examples[example.id] = true;
    await writeFile(stateFile, JSON.stringify(state, null, 2) + "\n", {
      mode: 0o600,
    });
    const report = (await admin.ok(`/api/damages/${example.id}`)).data.report;
    await tenant.ok(`/portal/schaeden/${example.id}`);
    await owner.ok(`/portal/schaeden/${example.id}`);
    await admin.ok(`/schaeden/${example.id}`);
    if (report.invoiceNumber) {
      const pdf = await owner.ok(`/api/damages/${example.id}/invoice`);
      assert.equal(Buffer.from(pdf.bytes).subarray(0, 5).toString(), "%PDF-");
      assert.equal(
        (await tenant.request(`/api/damages/${example.id}/invoice`)).status,
        403,
      );
    }
    console.log(
      `PASS Beispiel ${index + 1}: Fallansicht für alle drei Rollen${report.invoiceNumber ? " und Eigentümer-PDF" : ""}`,
    );
  }
  console.table(
    accounts.map((account) => ({
      Rolle: account.label,
      "E-Mail": account.email,
      Passwort: state.accounts[account.role].password,
    })),
  );
  console.log(`Anmeldung: ${base}/anmelden`);
} finally {
  await client.end();
}
