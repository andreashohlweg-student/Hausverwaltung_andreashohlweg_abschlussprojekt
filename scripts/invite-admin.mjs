import { randomUUID } from "node:crypto";
import pg from "pg";
import { Resend } from "resend";
import {
  newInvitationToken,
  hashInvitationToken,
} from "../src/lib/invitation-token.ts";
process.loadEnvFile(".env.local");
const {
  BOOTSTRAP_ADMIN_EMAIL: email,
  APP_URL,
  RESEND_API_KEY,
  MAIL_FROM,
  DATABASE_URL,
} = process.env;
if (!email || !APP_URL || !RESEND_API_KEY || !MAIL_FROM || !DATABASE_URL)
  throw new Error(
    "Admin-Adresse, App-URL und Mailversand müssen eingerichtet sein.",
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
  const link = new URL(`/einladung/${token}`, APP_URL).href;
  const result = await new Resend(RESEND_API_KEY).emails.send(
    {
      from: MAIL_FROM,
      to: email,
      subject: "Administratorzugang zum Hausportal",
      text: `Lege dein Passwort für den Administratorzugang fest:\n\n${link}\n\nDer Link ist 7 Tage gültig und kann einmal verwendet werden.`,
    },
    { idempotencyKey: `hausportal-admin-${id}` },
  );
  if (result.error) throw new Error(`Resend: ${result.error.message}`);
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
