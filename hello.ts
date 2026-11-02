import { createHash, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";
import { attachDatabasePool } from "@neon/functions";
import { Resend } from "resend";
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
        !process.env.RESEND_API_KEY ||
        !process.env.MAIL_FROM ||
        !process.env.APP_URL
      )
        return Response.json(
          { error: "Mail delivery not configured" },
          { status: 503 },
        );
      const link = new URL(`/einladung/${token}`, process.env.APP_URL).href;
      const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
        {
          from: process.env.MAIL_FROM,
          to: invitation.email,
          subject:
            invitation.role === "admin"
              ? "Administratorzugang zum Hausportal"
              : "Einladung zum Hausportal",
          text: `Hallo ${invitation.name},\n\nlege über diesen Link dein Passwort für das Hausportal fest:\n\n${link}\n\nDer Link ist 7 Tage gültig und kann einmal verwendet werden.`,
        },
        { idempotencyKey: `hausportal-invitation-${invitationId}` },
      );
      if (result.error) {
        await pool.query(
          "UPDATE hausportal.invitations SET delivery_status='failed' WHERE id=$1",
          [invitationId],
        );
        console.error("Resend-Versand fehlgeschlagen:", result.error.name);
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
