// A generic A4 report: header (brand, title, period, export date), summary boxes, then one or more tables. Each table
// has a heading, a header row that repeats on every page it spans, optional share bars (a drawn bar plus "12.5%"),
// and an optional totals row. Footer with page numbers. Standard Helvetica (no font files), like lib/pdf.ts; text the
// font can't draw becomes "?" instead of failing.
//
// Relative imports so Node's test runner can load this file directly. Tested in tests/research-pdf.test.mjs.
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { safeText, wrap } from "./pdf.ts";

const A4: [number, number] = [595.28, 841.89];
const M = 40;
const INK = rgb(0.11, 0.106, 0.094);
const MUTED = rgb(0.38, 0.38, 0.36);
const LINE = rgb(0.84, 0.83, 0.8);
const BAND = rgb(0.955, 0.95, 0.94);
const BRAND = rgb(0.086, 0.439, 0.353);
const SIZE = 8.5;
const LINE_H = 11;
const PAD = 5;
const FOOTER = 34;

export type Tone = "ink" | "good" | "owed" | "bad";
const TONE = { ink: INK, good: BRAND, owed: rgb(0.55, 0.33, 0.05), bad: rgb(0.63, 0.21, 0.16) };

export type ReportColumn = {
  label: string;
  /** relative width; the description-like column takes what's left when `grow` is set */
  w: number;
  right?: boolean;
  /** a share column: the cell is a number 0–100 drawn as a bar plus "n%" */
  bar?: boolean;
};
export type ReportCell = string | number | { text: string; tone?: Tone };
export type ReportTable = {
  heading: string;
  note?: string;
  columns: ReportColumn[];
  rows: ReportCell[][];
  totals?: ReportCell[];
  empty?: string;
};
export type Report = {
  eyebrow: string;
  title: string;
  lines: string[];
  boxes: { label: string; value: string; tone?: Tone }[];
  tables: ReportTable[];
  generatedOn: string;
  footer: string;
};

export type RenderedReport = { bytes: Uint8Array; pageCount: number };

