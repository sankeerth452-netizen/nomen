// Who may do what. Defaults below; a brand can change any of them in its settings (`permissions`).
import type { Role } from "@prisma/client";
import type { BrandSettings } from "../brand";

export type Capability = "edit" | "approve" | "comment" | "export" | "manageUsers" | "manageBrand" | "manageKeywords";

export const DEFAULT_PERMISSIONS: Record<Capability, Role[]> = {
  edit: ["owner", "admin", "editor", "buyer"], // change generated content, send it for approval
  approve: ["owner", "admin", "reviewer"], // approve, reject, mark ready to export
  comment: ["owner", "admin", "editor", "reviewer", "buyer"],
  export: ["owner", "admin", "editor", "reviewer", "buyer"],
  manageUsers: ["owner", "admin"],
  manageBrand: ["owner", "admin"],
  manageKeywords: ["owner", "admin"],
};

export function can(user: { role: Role }, capability: Capability, settings?: Pick<BrandSettings, "permissions"> | null): boolean {
  if (user.role === "owner") return true;
  const roles = (settings?.permissions?.[capability] as Role[] | undefined) ?? DEFAULT_PERMISSIONS[capability];
  return roles.includes(user.role);
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", admin: "Brand admin", editor: "Editor", reviewer: "Reviewer", buyer: "Buyer" };

/** Owners, brand admins and reviewers see everything in their brand; editors and buyers see their own work. */
export const seesWholeBrand = (user: { role: Role }) => user.role === "owner" || user.role === "admin" || user.role === "reviewer";
