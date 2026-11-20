// A range's progress (time left), its error report and its processing summary. Everything comes from what is stored:
// the product file's checks, each piece's stage, its product data checks and what each step cost.
import { db } from "../db";
import type { FileCheck, PieceFeed } from "../feed/shared";
import { generationUsd, readUsd } from "../pricing";
import { cell, duplicateNames, rangeItems, type PresentedItem } from "./ranges";
import { MAX_AT_ONCE as AT_ONCE } from "./worker";
const READ_SECONDS = 15; // reading one photo, typically
const NAME_SECONDS = 45; // naming one piece with its page and product data, until this range has its own timings

export type RangeProgress = { remaining: number; etaSeconds: number | null };

/** Pieces still being read or named, and roughly how long they'll take, from this range's own recent timings. */
export async function rangeProgress(batchId: string): Promise<RangeProgress> {
  const items = await db.batchItem.findMany({ where: { batchId }, select: { status: true, updatedAt: true, generation: { select: { createdAt: true } } } });
  const reads = items.filter((i) => i.status === "queued" || i.status === "reading").length;
  const names = items.filter((i) => i.status === "to_name" || i.status === "naming").length;
  if (!reads && !names) return { remaining: 0, etaSeconds: null };
  const took = items.filter((i) => i.status === "named" && i.generation).map((i) => (i.updatedAt.getTime() - i.generation!.createdAt.getTime()) / 1000).filter((s) => s > 0 && s < 600).sort((a, b) => a - b);
  const perName = took.length ? took[Math.floor(took.length / 2)] : NAME_SECONDS;
  return { remaining: reads + names, etaSeconds: Math.ceil((reads * READ_SECONDS + names * perName) / AT_ONCE) };
}

export type ReportRow = { product: string; skus: string; level: "Error" | "Warning"; where: string; problem: string };

/** Every problem in the range, errors first: the product file's checks, photos, naming, product data and names. */
export function reportRows(items: PresentedItem[], fileCheck: FileCheck | null, rowsByItem: Map<string, number[]>, extra: ReportRow[] = []): ReportRow[] {
  const out: ReportRow[] = [];
  const byRow = new Map<number, PresentedItem>();
  for (const i of items) for (const r of rowsByItem.get(i.id) ?? []) byRow.set(r, i);
  const label = (i: PresentedItem | undefined, row?: number) => i ? { product: i.name ?? i.filename, skus: i.file?.skus.join(" ") ?? "" } : { product: `Row ${row}`, skus: "" };
  for (const issue of fileCheck?.issues ?? []) {
    if (issue.level === "info") continue;
    for (const row of issue.rows) out.push({ ...label(byRow.get(row), row), level: issue.level === "error" ? "Error" : "Warning", where: "Product file", problem: `${issue.message} (row ${row})` });
  }
  const dupes = duplicateNames(items);
  for (const i of items) {
    const who = label(i);
    if (i.status === "read_failed") out.push({ ...who, level: "Error", where: "Photo", problem: i.file?.imageError ?? "The photo couldn't be read" });
    else if (i.file?.imageError) out.push({ ...who, level: "Warning", where: "Photo", problem: `${i.file.imageError} Named from the file's details alone.` });
    if (i.status === "not_product") out.push({ ...who, level: "Warning", where: "Photo", problem: "No fashion piece found in the photo" });
    if (i.status === "failed") out.push({ ...who, level: "Error", where: "Naming", problem: "Naming didn't work. Try it again." });
    if (i.status === "needs_input") out.push({ ...who, level: "Warning", where: "Naming", problem: i.question ?? "Needs a detail before it can be named" });
    if (i.name && dupes.get(i.id)) out.push({ ...who, level: "Warning", where: "Names", problem: `Same name as ${dupes.get(i.id)!.join(", ")}` });
    if (i.sheet?.status === "ready") for (const c of i.sheet.checks) out.push({ ...who, level: "Warning", where: "Product data", problem: c });
  }
  out.push(...extra);
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "Error" ? -1 : 1));
}

