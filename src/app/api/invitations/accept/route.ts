import {
  assertSameOrigin,
  errorResponse,
  RequestError,
} from "@/lib/server/access";
import { acceptRequest } from "@/lib/server/validation";
import { acceptInvitation } from "@/lib/server/invitations";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = acceptRequest.safeParse(await request.json());
    if (!parsed.success)
      throw new RequestError(
        "Bitte verwende ein Passwort mit mindestens 12 und höchstens 128 Zeichen.",
        400,
      );
    const redirectTo = await acceptInvitation(
      parsed.data.token,
      parsed.data.password,
    );
    return Response.json({ redirectTo });
  } catch (error) {
    return errorResponse(error);
  }
}
