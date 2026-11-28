import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { db } from "../db";
import { authSecret } from "../env";

export const SESSION_COOKIE = "pno_session";
/** The owner's chosen brand ("workspace"): what Create, Ranges, History, Review and the Dashboard show by default. */
export const WORKSPACE_COOKIE = "pno_workspace";
export const WORKSPACE_COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 };
const SESSION_HOURS = 12;

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  brandId: string | null;
  brandName: string | null;
  /** Owner only: the brand they're working in, or null for every brand. Never widens access: other roles have their own brand. */
  workspaceId?: string | null;
  workspaceName?: string | null;
};

const key = () => new TextEncoder().encode(authSecret());

export async function createSessionToken(userId: string, sessionVersion: number) {
  return new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key());
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Resolve the signed-in user from the cookie, re-checking the database on every request so
 * disabling a user, resetting their password or disabling their brand takes effect immediately.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const user = await db.user.findUnique({ where: { id: payload.sub }, include: { brand: true } });
    if (!user || !user.active || user.sessionVersion !== payload.sv) return null;
    if (user.brand && !user.brand.active) return null;
    let workspace: { id: string; name: string } | null = null;
    if (user.role === "owner") {
      const ws = (await cookies()).get(WORKSPACE_COOKIE)?.value;
      if (ws) workspace = await db.brand.findFirst({ where: { id: ws, active: true }, select: { id: true, name: true } });
    }
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      brandId: user.brandId,
      brandName: user.brand?.name ?? null,
      ...(user.role === "owner" ? { workspaceId: workspace?.id ?? null, workspaceName: workspace?.name ?? null } : {}),
    };
  } catch {
    return null;
  }
}
