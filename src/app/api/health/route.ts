import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"] as const;

/** Liveness for Render, plus which mode the site runs in. Only yes/no flags: never a key or any part of one. */
export async function GET() {
  const live = (process.env.PROVIDER_MODE?.trim() || "live") === "live";
  const configured = !live || KEYS.every((k) => !!process.env[k]?.trim());
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", mode: live ? "live" : "preview", configured });
  } catch {
    return Response.json({ status: "db_unavailable", mode: live ? "live" : "preview", configured }, { status: 503 });
  }
}
