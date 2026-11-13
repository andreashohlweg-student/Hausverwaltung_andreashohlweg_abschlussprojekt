"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { entities, withoutAssignment, type EntityKind } from "@/lib/domain";
import { useData } from "./data-provider";
import { Icon } from "./icon";

export function Dashboard({ damageCard }: { damageCard: ReactNode }) {
  const { data, ready } = useData();
  if (!ready)
    return (
      <div className="loading" role="status">
        Hausportal wird geladen …
      </div>
    );
  const ownersWithoutProperty = data.owners.filter((owner) =>
    withoutAssignment("owners", owner, data),
  ).length;
  const tenantsWithoutProperty = data.tenants.filter((tenant) =>
    withoutAssignment("tenants", tenant, data),
  ).length;
  const unitCount = data.units.length;
  const shortcuts: EntityKind[] = [
    "owners",
    "tenants",
    "properties",
    "employees",
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Dashboard</h1>
        </div>
      </div>
      <div className="stats-grid">
        {shortcuts.map((kind, index) => (
          <Link
            href={`/${entities[kind].section}`}
            className="stat-card"
            key={kind}
          >
            <div className="stat-top">
              <span>{entities[kind].plural}</span>
              <span className={`stat-icon tone-${index}`}>
                <Icon name={kind} size={19} />
              </span>
            </div>
            <strong className="stat-value">
              {data[kind].length.toString().padStart(2, "0")}
            </strong>
            {kind === "properties" && (
              <div className="stat-bottom">{unitCount} Wohneinheiten</div>
            )}
          </Link>
        ))}
      </div>

      <section className="section">
        <div className="section-heading">
          <h2>Schnellaktionen</h2>
        </div>
        <div className="actions-grid">
          {shortcuts.map((kind) => (
            <Link
              className="action-card"
              key={kind}
              href={`/${entities[kind].section}/neu`}
            >
              <span className="action-icon">
                <Icon name={kind} size={23} />
                <span className="tiny-plus">+</span>
              </span>
              <h3>{entities[kind].singular} anlegen</h3>
              <span className="action-arrow">
                <Icon name="arrow" size={19} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Offene Vorgänge</h2>
        </div>
        <div className="assignment-grid">
          <Link
            className="assignment-card"
            href="/eigentuemer?filter=unassigned"
          >
            <span className="assignment-icon">
              <Icon name="owners" size={22} />
            </span>
            <div className="assignment-content">
              <h3>Eigentümer ohne Objekt</h3>
            </div>
            <span
              className={`assignment-count ${ownersWithoutProperty === 0 ? "complete" : ""}`}
            >
              {ownersWithoutProperty}
            </span>
            <Icon className="assignment-arrow" name="arrow" size={19} />
          </Link>
          <Link className="assignment-card" href="/mieter?filter=unassigned">
            <span className="assignment-icon">
              <Icon name="tenants" size={22} />
            </span>
            <div className="assignment-content">
              <h3>Mieter ohne Wohnung</h3>
            </div>
            <span
              className={`assignment-count ${tenantsWithoutProperty === 0 ? "complete" : ""}`}
            >
              {tenantsWithoutProperty}
            </span>
            <Icon className="assignment-arrow" name="arrow" size={19} />
          </Link>
          {damageCard}
        </div>
      </section>
    </>
  );
}
