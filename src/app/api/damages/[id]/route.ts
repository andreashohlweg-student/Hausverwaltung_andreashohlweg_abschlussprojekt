import { assertSameOrigin, errorResponse } from "@/lib/server/access";
import {
  damageApiUser,
  damageBody,
  damageHeaders,
  damageId,
} from "@/lib/server/damage-http";
import { loadDamage, updateDamage } from "@/lib/server/damages";
import { damageUpdateRequest } from "@/lib/server/damage-validation";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await damageApiUser();
    return Response.json(await loadDamage(damageId((await params).id), user), {
      headers: damageHeaders,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await damageApiUser();
    const id = damageId((await params).id);
    await updateDamage(
      id,
      user,
      await damageBody(request, damageUpdateRequest),
    );
    return Response.json({ ok: true }, { headers: damageHeaders });
  } catch (error) {
    return errorResponse(error);
  }
}
