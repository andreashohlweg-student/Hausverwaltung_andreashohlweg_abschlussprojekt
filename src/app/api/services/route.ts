import { apiAdmin, errorResponse, RequestError } from "@/lib/server/access";
export async function GET() {
  try {
    await apiAdmin();
    const url = process.env.NEON_FUNCTION_HELLO_BASE_URL;
    const secret = process.env.FUNCTION_ORIGIN_SECRET;
    if (!url || !secret)
      throw new RequestError("Dienst nicht konfiguriert.", 503);
    const response = await fetch(url, {
      headers: { "x-secret": secret },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new RequestError("Dienst nicht verfügbar.", 502);
    return Response.json(await response.json(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
