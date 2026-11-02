import { getCurrentUser, errorResponse } from "@/lib/server/access";
export async function GET() {
  try {
    const user = await getCurrentUser();
    return Response.json(user ? { user } : { error: "Kein aktiver Zugang." }, {
      status: user ? 200 : 401,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