export async function renderReportPdf(r: Report): Promise<RenderedReport> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${r.eyebrow} - ${r.title}`);
  doc.setAuthor("MRRMR");
  doc.setCreator("MRRMR");
  doc.setProducer("MRRMR (pdf-lib)");
  doc.setCreationDate(new Date(`${r.generatedOn}T00:00:00Z`));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const t = safeText(font);
  const tb = safeText(bold);
  const full = A4[0] - 2 * M;

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - M;

  // ---- first-page header ----
  page.drawText("MRRMR", { x: M, y: y - 10, size: 11, font: bold, color: BRAND });
  const eb = t(r.eyebrow);
  page.drawText(eb, { x: A4[0] - M - font.widthOfTextAtSize(eb, 10), y: y - 10, size: 10, font, color: MUTED });
  y -= 40;
  page.drawText(tb(r.title), { x: M, y, size: 20, font: bold, color: INK, maxWidth: full });
  y -= 18;
  for (const l of r.lines) { page.drawText(t(l), { x: M, y, size: 9.5, font, color: MUTED, maxWidth: full }); y -= 13; }
  y -= 9;

  if (r.boxes.length) {
    const gap = 8, bw = (full - gap * (r.boxes.length - 1)) / r.boxes.length, bh = 44;
    r.boxes.forEach((b, i) => {
      const x = M + i * (bw + gap);
      page.drawRectangle({ x, y: y - bh, width: bw, height: bh, color: BAND, borderColor: LINE, borderWidth: 0.5 });
      page.drawText(tb(b.label.toUpperCase()), { x: x + 8, y: y - 14, size: 7, font: bold, color: MUTED, maxWidth: bw - 16 });
      const v = tb(b.value);
      const size = Math.min(11.5, (11.5 * (bw - 16)) / Math.max(bold.widthOfTextAtSize(v, 11.5), 1));
      page.drawText(v, { x: x + 8, y: y - 32, size, font: bold, color: TONE[b.tone ?? "ink"] });
    });
    y -= bh + 18;
  }

  const newPage = () => {
    page = doc.addPage(A4);
    const yy = A4[1] - M;
    page.drawText("MRRMR", { x: M, y: yy - 10, size: 9, font: bold, color: BRAND });
    page.drawText(t(`${r.eyebrow} · ${r.title}`), { x: M + 46, y: yy - 10, size: 8.5, font, color: MUTED, maxWidth: full - 46 });
    y = yy - 26;
  };

  // ---- tables ----
  for (const table of r.tables) {
    const unit = full / table.columns.reduce((s, c) => s + c.w, 0);
    const widths = table.columns.map((c) => c.w * unit);
    const headH = LINE_H + 2 * PAD + 2;
    const textOf = (c: ReportCell) => (typeof c === "object" ? c.text : String(c));
    const lineCount = (row: ReportCell[]) => Math.max(1, ...row.map((c, i) => (table.columns[i].bar || table.columns[i].right ? 1 : wrap(t(textOf(c)), font, SIZE, widths[i] - 2 * PAD).length)));
    const heightOf = (row: ReportCell[]) => lineCount(row) * LINE_H + 2 * PAD - 2;

    // Heading + note + header row need to fit together with at least one row.
    if (y - (34 + headH + LINE_H * 2) < M + FOOTER) newPage();
    page.drawText(tb(table.heading), { x: M, y: y - 12, size: 12.5, font: bold, color: INK });
    y -= 18;
    if (table.note) { page.drawText(t(table.note), { x: M, y: y - 9, size: 8.5, font, color: MUTED, maxWidth: full }); y -= 14; }
    y -= 4;

    const drawHead = () => {
      page.drawRectangle({ x: M, y: y - headH, width: full, height: headH, color: BAND });
      let x = M;
      table.columns.forEach((c, i) => {
        const label = tb(c.label);
        const w = bold.widthOfTextAtSize(label, 7.5);
        page.drawText(label, { x: c.right ? x + widths[i] - PAD - w : x + PAD, y: y - PAD - 9, size: 7.5, font: bold, color: MUTED });
        x += widths[i];
      });
      page.drawLine({ start: { x: M, y: y - headH }, end: { x: A4[0] - M, y: y - headH }, thickness: 0.6, color: LINE });
      y -= headH;
    };
    drawHead();

    const drawRow = (row: ReportCell[], strong: boolean) => {
      const h = heightOf(row);
      if (y - h < M + FOOTER) { newPage(); drawHead(); }
      if (strong) page.drawRectangle({ x: M, y: y - h, width: full, height: h, color: BAND });
      const f = strong ? bold : font;
      const tf = strong ? tb : t;
      let x = M;
      row.forEach((cell, i) => {
        const col = table.columns[i];
        const wdt = widths[i];
        const tone = typeof cell === "object" ? cell.tone : undefined;
        const color = TONE[tone ?? "ink"];
        if (col.bar && typeof cell === "number") {
          const pct = Math.max(0, Math.min(100, cell));
          const label = `${Math.round(pct * 10) / 10}%`;
          const lw = font.widthOfTextAtSize(label, 7.5);
          const barW = Math.max(wdt - 2 * PAD - lw - 6, 10);
          page.drawRectangle({ x: x + PAD, y: y - PAD - 7, width: barW, height: 5, color: BAND, borderColor: LINE, borderWidth: 0.3 });
          if (pct > 0) page.drawRectangle({ x: x + PAD, y: y - PAD - 7, width: Math.max((barW * pct) / 100, 1), height: 5, color: BRAND });
          page.drawText(label, { x: x + wdt - PAD - lw, y: y - PAD - 8, size: 7.5, font, color: MUTED });
        } else {
          const text = tf(textOf(cell));
          if (col.right) {
            const size = Math.min(SIZE, (SIZE * (wdt - 2 * PAD)) / Math.max(f.widthOfTextAtSize(text, SIZE), 1));
            const w = f.widthOfTextAtSize(text, size);
            page.drawText(text, { x: x + wdt - PAD - w, y: y - PAD - 8, size, font: f, color });
          } else {
            wrap(text, f, SIZE, wdt - 2 * PAD).forEach((l, k) => page.drawText(l, { x: x + PAD, y: y - PAD - 8 - k * LINE_H, size: SIZE, font: f, color }));
          }
        }
        x += wdt;
      });
      page.drawLine({ start: { x: M, y: y - h }, end: { x: A4[0] - M, y: y - h }, thickness: 0.4, color: LINE });
      y -= h;
    };

    if (!table.rows.length) drawRow([table.empty ?? "Nothing in this period.", ...table.columns.slice(1).map(() => "")], false);
    for (const row of table.rows) drawRow(row, false);
    if (table.totals) drawRow(table.totals, true);
    y -= 18;
  }

  // ---- footers ----
  const n = doc.getPageCount();
  for (let i = 0; i < n; i++) {
    const p = doc.getPage(i);
    p.drawLine({ start: { x: M, y: M + 18 }, end: { x: A4[0] - M, y: M + 18 }, thickness: 0.5, color: LINE });
    p.drawText(t(r.footer), { x: M, y: M + 6, size: 7.5, font, color: MUTED, maxWidth: full - 70 });
    const label = `Page ${i + 1} of ${n}`;
    p.drawText(label, { x: A4[0] - M - font.widthOfTextAtSize(label, 7.5), y: M + 6, size: 7.5, font, color: MUTED });
  }

  return { bytes: await doc.save(), pageCount: n };
}
