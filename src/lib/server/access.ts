import { cache } from "react";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { getPool } from "./db";
import type { AppUser } from "@/lib/account";

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) return null;
  const { rows } = await getPool().query<AppUser>(
    'SELECT id, email, name, role, owner_id AS "ownerId", tenant_id AS "tenantId" FROM hausportal.users WHERE id=$1 AND active=true',
    [session.user.id],
  );
  return rows[0] ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/anmelden");
  return user;
}
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/portal");
  return user;
}

export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL;
  const actual = new URL(request.url).origin;
  if (
    !origin ||
    (origin !== actual && (!expected || origin !== new URL(expected).origin))
  ) {
    throw new RequestError("Anfrage nicht erlaubt.", 403);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof RequestError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error("Hausportal-Anfrage fehlgeschlagen.");
  return Response.json(
    { error: "Die Anfrage konnte nicht verarbeitet werden." },
    { status: 500 },
  );
}
export async function apiAdmin() {
  const user = await getCurrentUser();
  if (!user) throw new RequestError("Bitte anmelden.", 401);
  if (user.role !== "admin") throw new RequestError("Keine Berechtigung.", 403);
  return user;
}
