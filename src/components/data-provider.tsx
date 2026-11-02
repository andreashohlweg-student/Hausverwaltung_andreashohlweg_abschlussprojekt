"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Database } from "@/lib/domain";
import type { AccountStatus } from "@/lib/account";
interface DataContextValue {
  data: Database;
  ready: boolean;
  storageError: string;
  accounts: AccountStatus[];
  save: (next: Database) => Promise<boolean>;
  invite: (kind: "owners" | "tenants", contactId: string) => Promise<boolean>;
}
const DataContext = createContext<DataContextValue | null>(null);
export function DataProvider({
  children,
  initialData,
  initialRevision,
  initialAccounts,
}: {
  children: ReactNode;
  initialData: Database;
  initialRevision: number;
  initialAccounts: AccountStatus[];
}) {
  const [data, setData] = useState(initialData);
  const [revision, setRevision] = useState(initialRevision);
  const [storageError, setStorageError] = useState("");
  const [accounts, setAccounts] = useState(initialAccounts);
  async function save(next: Database) {
    try {
      const response = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: next, revision }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Speichern fehlgeschlagen.");
      setData(next);
      setRevision(result.revision);
      setStorageError("");
      return true;
    } catch (error) {
      setStorageError(
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
      );
      return false;
    }
  }
  async function invite(kind: "owners" | "tenants", contactId: string) {
    let success = false;
    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, contactId }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "Einladung konnte nicht gesendet werden.",
        );
      setStorageError("");
      success = true;
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? error.message
          : "Einladung konnte nicht gesendet werden.",
      );
    }
    try {
      const response = await fetch("/api/data", { cache: "no-store" });
      if (response.ok) {
        const result = await response.json();
        setAccounts(result.accounts);
      }
    } catch {
      /* The invitation result remains authoritative. */
    }
    return success;
  }
  return (
    <DataContext.Provider
      value={{ data, ready: true, storageError, accounts, save, invite }}
    >
      {children}
    </DataContext.Provider>
  );
}
export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData requires DataProvider");
  return context;
}
