export type AppRole = "admin" | "owner" | "tenant";
export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  ownerId: string | null;
  tenantId: string | null;
}
export const roleLabels: Record<AppRole, string> = {
  admin: "Administrator",
  owner: "Eigentümer",
  tenant: "Mieter",
};
export interface AccountStatus {
  contactId: string;
  role: "owner" | "tenant";
  status: "active" | "pending" | "failed" | "expired";
}
