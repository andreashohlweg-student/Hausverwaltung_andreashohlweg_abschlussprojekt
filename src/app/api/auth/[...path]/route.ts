import { getAuth } from "@/lib/auth/server";
import { assertSameOrigin, errorResponse } from "@/lib/server/access";
const allowed = new Set([
  "sign-in/email",
  "sign-out",
  "get-session",
  "token",
  "request-password-reset",
  "reset-password",
  "email-otp/send-verification-otp",
  "email-otp/verify-email",
]);
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  const path = (await context.params).path.join("/");
  if (!allowed.has(path))
    return Response.json({ error: "Nicht verfügbar." }, { status: 403 });
  return getAuth().handler().GET(request, context);
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const path = (await context.params).path.join("/");
    // Signup is only invoked server-side after validating a single-use invitation.
    if (!allowed.has(path))
      return Response.json(
        { error: "Registrierung ist nur per Einladung möglich." },
        { status: 403 },
      );
    return getAuth().handler().POST(request, context);
  } catch (error) {
    return errorResponse(error);
  }
}
