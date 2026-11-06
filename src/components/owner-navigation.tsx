"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DamageLanguage } from "@/lib/damage";
export function OwnerNavigation({ language }: { language: DamageLanguage }) {
  const pathname = usePathname();
  const buildings =
    pathname.startsWith("/portal/gebaeude") ||
    pathname.startsWith("/portal/schaeden");
  return (
    <nav
      className="owner-navigation"
      aria-label={
        language === "de" ? "Eigentümernavigation" : "Owner navigation"
      }
    >
      <Link
        href="/portal"
        aria-current={pathname === "/portal" ? "page" : undefined}
      >
        Dashboard
      </Link>
      <Link
        href="/portal/gebaeude"
        aria-current={buildings ? "page" : undefined}
      >
        {language === "de" ? "Gebäude" : "Buildings"}
      </Link>
    </nav>
  );
}
