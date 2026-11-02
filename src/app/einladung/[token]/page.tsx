import Link from "next/link";
import { findInvitation } from "@/lib/server/invitations";
import { roleLabels } from "@/lib/account";
import { AcceptInvitationForm } from "@/components/auth-forms";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Zugang aktivieren",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await findInvitation(token);
  if (!invitation)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Einladung nicht verfügbar</h1>
          <p>Der Link ist ungültig, abgelaufen oder bereits verwendet.</p>
          <Link className="button" href="/anmelden">
            Zur Anmeldung
          </Link>
        </div>
      </main>
    );
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Zugang aktivieren</h1>
        <dl className="account-details">
          <dt>E-Mail-Adresse</dt>
          <dd>{invitation.email}</dd>
          <dt>Rolle</dt>
          <dd>{roleLabels[invitation.role]}</dd>
        </dl>
        <AcceptInvitationForm token={token} />
      </div>
    </main>
  );
}
