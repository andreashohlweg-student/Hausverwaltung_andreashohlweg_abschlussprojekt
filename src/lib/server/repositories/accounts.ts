import "server-only";
import type { AppRole, AppUser } from "@/lib/account";
import type { DatabaseClient } from "../db";

export interface Invitation {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  owner_id: string | null;
  tenant_id: string | null;
}
export async function findActiveUser(client: DatabaseClient, id: string) {
  const { rows } = await client.query<AppUser>(
    `SELECT id,email,name,role,owner_id AS "ownerId",tenant_id AS "tenantId"
    FROM hausportal.users WHERE id=$1 AND active`,
    [id],
  );
  return rows[0] ?? null;
}
export async function findActiveUserByEmail(
  client: DatabaseClient,
  email: string,
) {
  return (
    await client.query(
      "SELECT id FROM hausportal.users WHERE active AND lower(email)=lower($1)",
      [email],
    )
  ).rows[0];
}
export async function findContact(
  client: DatabaseClient,
  kind: "owners" | "tenants",
  id: string,
) {
  return (
    await client.query<{ id: string; name: string; email: string }>(
      `SELECT id,name,email FROM hausportal.${kind} WHERE id=$1 FOR SHARE`,
      [id],
    )
  ).rows[0];
}
export async function findInvitation(
  client: DatabaseClient,
  hash: string,
  lock = false,
) {
  return (
    (
      await client.query<Invitation>(
        `SELECT id,email,name,role,owner_id,tenant_id FROM hausportal.invitations
    WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() ${lock ? "FOR UPDATE" : ""}`,
        [hash],
      )
    ).rows[0] ?? null
  );
}
export async function lockInvitationEmail(
  client: DatabaseClient,
  email: string,
) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    email.toLowerCase(),
  ]);
}
export async function replaceInvitation(
  client: DatabaseClient,
  invitation: Invitation,
  hash: string,
  adminId: string,
) {
  await client.query(
    "UPDATE hausportal.invitations SET revoked_at=now() WHERE lower(email)=lower($1) AND accepted_at IS NULL AND revoked_at IS NULL",
    [invitation.email],
  );
  await client.query(
    `INSERT INTO hausportal.invitations(id,email,name,role,owner_id,tenant_id,token_hash,expires_at,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '7 days',$8)`,
    [
      invitation.id,
      invitation.email,
      invitation.name,
      invitation.role,
      invitation.owner_id,
      invitation.tenant_id,
      hash,
      adminId,
    ],
  );
}
export async function markInvitationDelivery(
  client: DatabaseClient,
  id: string,
  status: "failed" | "sent",
) {
  await client.query(
    "UPDATE hausportal.invitations SET delivery_status=$2 WHERE id=$1",
    [id, status],
  );
}
export async function activateUser(
  client: DatabaseClient,
  id: string,
  invitation: Invitation,
) {
  await client.query(
    `INSERT INTO hausportal.users(id,email,name,role,owner_id,tenant_id,active) VALUES($1,$2,$3,$4,$5,$6,true)
    ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,role=excluded.role,owner_id=excluded.owner_id,tenant_id=excluded.tenant_id,active=true`,
    [
      id,
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
}
export async function incrementRateLimit(
  client: DatabaseClient,
  key: string,
  seconds: number,
) {
  const { rows } = await client.query<{ attempts: number }>(
    `INSERT INTO hausportal.rate_limits(key,window_start,attempts) VALUES($1,now(),1)
    ON CONFLICT(key) DO UPDATE SET
      attempts=CASE WHEN hausportal.rate_limits.window_start<now()-($2*interval '1 second') THEN 1 ELSE hausportal.rate_limits.attempts+1 END,
      window_start=CASE WHEN hausportal.rate_limits.window_start<now()-($2*interval '1 second') THEN now() ELSE hausportal.rate_limits.window_start END
    RETURNING attempts`,
    [key, seconds],
  );
  return rows[0].attempts;
}
