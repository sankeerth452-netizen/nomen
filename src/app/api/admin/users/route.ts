import { z } from "zod";
import { db } from "@/lib/db";
import { assertBrandAccess, errorResponse, HttpError, requireUser } from "@/lib/auth/guards";
import type { SessionUser } from "@/lib/auth/session";
import { createUser, resetPassword, setUserActive, UserError } from "@/lib/users";
import { requireCapability } from "@/lib/review/guard";

// The owner manages every login; a brand admin manages the logins of their own brand (never an owner's, never another
// brand's). Nobody creates or changes their own credentials here.

async function manager() {
  const actor = await requireUser("admin");
  if (actor.role !== "owner") await requireCapability(actor, "manageUsers", actor.brandId);
  return actor;
}
/** A brand admin may only act on non-owner logins in their own brand. */
async function assertCanManage(actor: SessionUser, username: string) {
  if (actor.role === "owner") return;
  const target = await db.user.findUnique({ where: { username: username.toLowerCase() }, select: { brandId: true, role: true } });
  if (!target || target.role === "owner" || target.brandId !== actor.brandId) throw new HttpError(404, "We couldn't find that login.");
}

export async function GET() {
  try {
    const actor = await manager();
    const users = await db.user.findMany({
      where: actor.role === "owner" ? {} : { brandId: actor.brandId, role: { not: "owner" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, username: true, displayName: true, role: true, active: true, lastLoginAt: true, brand: { select: { id: true, name: true } } },
    });
    return Response.json({ users });
  } catch (e) {
    return errorResponse(e);
  }
}

const createBody = z.object({
  username: z.string(),
  displayName: z.string().max(100),
  role: z.enum(["admin", "editor", "reviewer", "buyer"]),
  brandId: z.string().uuid(),
  password: z.string().optional(), // omit to auto-generate
});

export async function POST(req: Request) {
  try {
    const actor = await manager();
    const input = createBody.parse(await req.json());
    assertBrandAccess(actor, input.brandId);
    const { user, password } = await createUser({ ...input, actorId: actor.id });
    return Response.json({ id: user.id, username: user.username, password }, { status: 201 });
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof z.ZodError) return Response.json({ error: "Please check the details and try again." }, { status: 400 });
    return errorResponse(e);
  }
}

const patchBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset_password"), username: z.string(), password: z.string().optional() }),
  z.object({ action: z.literal("disable"), username: z.string() }),
  z.object({ action: z.literal("enable"), username: z.string() }),
]);

export async function PATCH(req: Request) {
  try {
    const actor = await manager();
    const input = patchBody.parse(await req.json());
    await assertCanManage(actor, input.username);
    if (input.action === "reset_password") {
      const { password } = await resetPassword(input.username, input.password, actor.id);
      return Response.json({ username: input.username, password });
    }
    if (input.username.toLowerCase() === actor.username && input.action === "disable") {
      return Response.json({ error: "You can't disable yourself" }, { status: 400 });
    }
    await setUserActive(input.username, input.action === "enable", actor.id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof z.ZodError) return Response.json({ error: "Please check the details and try again." }, { status: 400 });
    return errorResponse(e);
  }
}
