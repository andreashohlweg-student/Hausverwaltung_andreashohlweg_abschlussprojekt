import { PasswordResetForm } from "@/components/auth-forms";
export const metadata = { title: "Passwort zurücksetzen" };
export default function Page() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Passwort zurücksetzen</h1>
        <PasswordResetForm />
      </div>
    </main>
  );
}
