import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";
import { invitationMessage, smtpOptions } from "../src/lib/mail.ts";

const env = {
  SMTP_USER: "sender@gmail.com",
  SMTP_PASS: "test-only-credential",
  APP_URL: "https://hausportal.example",
};
const invitation = {
  id: "test-invitation",
  email: "tenant@example.com",
  name: "Test Mieter",
  role: "tenant",
  token: "a".repeat(64),
};

test("mail configuration fails closed without credentials or with plaintext ports", () => {
  assert.throws(() => smtpOptions({ SMTP_USER: env.SMTP_USER }));
  assert.throws(() => smtpOptions({ ...env, SMTP_PORT: "25" }));
  for (const port of ["465", "587"]) {
    const options = smtpOptions({ ...env, SMTP_PORT: port });
    assert.ok(options.secure || options.requireTLS);
    assert.equal(options.tls.rejectUnauthorized, true);
  }
});

test("activation links reject insecure public URLs and allow localhost development", () => {
  assert.throws(() =>
    invitationMessage(invitation, { ...env, APP_URL: "http://public.example" }),
  );
  assert.throws(() =>
    invitationMessage(invitation, { ...env, APP_URL: "javascript:alert(1)" }),
  );
  assert.match(
    invitationMessage(invitation, { ...env, APP_URL: "http://localhost:3000" })
      .text,
    /http:\/\/localhost:3000\/einladung\//,
  );
});

test("compiled invitation targets the contact, keeps credentials out and includes the activation link", async () => {
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const result = await transport.sendMail(invitationMessage(invitation, env));
  const message = JSON.parse(result.message);
  assert.equal(message.to[0].address, invitation.email);
  assert.equal(message.from.address, env.SMTP_USER);
  assert.equal(message.subject, "Einladung zum Hausportal");
  assert.ok(
    message.text.includes(`${env.APP_URL}/einladung/${invitation.token}`),
  );
  assert.ok(!result.message.includes(env.SMTP_PASS));
  assert.equal(
    invitationMessage({ ...invitation, role: "admin" }, env).subject,
    "Administratorzugang zum Hausportal",
  );
});
