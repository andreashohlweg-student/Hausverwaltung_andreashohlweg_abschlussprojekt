import "server-only";
import { randomUUID } from "node:crypto";
import { getAuth } from "@/lib/auth/server";
import {
  hashInvitationToken,
  newInvitationToken,
} from "@/lib/invitation-token";
import type { AppUser } from "@/lib/account";
import { getPool, transaction, lockApplicationState } from "./db";
import { RequestError } from "./errors";
import { requireAdministrator } from "./policies/accounts";
import { rateLimit } from "./rate-limit";
import * as accounts from "./repositories/accounts";

export async function findInvitation(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return accounts.findInvitation(getPool(), hashInvitationToken(token));
}

export async function inviteContact(
  kind: "owners" | "tenants",
  contactId: string,
  admin: AppUser,
) {
  requireAdministrator(admin);
  if (
    !process.env.FUNCTION_ORIGIN_SECRET ||
    !process.env.NEON_FUNCTION_HELLO_BASE_URL
  )
    throw new RequestError(
      "Der E-Mail-Versand ist noch nicht eingerichtet.",
      503,
    );
  await rateLimit(`invite:${kind}:${contactId}`, 5, 600);
  const token = newInvitationToken();
  const id = randomUUID();
  await transaction(async (client) => {
    await lockApplicationState(client);
    const contact = await accounts.findContact(client, kind, contactId);
    if (!contact) throw new RequestError("Kontakt nicht gefunden.", 404);
    await accounts.lockInvitationEmail(client, contact.email);
    if (await accounts.findActiveUserByEmail(client, contact.email))
      throw new RequestError(
        "Für diese E-Mail-Adresse besteht bereits ein aktiver Zugang.",
        409,
      );
    await accounts.replaceInvitation(
      client,
      {
        id,
        email: contact.email.toLowerCase(),
        name: contact.name,
        role: kind === "owners" ? "owner" : "tenant",
        owner_id: kind === "owners" ? contact.id : null,
        tenant_id: kind === "tenants" ? contact.id : null,
      },
      hashInvitationToken(token),
      admin.id,
    );
  });
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
    await accounts.markInvitationDelivery(getPool(), id, "failed");
    throw new RequestError(
      "Die Einladung konnte nicht versendet werden. Bitte prüfe die Absenderkonfiguration und versuche es erneut.",
      502,
    );
  }
}

export async function acceptInvitation(token: string, password: string) {
  await rateLimit(`accept:${hashInvitationToken(token)}`, 12, 900);
  return transaction(async (client) => {
    await lockApplicationState(client);
    const invitation = await accounts.findInvitation(
      client,
      hashInvitationToken(token),
      true,
    );
    if (!invitation)
      throw new RequestError(
        "Dieser Einladungslink ist ungültig, abgelaufen oder bereits verwendet.",
        410,
      );
    if (await accounts.findActiveUserByEmail(client, invitation.email))
      throw new RequestError(
        "Dieser Zugang wurde bereits aktiviert. Bitte melde dich an.",
        409,
      );
    if (invitation.role !== "admin") {
      const kind = invitation.role === "owner" ? "owners" : "tenants";
      const contactId =
        invitation.role === "owner"
          ? invitation.owner_id
          : invitation.tenant_id;
      const contact = contactId
        ? await accounts.findContact(client, kind, contactId)
        : null;
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
    // Auth is a separate service. A retry can recover an identity created before a DB rollback.
    if (!identity)
      identity = (
        await getAuth().signIn.email({ email: invitation.email, password })
      ).data?.user;
    if (
      !identity ||
      identity.email.toLowerCase() !== invitation.email.toLowerCase()
    )
      throw new RequestError(
        "Der Zugang konnte nicht aktiviert werden. Falls bereits ein Konto besteht, verwende dessen Passwort.",
        400,
      );
    await accounts.activateUser(client, identity.id, invitation);
    return invitation.role === "admin" ? "/dashboard" : "/portal";
  });
}
