import { errorResponse } from "@/lib/server/access";
import {
  damageApiUser,
  damageHeaders,
  damageId,
} from "@/lib/server/damage-http";
import { loadDamageInvoice } from "@/lib/server/damages";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await damageApiUser();
    const invoice = await loadDamageInvoice(damageId((await params).id), user);
    return new Response(new Uint8Array(invoice.pdf), {
      headers: {
        ...damageHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
