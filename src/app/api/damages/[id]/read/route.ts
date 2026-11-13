import { z } from "zod";
import { assertSameOrigin, errorResponse } from "@/lib/server/access";
import {
  damageApiUser,
  damageBody,
  damageHeaders,
  damageId,
} from "@/lib/server/damage-http";
import { markDamageMessagesRead } from "@/lib/server/damages";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await damageApiUser();
    const id = damageId((await params).id);
    const body = await damageBody(
      request,
      z.object({ messageIds: z.array(z.uuid()).max(500) }),
    );
    await markDamageMessagesRead(id, user, body.messageIds);
    return Response.json({ ok: true }, { headers: damageHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
