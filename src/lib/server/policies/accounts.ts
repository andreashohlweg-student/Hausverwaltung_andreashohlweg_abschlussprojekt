import "server-only";
import type { AppUser } from "@/lib/account";
import { RequestError } from "../errors";

export function requireAdministrator(user: AppUser) {
  if (user.role !== "admin") throw new RequestError("Keine Berechtigung.", 403);
}
