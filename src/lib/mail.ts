import nodemailer from "nodemailer";

type MailEnvironment = Record<string, string | undefined>;

export function smtpOptions(env: MailEnvironment = process.env) {
  const host = env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(env.SMTP_PORT || "465");
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  if (!user || !pass) throw new Error("SMTP_USER und SMTP_PASS fehlen.");
  if (port !== 465 && port !== 587)
    throw new Error("SMTP_PORT muss 465 oder 587 sein.");
  return {
    host,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: { user, pass },
    tls: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

export function invitationMessage(
  invitation: {
    id: string;
    email: string;
    name: string;
    role: string;
    token: string;
  },
  env: MailEnvironment = process.env,
) {
  if (!env.APP_URL || !env.SMTP_USER)
    throw new Error("APP_URL und SMTP_USER fehlen.");
  const base = new URL(env.APP_URL);
  if (
    base.protocol !== "https:" &&
    !(
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname)
    )
  )
    throw new Error("APP_URL muss HTTPS verwenden.");
  const link = new URL(`/einladung/${invitation.token}`, base).href;
  return {
    from: { name: "Hausportal", address: env.SMTP_USER.trim() },
    to: invitation.email,
    subject:
      invitation.role === "admin"
        ? "Administratorzugang zum Hausportal"
        : "Einladung zum Hausportal",
    text: `Hallo ${invitation.name},\n\nlege über diesen Link dein Passwort für das Hausportal fest:\n\n${link}\n\nDer Link ist 7 Tage gültig und kann einmal verwendet werden.`,
  };
}

export function createSmtpTransport(env: MailEnvironment = process.env) {
  return nodemailer.createTransport(smtpOptions(env));
}

export async function verifySmtp() {
  const transport = createSmtpTransport();
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

export async function sendInvitationEmail(
  invitation: Parameters<typeof invitationMessage>[0],
) {
  const transport = createSmtpTransport();
  try {
    const result = await transport.sendMail(invitationMessage(invitation));
    if (!result.accepted.length || result.rejected.length)
      throw new Error("Der SMTP-Server hat die Empfängeradresse abgelehnt.");
  } finally {
    transport.close();
  }
}
