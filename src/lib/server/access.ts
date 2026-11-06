import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/server";
import { getPool } from "./db";
import type { AppUser } from "@/lib/account";
import { findActiveUser } from "./repositories/accounts";
import { RequestError } from "./errors";
export { RequestError } from "./errors";

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) return null;
  return findActiveUser(getPool(), session.user.id);
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
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  if (code === "23505")
    return Response.json(
      { error: "Ein Eintrag mit diesen eindeutigen Daten besteht bereits." },
      { status: 409 },
    );
  if (code === "23503" || code === "23001")
    return Response.json(
      {
        error: "Der Eintrag ist noch verknüpft oder wurde inzwischen entfernt.",
      },
      { status: 409 },
    );
  if (code === "23514" || code === "23502")
    return Response.json(
      { error: "Die Daten verletzen eine Zuordnungsregel." },
      { status: 400 },
    );
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
