import type { Prisma } from "@prisma/client";
import { db } from "../db";

type Row = { result: Prisma.JsonValue | null; usage: Prisma.JsonValue | null; promptVersions: Prisma.JsonValue | null };

/**
 * Read-modify-write of a generation's result and usage under a row lock. The product page and the product data are
 * written at the same time after the name; without the lock one would overwrite the other's half of the result.
 */
export async function updateGeneration(id: string, change: (row: Row) => { result?: unknown; usage?: unknown; promptVersions?: unknown }): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Generation" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.generation.findUniqueOrThrow({ where: { id }, select: { result: true, usage: true, promptVersions: true } });
    const next = change(row);
    await tx.generation.update({
      where: { id },
      data: {
        ...(next.result !== undefined ? { result: next.result as Prisma.InputJsonValue } : {}),
        ...(next.usage !== undefined ? { usage: next.usage as Prisma.InputJsonValue } : {}),
        ...(next.promptVersions !== undefined ? { promptVersions: next.promptVersions as Prisma.InputJsonValue } : {}),
      },
    });
  });
}

/** Set one key of the result (e.g. "content", "sheet"), keeping everything else in it. */
export async function setResultKey(id: string, key: string, value: unknown): Promise<void> {
  await updateGeneration(id, (row) => ({ result: { ...((row.result as Record<string, unknown>) ?? {}), [key]: value } }));
}

/** Record which prompt wrote a part of the result ("content", "sheet"). */
export async function setPromptVersion(id: string, key: string, version: string): Promise<void> {
  await updateGeneration(id, (row) => ({ promptVersions: { ...((row.promptVersions as Record<string, string>) ?? {}), [key]: version } }));
}

