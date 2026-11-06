import "server-only";
import { hashInvitationToken } from "@/lib/invitation-token";
import { getPool } from "./db";
import { incrementRateLimit } from "./repositories/accounts";
import { RequestError } from "./errors";

export async function rateLimit(key: string, limit: number, seconds: number) {
  if (
    (await incrementRateLimit(getPool(), hashInvitationToken(key), seconds)) >
    limit
  )
    throw new RequestError(
      "Zu viele Versuche. Bitte versuche es später erneut.",
      429,
    );
}
