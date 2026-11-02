import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  newInvitationToken,
  hashInvitationToken,
} from "../src/lib/invitation-token.ts";
process.loadEnvFile(".env.local");
const {
  BOOTSTRAP_ADMIN_EMAIL: email,
  APP_URL,
  DATABASE_URL,
  NEON_FUNCTION_HELLO_BASE_URL,
  FUNCTION_ORIGIN_SECRET,
} = process.env;
if (
  !email ||
  !APP_URL ||
  !DATABASE_URL ||
  !NEON_FUNCTION_HELLO_BASE_URL ||
  !FUNCTION_ORIGIN_SECRET
)
  throw new Error(
    "Admin-Adresse, App-URL und Mailversand müssen eingerichtet sein.",
  );
const mailCheck = await fetch(
  new URL("smtp-check", NEON_FUNCTION_HELLO_BASE_URL),
  {
    headers: { "x-secret": FUNCTION_ORIGIN_SECRET },
    redirect: "manual",
    signal: AbortSignal.timeout(25000),
  },
);
if (!mailCheck.ok)
  throw new Error(
    "Der SMTP-Versand der Neon Function ist noch nicht bereit. Bitte zuerst npm run smtp:check ausführen.",
  );
const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
let id;
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(72194602)");
  const existing = await client.query(
    "SELECT id FROM hausportal.users WHERE role='admin' AND active=true",
  );
  if (existing.rowCount)
    throw new Error(
      "Ein Administrator besteht bereits. Keine neue Bootstrap-Einladung erzeugt.",
    );
  const token = newInvitationToken();
  id = randomUUID();
  await client.query(
    "UPDATE hausportal.invitations SET revoked_at=now() WHERE role='admin' AND accepted_at IS NULL AND revoked_at IS NULL",
  );
  await client.query(
    "INSERT INTO hausportal.invitations(id,email,name,role,token_hash,expires_at) VALUES($1,$2,'Administrator','admin',$3,now()+interval '7 days')",
    [id, email.toLowerCase(), hashInvitationToken(token)],
  );
  await client.query("COMMIT");
  const sent = await fetch(NEON_FUNCTION_HELLO_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-secret": FUNCTION_ORIGIN_SECRET,
    },
    body: JSON.stringify({ invitationId: id, token }),
    redirect: "manual",
    signal: AbortSignal.timeout(25000),
  });
  if (!sent.ok)
    throw new Error(
      "Die Administrator-Einladung konnte nicht über SMTP versendet werden.",
    );
  await client.query(
    "UPDATE hausportal.invitations SET delivery_status='sent' WHERE id=$1",
    [id],
  );
  console.log(
    `Administrator-Einladung an ${email} versendet. Passwort wird ausschließlich vom Empfänger gesetzt.`,
  );
} catch (error) {
  await client.query("ROLLBACK");
  if (id)
    await client.query(
      "UPDATE hausportal.invitations SET delivery_status='failed' WHERE id=$1",
      [id],
    );
  throw error;
} finally {
  await client.end();
}
