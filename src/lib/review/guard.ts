// Server-side permission checks with the brand's own settings (some brands change who may do what).
import { db } from "../db";
import { HttpError } from "../auth/guards";
import type { SessionUser } from "../auth/session";
import { parseBrandSettings, type BrandSettings } from "../brand";
import { can, type Capability } from "./permissions";

export async function brandSettings(brandId: string | null | undefined): Promise<BrandSettings | null> {
  if (!brandId) return null;
  const b = await db.brand.findUnique({ where: { id: brandId }, select: { settings: true } });
  return b ? parseBrandSettings(b.settings) : null;
}

/** Throws 403 unless this login may do this for this brand. */
export async function requireCapability(user: SessionUser, capability: Capability, brandId: string | null | undefined): Promise<void> {
  if (user.role === "owner") return;
  if (!can(user, capability, await brandSettings(brandId ?? user.brandId))) throw new HttpError(403, "Your login can't do this. Ask your brand admin.");
}
