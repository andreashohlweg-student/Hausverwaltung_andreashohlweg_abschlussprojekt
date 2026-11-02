import {
  apiAdmin,
  assertSameOrigin,
  errorResponse,
  RequestError,
} from "@/lib/server/access";
import { inviteRequest } from "@/lib/server/validation";
import { inviteContact } from "@/lib/server/invitations";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await apiAdmin();
    const parsed = inviteRequest.safeParse(await request.json());
    if (!parsed.success) throw new RequestError("Ungültige Einladung.", 400);
    await inviteContact(parsed.data.kind, parsed.data.contactId, admin);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
