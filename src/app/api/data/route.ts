import {
  apiAdmin,
  assertSameOrigin,
  errorResponse,
  RequestError,
} from "@/lib/server/access";
import {
  loadDatabase,
  loadAccountStatuses,
  saveDatabase,
} from "@/lib/server/records";
import { saveRequest } from "@/lib/server/validation";

export async function GET() {
  try {
    const user = await apiAdmin();
    return Response.json(
      {
        ...(await loadDatabase(user)),
        accounts: await loadAccountStatuses(user),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await apiAdmin();
    if (Number(request.headers.get("content-length") || 0) > 2_000_000)
      throw new RequestError("Zu viele Daten.", 413);
    const parsed = saveRequest.safeParse(await request.json());
    if (!parsed.success)
      throw new RequestError("Die übermittelten Daten sind ungültig.", 400);
    const revision = await saveDatabase(
      parsed.data.data,
      parsed.data.revision,
      user,
    );
    return Response.json({ revision });
  } catch (error) {
    return errorResponse(error);
  }
}
