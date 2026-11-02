import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/access";
import { SignInForm } from "@/components/auth-forms";
export const metadata = { title: "Anmelden" };
export const dynamic = "force-dynamic";
export default async function SignInPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "admin" ? "/dashboard" : "/portal");
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Anmelden</h1>
        <SignInForm />
      </div>
    </main>
  );
}
