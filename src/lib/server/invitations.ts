import { randomUUID } from "node:crypto";
import { getAuth } from "@/lib/auth/server";
import {
  hashInvitationToken,
  newInvitationToken,
} from "@/lib/invitation-token";
import type { AppRole, AppUser } from "@/lib/account";
import { getPool } from "./db";
import { RequestError } from "./access";

interface Invitation {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  owner_id: string | null;
  tenant_id: string | null;
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const { rows } = await getPool().query(
    `
    INSERT INTO hausportal.rate_limits(key,window_start,attempts) VALUES($1,now(),1)
    ON CONFLICT(key) DO UPDATE SET
      attempts=CASE WHEN hausportal.rate_limits.window_start < now()-($2*interval '1 second') THEN 1 ELSE hausportal.rate_limits.attempts+1 END,
      window_start=CASE WHEN hausportal.rate_limits.window_start < now()-($2*interval '1 second') THEN now() ELSE hausportal.rate_limits.window_start END
    RETURNING attempts`,
    [hashInvitationToken(key), seconds],
  );
  if (Number(rows[0].attempts) > limit)
    throw new RequestError(
      "Zu viele Versuche. Bitte versuche es später erneut.",
      429,
    );
}

export async function findInvitation(
  token: string,
): Promise<Invitation | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const { rows } = await getPool().query<Invitation>(
    "SELECT id,email,name,role,owner_id,tenant_id FROM hausportal.invitations WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()",
    [hashInvitationToken(token)],
  );
  return rows[0] ?? null;
}

export async function inviteContact(
  kind: "owners" | "tenants",
  contactId: string,
  admin: AppUser,
) {
  if (
    !process.env.FUNCTION_ORIGIN_SECRET ||
    !process.env.NEON_FUNCTION_HELLO_BASE_URL
  )
    throw new RequestError(
      "Der E-Mail-Versand ist noch nicht eingerichtet.",
      503,
    );
  await rateLimit(`invite:${kind}:${contactId}`, 5, 600);
  const contact = (
    await getPool().query(
      `SELECT id,name,email FROM hausportal.${kind} WHERE id=$1`,
      [contactId],
    )
  ).rows[0];
  if (!contact) throw new RequestError("Kontakt nicht gefunden.", 404);
  const existing = (
    await getPool().query(
      "SELECT id FROM hausportal.users WHERE active=true AND lower(email)=lower($1)",
      [contact.email],
    )
  ).rows[0];
  if (existing)
    throw new RequestError(
      "Für diese E-Mail-Adresse besteht bereits ein aktiver Zugang.",
      409,
    );
  const token = newInvitationToken();
  const id = randomUUID();
  const role = kind === "owners" ? "owner" : "tenant";
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      contact.email.toLowerCase(),
    ]);
    await client.query(
      "UPDATE hausportal.invitations SET revoked_at=now() WHERE lower(email)=lower($1) AND accepted_at IS NULL AND revoked_at IS NULL",
      [contact.email],
    );
    await client.query(
      "INSERT INTO hausportal.invitations(id,email,name,role,owner_id,tenant_id,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '7 days',$8)",
      [
        id,
        contact.email.toLowerCase(),
        contact.name,
        role,
        kind === "owners" ? contact.id : null,
        kind === "tenants" ? contact.id : null,
        hashInvitationToken(token),
        admin.id,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  try {
    const response = await fetch(process.env.NEON_FUNCTION_HELLO_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-secret": process.env.FUNCTION_ORIGIN_SECRET,
      },
      body: JSON.stringify({ invitationId: id, token }),
      redirect: "manual",
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error("Mail delivery rejected");
  } catch {
    await getPool().query(
      "UPDATE hausportal.invitations SET delivery_status='failed' WHERE id=$1",
      [id],
    );
    throw new RequestError(
      "Die Einladung konnte nicht versendet werden. Bitte prüfe die Absenderkonfiguration und versuche es erneut.",
      502,
    );
  }
}

export async function acceptInvitation(token: string, password: string) {
  await rateLimit(`accept:${hashInvitationToken(token)}`, 12, 900);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<Invitation>(
      "SELECT id,email,name,role,owner_id,tenant_id FROM hausportal.invitations WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE",
      [hashInvitationToken(token)],
    );
    const invitation = rows[0];
    if (!invitation)
      throw new RequestError(
        "Dieser Einladungslink ist ungültig, abgelaufen oder bereits verwendet.",
        410,
      );
    const activeUser = (
      await client.query(
        "SELECT id FROM hausportal.users WHERE active=true AND lower(email)=lower($1)",
        [invitation.email],
      )
    ).rows[0];
    if (activeUser)
      throw new RequestError(
        "Dieser Zugang wurde bereits aktiviert. Bitte melde dich an.",
        409,
      );
    if (invitation.role !== "admin") {
      const table = invitation.role === "owner" ? "owners" : "tenants";
      const contactId =
        invitation.role === "owner"
          ? invitation.owner_id
          : invitation.tenant_id;
      const contact = (
        await client.query(
          `SELECT email FROM hausportal.${table} WHERE id=$1`,
          [contactId],
        )
      ).rows[0];
      if (
        !contact ||
        contact.email.toLowerCase() !== invitation.email.toLowerCase()
      )
        throw new RequestError(
          "Die Kontaktdaten wurden geändert. Bitte fordere eine neue Einladung an.",
          410,
        );
    }
    const created = await getAuth().signUp.email({
      email: invitation.email,
      name: invitation.name,
      password,
    });
    let identity = created.data?.user;
    // Allows the same verified invite to recover after an interrupted activation,
    // or to link an existing Neon identity using its correct password.
    if (!identity) {
      const signedIn = await getAuth().signIn.email({
        email: invitation.email,
        password,
      });
      identity = signedIn.data?.user;
    }
    if (
      !identity ||
      identity.email.toLowerCase() !== invitation.email.toLowerCase()
    )
      throw new RequestError(
        "Der Zugang konnte nicht aktiviert werden. Falls bereits ein Konto besteht, verwende dessen Passwort.",
        400,
      );
    await client.query(
      "INSERT INTO hausportal.users(id,email,name,role,owner_id,tenant_id,active) VALUES($1,$2,$3,$4,$5,$6,true) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,role=excluded.role,owner_id=excluded.owner_id,tenant_id=excluded.tenant_id,active=true",
      [
        identity.id,
        invitation.email,
        invitation.name,
        invitation.role,
        invitation.owner_id,
        invitation.tenant_id,
      ],
    );
    await client.query(
      "UPDATE hausportal.invitations SET accepted_at=now() WHERE id=$1",
      [invitation.id],
    );
    await client.query("COMMIT");
    return invitation.role === "admin" ? "/dashboard" : "/portal";
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
