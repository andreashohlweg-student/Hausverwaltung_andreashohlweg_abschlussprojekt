import { createHash, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import { attachDatabasePool } from "@neon/functions";
import { sendInvitationEmail, verifySmtp } from "./src/lib/mail";
import { z } from "zod";

const secret = process.env.FUNCTION_ORIGIN_SECRET;
if (!secret) throw new Error("FUNCTION_ORIGIN_SECRET fehlt.");
const expected = Buffer.from(secret);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);
const bodySchema = z.object({
  invitationId: z.uuid(),
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
function authorized(request: Request) {
  const header = request.headers.get("x-secret");
  if (!header) return false;
  const provided = Buffer.from(header);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
export default {
  async fetch(request: Request): Promise<Response> {
    if (!authorized(request))
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    try {
      if (request.method === "GET") {
        if (new URL(request.url).pathname === "/smtp-check") {
          try {
            await verifySmtp();
            return Response.json(
              { ok: true },
              { headers: { "Cache-Control": "no-store" } },
            );
          } catch {
            return Response.json(
              { error: "SMTP verification failed" },
              { status: 503 },
            );
          }
        }
        const { rows } = await pool.query(
          "SELECT now() AS database_time,(SELECT count(*)::int FROM hausportal.owners) AS owners,(SELECT count(*)::int FROM hausportal.tenants) AS tenants,(SELECT count(*)::int FROM hausportal.properties) AS properties",
        );
        return Response.json(
          { ok: true, service: "hausportal-invitations", database: rows[0] },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      if (request.method !== "POST")
        return new Response(null, {
          status: 405,
          headers: { Allow: "GET, POST" },
        });
      const raw = await request.text();
      if (raw.length > 4096) return new Response(null, { status: 413 });
      const parsed = bodySchema.safeParse(JSON.parse(raw));
      if (!parsed.success)
        return Response.json({ error: "Invalid request" }, { status: 400 });
      const { invitationId, token } = parsed.data;
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const invitation = (
        await pool.query(
          "SELECT id,email,name,role FROM hausportal.invitations WHERE id=$1 AND token_hash=$2 AND expires_at>now() AND accepted_at IS NULL AND revoked_at IS NULL",
          [invitationId, tokenHash],
        )
      ).rows[0];
      if (!invitation)
        return Response.json(
          { error: "Invitation not available" },
          { status: 410 },
        );
      if (
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASS ||
        !process.env.APP_URL
      )
        return Response.json(
          { error: "Mail delivery not configured" },
          { status: 503 },
        );
      try {
        await sendInvitationEmail({ ...invitation, token });
      } catch {
        await pool.query(
          "UPDATE hausportal.invitations SET delivery_status='failed' WHERE id=$1",
          [invitationId],
        );
        console.error("SMTP-Versand fehlgeschlagen.");
        return Response.json(
          { error: "Email delivery failed" },
          { status: 502 },
        );
      }
      await pool.query(
        "UPDATE hausportal.invitations SET delivery_status='sent' WHERE id=$1",
        [invitationId],
      );
      return Response.json({ ok: true });
    } catch {
      console.error("Einladungsdienst fehlgeschlagen.");
      return Response.json({ error: "Request failed" }, { status: 500 });
    }
  },
};
