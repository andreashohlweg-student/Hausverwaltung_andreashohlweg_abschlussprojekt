import { assertSameOrigin, errorResponse } from "@/lib/server/access";
import {
  damageApiUser,
  damageBody,
  damageHeaders,
} from "@/lib/server/damage-http";
import { createDamage, listDamages } from "@/lib/server/damages";
import { newDamageRequest } from "@/lib/server/damage-validation";
import { rateLimit } from "@/lib/server/rate-limit";
export async function GET() {
  try {
    return Response.json(
      { reports: await listDamages(await damageApiUser()) },
      { headers: damageHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await damageApiUser();
    const input = await damageBody(request, newDamageRequest);
    await rateLimit(`damage:${user.id}`, 30, 600);
    return Response.json(
      { id: await createDamage(user, input) },
      { headers: damageHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
