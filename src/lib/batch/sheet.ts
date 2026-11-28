// A buyer's spreadsheet of pieces (a line sheet), asked for by Nitin on 28 Nov 2026: one row per piece, with its photo
// pasted into the sheet or given as a link, and what the buyer knows about it (category, material, occasion...).
// Every row becomes a piece in the range. Its photo is read only for what the row left blank: the row's own details
// always win, the same as a brand's product file. Columns are recognised by their names, whatever order they're in.
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { MAX_PHOTOS } from "../images/info";
import { cleanFields, type Field, type Fields } from "./shared";

export type SheetColumn = Field | "label" | "name" | "image";
export type SheetPiece = { row: number; label: string; fields: Fields; links: string[]; images: Buffer[] };
export type LineSheet = { pieces: SheetPiece[]; used: { header: string; as: SheetColumn }[]; ignored: string[]; examples: number; leftOut: number };

/** The most pieces one sheet adds (a season's line sheet is a few hundred). */
export const MAX_SHEET_PIECES = 1000;

/** What each column is, from its name. Exact names first, then words in the name (the first rule that fits wins). */
const EXACT: [RegExp, SheetColumn][] = [
  [/^(sku|style|style ?(no|number|code|#|id)|product (code|id|number)|item (code|no|number)|code|article( number)?|ref|reference)$/, "label"],
  [/^(name|style name|product name|title|item name|working name|product title)$/, "name"],
  [/^(category|product type|type|item type|product category|garment( type)?|department|sub ?category|class|piece)$/, "productType"],
  [/^(description|product description|style description|item description|buyer description|what is it)$/, "freeText"],
  [/^(colou?r|colou?rway|colou?r name|main colou?r)$/, "colour"],
  [/^(material|materials|fabric|fabrication|composition|fibre|fiber|main fabric|fabric composition)$/, "material"],
  [/^(occasion|occasions|use|use case|use cases|wear|occasion or style|ideal for|style)$/, "occasion"],
  [/^(pattern|print|pattern or finish|finish)$/, "pattern"],
  [/^(fit|silhouette|shape|fit or silhouette)$/, "fit"],
  [/^(length|hem length)$/, "length"],
  [/^(key detail|key details|detail|details|feature|features|trim|trims)$/, "feature"],
  [/^(audience|gender|customer|age group|for|target customer)$/, "audience"],
  [/^(notes|note|comments|comment|buyer notes|extra|extra product facts|additional info|other details)$/, "extra"],
];
const WORDS: [RegExp, SheetColumn][] = [
  [/\b(photo|image|picture|pic|img)s?\b/, "image"],
  [/\bsku\b|style (no|number|code)/, "label"],
  [/categor|product type/, "productType"],
  [/descri/, "freeText"],
  [/colou?r/, "colour"],
  [/fabric|material|composition/, "material"],
  [/occasion|use case/, "occasion"],
  [/\bnotes?\b|comment/, "extra"],
];

const norm = (h: string) => h.toLowerCase().replace(/\(.*?\)|[*:]/g, " ").replace(/[_\-./]+/g, " ").replace(/\s+/g, " ").trim();
export function columnFor(header: string): SheetColumn | null {
  const h = norm(header);
  if (!h) return null;
  return EXACT.find(([re]) => re.test(h))?.[1] ?? WORDS.find(([re]) => re.test(h))?.[1] ?? null;
}

type Cell = { text: string; link?: string };
const cellOf = (v: ExcelJS.CellValue): Cell => {
  if (v === null || v === undefined) return { text: "" };
  if (typeof v === "object") {
    if (v instanceof Date) return { text: v.toISOString().slice(0, 10) };
    if ("hyperlink" in v) return { text: String((v as { text?: unknown }).text ?? ""), link: String((v as { hyperlink: unknown }).hyperlink) };
    if ("richText" in v) return { text: (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("") };
    if ("result" in v) return { text: String((v as { result: unknown }).result ?? "") };
    if ("text" in v) return { text: String((v as { text: unknown }).text ?? "") };
    return { text: "" };
  }
  return { text: String(v) };
};
const links = (c: Cell) => [...(c.link ? [c.link] : []), ...c.text.split(/[\s,;|]+/)].map((x) => x.trim()).filter((x) => /^https?:\/\/\S+$/i.test(x));
/** The template's example row, and anything else marked as an example, isn't a piece. */
const isExample = (cells: string[]) => cells.some((t) => /^(e\.g\.|eg\b|example\b)/i.test(t.trim()));

/** The header row: within the first ten rows, the one that names the most columns we know (a title row above it is fine). */
function findHeader(rows: Cell[][]): number {
  let best = -1, bestCount = 1; // at least two known columns
  rows.slice(0, 10).forEach((r, i) => {
    const n = r.filter((c) => columnFor(c.text)).length;
    if (n > bestCount) { best = i; bestCount = n; }
  });
  return best;
}

/** Rows of cells and, for an Excel file, the pictures pasted over each row (top to bottom, then left to right). */
async function openRows(buf: Buffer, filename: string): Promise<{ rows: Cell[][]; pictures: Map<number, Buffer[]> }> {
  if (/\.csv$/i.test(filename)) {
    const raw = parse(buf, { bom: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: false }) as string[][];
    return { rows: raw.map((r) => r.map((t) => ({ text: String(t ?? "") }))), pictures: new Map() };
  }
  if (!/\.xlsx$/i.test(filename)) throw new SheetError("Please upload an Excel (.xlsx) or CSV file.");
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf as unknown as ArrayBuffer); } catch { throw new SheetError("We couldn't open that spreadsheet. Save it as an Excel (.xlsx) file and try again."); }
  const ws = wb.worksheets.find((w) => w.rowCount > 0) ?? wb.worksheets[0];
  if (!ws) throw new SheetError("That spreadsheet has no tabs.");
  const rows: Cell[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r), cells: Cell[] = [];
    for (let c = 1; c <= ws.columnCount; c++) cells.push(cellOf(row.getCell(c).value));
    rows.push(cells);
  }
  // A picture belongs to the row its middle sits in (pictures are usually pasted over the photo cell).
  const placed: { row: number; col: number; buf: Buffer }[] = [];
  for (const img of ws.getImages()) {
    const media = wb.getImage(Number(img.imageId));
    if (!media?.buffer) continue;
    const top = img.range.tl.nativeRow, bottom = img.range.br?.nativeRow ?? top;
    placed.push({ row: Math.floor((top + bottom) / 2) + 1, col: img.range.tl.nativeCol, buf: Buffer.from(media.buffer) });
  }
  const pictures = new Map<number, Buffer[]>();
  for (const p of placed.sort((a, b) => a.row - b.row || a.col - b.col)) pictures.set(p.row, [...(pictures.get(p.row) ?? []), p.buf]);
  return { rows, pictures };
}

export class SheetError extends Error {}

/** Read a line sheet into pieces: each row's details by column, its photo links, and the pictures pasted over it. */
export async function readLineSheet(buf: Buffer, filename: string): Promise<LineSheet> {
  const { rows, pictures } = await openRows(buf, filename);
  const h = findHeader(rows);
  if (h < 0) throw new SheetError("We couldn't find the column names. Put them in the first row (like Category, Description, Material, Photo), or start from the template.");
  const headers = rows[h].map((c) => c.text.trim());
  const as = headers.map((x) => columnFor(x));
  const used = headers.flatMap((header, i) => (as[i] ? [{ header, as: as[i]! }] : []));
  const ignored = headers.filter((x, i) => x && !as[i]);
  const pieces: SheetPiece[] = [];
  let examples = 0, leftOut = 0;
  for (let i = h + 1; i < rows.length; i++) {
    const cells = rows[i], rowNumber = i + 1;
    const pics = pictures.get(rowNumber) ?? [];
    if (!cells.some((c) => c.text.trim()) && !pics.length) continue;
    if (isExample(cells.map((c) => c.text))) { examples++; continue; }
    if (pieces.length >= MAX_SHEET_PIECES) { leftOut++; continue; }
    const raw: Record<string, string> = {};
    let label = "", name = "";
    const photoLinks: string[] = [];
    cells.forEach((c, k) => {
      const kind = as[k], t = c.text.trim();
      if (!kind) return;
      if (kind === "image") { photoLinks.push(...links(c)); return; }
      if (!t) return;
      if (kind === "label") label ||= t;
      else if (kind === "name") name ||= t;
      else raw[kind] = raw[kind] ? `${raw[kind]}, ${t}` : t; // two columns of one kind (Detail 1, Detail 2) are joined
    });
    // No description column: the style's working name is the best description there is.
    if (!raw.freeText && name) raw.freeText = name;
    pieces.push({ row: rowNumber, label: (label || name || `Row ${rowNumber}`).slice(0, 160), fields: cleanFields(raw), links: [...new Set(photoLinks)].slice(0, MAX_PHOTOS), images: pics.slice(0, MAX_PHOTOS) });
  }
  return { pieces, used, ignored, examples, leftOut };
}

/** The template a buyer fills in: one example row (skipped when read), and a tab that says how. */
export async function lineSheetTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pieces", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Style code", width: 14 }, { header: "Photo", width: 18 }, { header: "Photo link", width: 28 }, { header: "Category", width: 14 },
    { header: "Description", width: 40 }, { header: "Material", width: 22 }, { header: "Occasion", width: 18 }, { header: "Colour", width: 12 },
    { header: "Pattern", width: 12 }, { header: "Fit", width: 12 }, { header: "Length", width: 10 }, { header: "Key detail", width: 22 },
    { header: "Audience", width: 12 }, { header: "Notes", width: 28 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow(["e.g. SG1234", "Paste the photo over this cell", "or a link to the photo", "dress", "black ruched mesh midi dress with long sleeves", "recycled polyester", "going out (optional)", "black", "", "bodycon", "midi", "ruched, mesh sleeves", "women", "fully lined"]);
  ws.getRow(2).font = { italic: true, color: { argb: "FF8A8A8A" } };
  for (let r = 3; r <= 52; r++) ws.getRow(r).height = 90; // room for a pasted photo on each row
  const how = wb.addWorksheet("How to fill it in");
  how.getColumn(1).width = 110;
  [
    "One row per piece. Delete the grey example row, or leave it: rows that start with \"e.g.\" are skipped.",
    "Photo: paste the piece's photo over its row in the Photo column (or put a link to the photo in Photo link). Add more photos of the same piece on the same row.",
    "Category, Description and Material are needed before a piece is named. Occasion is optional.",
    "Anything you write here is used as written. The photo only fills in what you left blank, and Nomen never guesses the fabric.",
    "Column names can be in any order, and columns Nomen doesn't use (like price) are simply left out.",
  ].forEach((t) => how.addRow([t]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
