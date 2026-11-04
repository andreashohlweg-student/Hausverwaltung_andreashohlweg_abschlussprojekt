"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { entities, type EntityKind } from "@/lib/domain";
import { useData } from "./data-provider";
import { Icon } from "./icon";
import type { AppUser } from "@/lib/account";
import { SignOutButton } from "./auth-forms";

export function AppShell({
  children,
  user,
}: {
  children: ReactNode;
  user: AppUser;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { storageError } = useData();
  const currentKind = (Object.keys(entities) as EntityKind[]).find((kind) =>
    pathname.startsWith(`/${entities[kind].section}`),
  );
  const damagesActive = pathname.startsWith("/schaeden");
  const currentLabel = damagesActive
    ? "Schadensmeldungen"
    : currentKind
      ? entities[currentKind].plural
      : "Dashboard";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Zum Inhalt springen
      </a>
      {menuOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Navigation schließen"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        id="main-navigation"
        className={`sidebar ${menuOpen ? "is-open" : ""}`}
        aria-label="Hauptnavigation"
      >
        <Link
          className="brand"
          href="/dashboard"
          onClick={() => setMenuOpen(false)}
        >
          <span className="brand-mark">
            <Icon name="properties" size={24} />
          </span>
          <span>
            hausportal<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-label">HAUSVERWALTUNG</div>
        <nav>
          <Link
            className={`nav-link ${pathname === "/dashboard" ? "active" : ""}`}
            href="/dashboard"
            aria-current={pathname === "/dashboard" ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="dashboard" />
            <span>Dashboard</span>
          </Link>
          <Link
            href="/schaeden"
            className={`nav-link ${damagesActive ? "active" : ""}`}
            aria-current={damagesActive ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="info" />
            <span>Schadensmeldungen</span>
          </Link>
          {(Object.keys(entities) as EntityKind[]).map((kind) => (
            <Link
              key={kind}
              href={`/${entities[kind].section}`}
              className={`nav-link ${currentKind === kind ? "active" : ""}`}
              aria-current={currentKind === kind ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              <Icon name={kind} />
              <span>{entities[kind].plural}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="admin">
            <span className="avatar">
              {user.name
                .split(/\s+/)
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
            <span className="admin-dot" title="Adminansicht" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={
                menuOpen ? "Navigation schließen" : "Navigation öffnen"
              }
              aria-expanded={menuOpen}
            >
              <Icon name={menuOpen ? "close" : "menu"} />
            </button>
            <span className="breadcrumb-root">Verwaltung</span>
            <Icon name="chevron" size={13} />
            <span>{currentLabel}</span>
          </div>
          <SignOutButton />
        </header>
        <main id="main-content" className="main-content">
          {storageError && (
            <div className="alert" role="alert">
              <Icon name="info" />
              <span>{storageError}</span>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
