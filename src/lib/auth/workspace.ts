// The owner's workspace: one brand at a time, or every brand. Everyone else always works in their own brand only.
import type { SessionUser } from "./session";

/** The brand a page should show: the user's own, or the owner's chosen workspace (null: every brand). */
export const workspaceBrandId = (user: SessionUser): string | null => (user.role === "owner" ? user.workspaceId ?? null : user.brandId);

/** A list filter for the owner's workspace: one brand, or no filter for every brand. Other roles are filtered elsewhere. */
export const ownerScope = (user: SessionUser): { brandId?: string } => (user.role === "owner" && user.workspaceId ? { brandId: user.workspaceId } : {});

/** Brands in the order a picker should offer them: the workspace first, so it's the default choice. */
export function workspaceFirst<T extends { id: string }>(user: SessionUser, brands: T[]): T[] {
  const ws = workspaceBrandId(user);
  return ws ? [...brands.filter((b) => b.id === ws), ...brands.filter((b) => b.id !== ws)] : brands;
}
