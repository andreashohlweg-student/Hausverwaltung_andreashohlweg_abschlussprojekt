import Link from "next/link";
import { requireUser } from "@/lib/server/access";
import { damageLanguage } from "@/lib/server/damage-language";
import { DamageLanguageSwitch } from "@/components/damage-forms";
import { SignOutButton } from "@/components/auth-forms";
export const dynamic = "force-dynamic";
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  const language = await damageLanguage();
  return (
    <div className="portal-shell" lang={language}>
      <header className="topbar">
        <Link className="brand" href="/portal">
          Hausportal
        </Link>
        <div className="portal-header-actions">
          <DamageLanguageSwitch language={language} />
          <SignOutButton language={language} />
        </div>
      </header>
      <main className="portal-content">{children}</main>
    </div>
  );
}
