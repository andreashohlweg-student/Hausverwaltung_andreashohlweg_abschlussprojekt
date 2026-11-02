import Link from "next/link";
import { PasswordResetForm } from "@/components/auth-forms";
export const metadata = { title: "Passwort zurücksetzen" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Passwort zurücksetzen</h1>
        {token && !error ? (
          <PasswordResetForm token={token} />
        ) : (
          <>
            <p>Der Link ist ungültig oder abgelaufen.</p>
            <Link className="button" href="/passwort-vergessen">
              Neuen Link anfordern
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
