import "server-only";
import { z } from "zod";
import { getCurrentUser, RequestError } from "./access";
export async function damageApiUser() {
  const user = await getCurrentUser();
  if (!user) throw new RequestError("Bitte anmelden.", 401);
  return user;
}
export function damageId(value: string) {
  if (!z.uuid().safeParse(value).success)
    throw new RequestError("Schadensmeldung nicht gefunden.", 404);
  return value;
}
export async function damageBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const text = await request.text();
  if (text.length > 40000) throw new RequestError("Zu viele Daten.", 413);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RequestError("Ungültige Anfrage.", 400);
  }
  const result = schema.safeParse(value);
  if (!result.success)
    throw new RequestError("Bitte prüfe die eingegebenen Daten.", 400);
  return result.data;
}
export const damageHeaders = { "Cache-Control": "private, no-store" };
