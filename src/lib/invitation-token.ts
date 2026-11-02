import { createHash, randomBytes } from "node:crypto";
export function newInvitationToken() {
  return randomBytes(32).toString("hex");
}
export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
