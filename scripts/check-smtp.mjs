import { verifySmtp } from "../src/lib/mail.ts";

process.loadEnvFile(".env.local");
try {
  await verifySmtp();
  console.log("SMTP lokal: TLS-Verbindung und Anmeldung erfolgreich.");
  if (
    process.env.NEON_FUNCTION_HELLO_BASE_URL &&
    process.env.FUNCTION_ORIGIN_SECRET
  ) {
    const result = await fetch(
      new URL("smtp-check", process.env.NEON_FUNCTION_HELLO_BASE_URL),
      {
        headers: { "x-secret": process.env.FUNCTION_ORIGIN_SECRET },
        redirect: "manual",
        signal: AbortSignal.timeout(25000),
      },
    );
    if (!result.ok) throw new Error();
    console.log("SMTP auf Neon: TLS-Verbindung und Anmeldung erfolgreich.");
  }
  console.log("Keine Mail versendet.");
} catch {
  console.error(
    "SMTP-Prüfung fehlgeschlagen. Host, Port, Gmail-Adresse und App-Passwort prüfen.",
  );
  process.exitCode = 1;
}