export const reportCsv = (rows: ReportRow[]) =>
  [["Product", "SKUs", "Level", "Where", "Problem"], ...rows.map((r) => [r.product, r.skus, r.level, r.where, r.problem])].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

/** The range's rows and stage data for the report and summary. */
export async function loadReportData(batchId: string) {
  const [items, raw] = await Promise.all([
    rangeItems(batchId),
    db.batchItem.findMany({ where: { batchId }, select: { id: true, feed: true, readUsage: true, updatedAt: true, generation: { select: { usage: true, createdAt: true } } } }),
  ]);
  const rowsByItem = new Map(raw.map((r) => [r.id, ((r.feed as PieceFeed | null)?.rows ?? []).map((x) => x.row)]));
  const sizesByItem = new Map(raw.map((r) => [r.id, ((r.feed as PieceFeed | null)?.rows ?? []).map((x) => x.attrs.size).filter((z): z is string => !!z)]));
  const brandCategoriesByItem = new Map(raw.map((r) => [r.id, [...new Set(((r.feed as PieceFeed | null)?.rows ?? []).map((x) => x.attrs.google_product_category).filter((c): c is string => !!c))]]));
  return { items, raw, rowsByItem, sizesByItem, brandCategoriesByItem };
}

/** The processing summary: counts, confidence, problems, cost and time. */
export function summaryCsv(batch: { title: string; source: string; fileName: string | null; createdAt: Date }, data: Awaited<ReturnType<typeof loadReportData>>, report: ReportRow[]): string {
  const { items, raw } = data;
  const n = (s: string) => items.filter((i) => i.status === s).length;
  const conf = (c: string) => items.filter((i) => i.status === "named" && i.confidence === c).length;
  let claude = 0, google = 0, reading = 0;
  for (const r of raw) { const g = generationUsd(r.generation?.usage); claude += g.claude; google += g.google; reading += readUsd(r.readUsage); }
  const named = n("named");
  const times = raw.filter((r) => r.generation).map((r) => (r.updatedAt.getTime() - r.generation!.createdAt.getTime()) / 1000).filter((s) => s > 0 && s < 600);
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  const usd = (v: number) => v.toFixed(2);
  const lines: [string, string][] = [
    ["Range", batch.title], ["Started from", batch.source === "file" ? `Product file: ${batch.fileName ?? ""}` : "Photos"], ["Created", batch.createdAt.toISOString().slice(0, 16).replace("T", " ")],
    ["Products", String(items.length)], ...(batch.source === "file" ? [["SKUs", String(items.reduce((s, i) => s + (i.file?.skus.length ?? 0), 0))] as [string, string]] : []),
    ["Named", String(named)], ["Needs a detail", String(n("needs_input"))], ["Didn't work", String(n("failed"))], ["Couldn't read the photo", String(n("read_failed"))],
    ["No fashion piece found", String(n("not_product"))], ["Still to check", String(n("review"))], ["Still working", String(items.filter((i) => ["queued", "reading", "to_name", "naming"].includes(i.status)).length)],
    ["High confidence", String(conf("high"))], ["Medium confidence", String(conf("medium"))], ["Low confidence", String(conf("low"))],
    ["Errors in the report", String(report.filter((r) => r.level === "Error").length)], ["Warnings in the report", String(report.filter((r) => r.level === "Warning").length)],
    ["Claude: reading photos (US$)", usd(reading)], ["Claude: names, pages and product data (US$)", usd(claude)], ["Google figures, DataForSEO (US$)", usd(google)],
    ["Total cost (US$)", usd(reading + claude + google)], ["Cost per named product (US$)", named ? usd((reading + claude + google) / named) : ""],
    ["Average time to name a product", avg ? `${avg} ${avg === 1 ? "second" : "seconds"}` : ""],
    ["Note", "Claude costs are worked out from the tokens each step used, at list prices. Google figures are what DataForSEO charged."],
  ];
  return ["Item,Value", ...lines.map(([k, v]) => `${cell(k)},${cell(v)}`)].join("\r\n") + "\r\n";
}
