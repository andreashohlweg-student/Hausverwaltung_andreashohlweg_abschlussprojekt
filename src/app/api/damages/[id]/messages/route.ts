import { assertSameOrigin, errorResponse } from "@/lib/server/access";
import {
  damageApiUser,
  damageBody,
  damageHeaders,
  damageId,
} from "@/lib/server/damage-http";
import { addDamageMessage } from "@/lib/server/damages";
import { damageMessageRequest } from "@/lib/server/damage-validation";
import { rateLimit } from "@/lib/server/invitations";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await damageApiUser();
    const id = damageId((await params).id);
    await rateLimit(`damage-message:${user.id}`, 60, 600);
    await addDamageMessage(
      id,
      user,
      await damageBody(request, damageMessageRequest),
    );
    return Response.json({ ok: true }, { headers: damageHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
