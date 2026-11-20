// Renders a Statement (lib/statement) as an A4 PDF: header with the person, period and export date; summary totals;
// an itemised table whose header repeats on every page; an opening-balance row for filtered exports; page numbers.
// Uses pdf-lib's standard Helvetica (no font files, works on any server). Amounts are written as "BDT 1,43,345.00"
// because the standard PDF fonts have no Taka sign.
//
// Relative imports so Node's test runner can load this file directly.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { dateLong } from "./format.ts";
import { bdt, type Statement, type StatementRow } from "./statement.ts";

const A4: [number, number] = [595.28, 841.89];
const M = 40; // margin
const INK = rgb(0.11, 0.106, 0.094);
const MUTED = rgb(0.38, 0.38, 0.36);
const LINE = rgb(0.84, 0.83, 0.8);
const BAND = rgb(0.955, 0.95, 0.94);
const BRAND = rgb(0.086, 0.439, 0.353);
const OWED = rgb(0.55, 0.33, 0.05);

type Col = { key: string; label: string; w: number; right?: boolean };
const FIXED: Col[] = [
  { key: "date", label: "Date", w: 60 },
  { key: "type", label: "Type", w: 62 },
  { key: "desc", label: "Description", w: 0 },
  { key: "method", label: "Method", w: 62 },
  { key: "borrowed", label: "Borrowed", w: 64, right: true },
  { key: "repaid", label: "Repaid", w: 64, right: true },
  { key: "balance", label: "Balance", w: 72, right: true },
];
const COLS: Col[] = FIXED.map((c) => (c.key === "desc" ? { ...c, w: A4[0] - 2 * M - FIXED.reduce((s, x) => s + x.w, 0) } : c));

const SIZE = 8.5;
const LINE_H = 11;
const PAD = 5;

/** Signed balance for a statement: "1,000.00", or "1,000.00 CR" when they are in credit. */
export function balanceText(n: number) {
  return `${bdt(n)}${n < 0 ? " CR" : ""}`;
}

export function periodText(s: Pick<Statement, "from" | "to" | "generatedOn" | "rows">) {
  if (!s.from && !s.to) return `Full history${s.rows.length ? ` (${dateLong(s.rows[0].iso)} to ${dateLong(s.rows[s.rows.length - 1].iso)})` : ""}`;
  return `${s.from ? dateLong(s.from) : "First entry"} to ${dateLong(s.to ?? s.generatedOn)}`;
}

/** Characters the standard font can't encode (e.g. Bangla script) become "?" instead of failing the whole export. */
function safeText(font: PDFFont) {
  const ok = new Set(font.getCharacterSet());
  return (s: string) => [...s.replace(/−/g, "-").replace(/[–—]/g, "-")].map((ch) => (ok.has(ch.codePointAt(0)!) ? ch : "?")).join("");
}

/** Splits text into at most `max` lines that fit `width`; the last line gets an ellipsis when cut. */
function wrap(text: string, font: PDFFont, size: number, width: number, max = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width) { cur = next; continue; }
    if (cur) lines.push(cur);
    cur = w;
    if (lines.length === max) break;
  }
  if (lines.length < max && cur) lines.push(cur);
  const cut = lines.length === max && words.join(" ") !== lines.join(" ");
  if (cut) {
    let last = lines[max - 1];
    while (last && font.widthOfTextAtSize(`${last}...`, size) > width) last = last.slice(0, -1);
    lines[max - 1] = `${last}...`;
  }
  return lines.map((l) => {
    let x = l;
    while (x.length > 1 && font.widthOfTextAtSize(x, size) > width) x = x.slice(0, -1);
    return x;
  });
}

type Line = { kind: "opening" | "row" | "empty" | "total"; cells: Record<string, string>; desc: string[]; strong?: boolean };

export type RenderedStatement = { bytes: Uint8Array; pageCount: number; rowsPerPage: number[] };

export async function renderStatementPdf(s: Statement, extra: { nextDue?: string | null; outstandingNow?: number } = {}): Promise<RenderedStatement> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Statement - ${s.name}`);
  doc.setAuthor("MRRMR");
  doc.setSubject(`Statement of account, ${periodText(s)}`);
  doc.setCreator("MRRMR");
  doc.setProducer("MRRMR (pdf-lib)");
  doc.setCreationDate(new Date(`${s.generatedOn}T00:00:00Z`));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const t = safeText(font);
  const descW = COLS.find((c) => c.key === "desc")!.w - 2 * PAD;

  // ---- table lines ---------------------------------------------------------------------------------------------
  const lines: Line[] = [];
  if (s.from) lines.push({ kind: "opening", strong: true, desc: ["Opening balance (carried forward)"], cells: { date: dateLong(s.from), balance: balanceText(s.opening) } });
  for (const r of s.rows) lines.push(rowLine(r));
  if (!s.rows.length) lines.push({ kind: "empty", desc: [s.from || s.to ? "No entries in this period." : "No entries recorded for this person."], cells: {} });
  lines.push({ kind: "total", strong: true, desc: ["Totals for this period"], cells: { borrowed: bdt(s.borrowed), repaid: bdt(s.repaid), balance: balanceText(s.closing) } });

  function rowLine(r: StatementRow): Line {
    return {
      kind: "row",
      desc: wrap(t(r.description), font, SIZE, descW),
      cells: {
        date: dateLong(r.iso), type: r.type, method: r.method ?? "",
        borrowed: r.borrowed != null ? bdt(r.borrowed) : "", repaid: r.repaid != null ? bdt(r.repaid) : "", balance: balanceText(r.balance),
      },
    };
  }
  const heightOf = (l: Line) => Math.max(l.desc.length, 1) * LINE_H + 2 * PAD - 2;

  // ---- pagination ----------------------------------------------------------------------------------------------
  const FOOTER = 34;
  const headH = LINE_H + 2 * PAD + 2;
  const pages: { page: PDFPage; lines: Line[] }[] = [];
  let page: PDFPage = doc.addPage(A4);
  let y = drawFirstHeader(page);
  let current: Line[] = [];
  y = drawTableHead(page, y);
  for (const l of lines) {
    const h = heightOf(l);
    if (y - h < M + FOOTER) {
      pages.push({ page, lines: current });
      page = doc.addPage(A4);
      current = [];
      y = drawContHeader(page);
      y = drawTableHead(page, y);
    }
    drawLine(page, l, y);
    current.push(l);
    y -= h;
  }
  pages.push({ page, lines: current });

  const n = pages.length;
  pages.forEach(({ page: p }, i) => {
    p.drawLine({ start: { x: M, y: M + 18 }, end: { x: A4[0] - M, y: M + 18 }, thickness: 0.5, color: LINE });
    p.drawText(t(`Generated by MRRMR on ${dateLong(s.generatedOn)}. Balance = what is owed after each entry; CR = in credit.`), { x: M, y: M + 6, size: 7.5, font, color: MUTED });
    const label = `Page ${i + 1} of ${n}`;
    p.drawText(label, { x: A4[0] - M - font.widthOfTextAtSize(label, 7.5), y: M + 6, size: 7.5, font, color: MUTED });
  });

  const bytes = await doc.save();
  return { bytes, pageCount: n, rowsPerPage: pages.map((p) => p.lines.filter((l) => l.kind === "row").length) };

  // ---- drawing helpers -----------------------------------------------------------------------------------------
  function drawFirstHeader(p: PDFPage) {
    let yy = A4[1] - M;
    p.drawText("MRRMR", { x: M, y: yy - 10, size: 11, font: bold, color: BRAND });
    const st = "Statement of account";
    p.drawText(st, { x: A4[0] - M - font.widthOfTextAtSize(st, 10), y: yy - 10, size: 10, font, color: MUTED });
    yy -= 40;
    p.drawText(t(s.name), { x: M, y: yy, size: 20, font: bold, color: INK, maxWidth: A4[0] - 2 * M });
    yy -= 18;
    p.drawText(t(`Period: ${periodText(s)}`), { x: M, y: yy, size: 9.5, font, color: INK });
    yy -= 13;
    p.drawText(t(`Exported: ${dateLong(s.generatedOn)}  ·  Amounts in Bangladeshi Taka (BDT)`), { x: M, y: yy, size: 9.5, font, color: MUTED });
    yy -= 22;

    // Summary boxes. A filtered export shows the opening balance so the running balance reconciles.
    const boxes: [string, string, typeof INK][] = [
      ...(s.from ? [["Opening balance", balanceText(s.opening), INK] as [string, string, typeof INK]] : []),
      ["Borrowed", bdt(s.borrowed), INK],
      ["Repaid", bdt(s.repaid), BRAND],
      [s.from || s.to ? "Closing balance" : "Balance owed", balanceText(s.closing), OWED],
    ];
    const gap = 8, bw = (A4[0] - 2 * M - gap * (boxes.length - 1)) / boxes.length, bh = 44;
    boxes.forEach(([label, value, color], i) => {
      const x = M + i * (bw + gap);
      p.drawRectangle({ x, y: yy - bh, width: bw, height: bh, color: BAND, borderColor: LINE, borderWidth: 0.5 });
      p.drawText(label.toUpperCase(), { x: x + 8, y: yy - 14, size: 7, font: bold, color: MUTED });
      p.drawText(`BDT ${value}`, { x: x + 8, y: yy - 32, size: 11.5, font: bold, color });
    });
    yy -= bh + 14;

    const notes = [
      extra.outstandingNow != null ? `Outstanding today (all sources): BDT ${bdt(extra.outstandingNow)}` : null,
      extra.nextDue ? `Next due: ${dateLong(extra.nextDue)}` : null,
      `${s.rows.length} ${s.rows.length === 1 ? "entry" : "entries"} in this period`,
    ].filter(Boolean).join("  ·  ");
    p.drawText(t(notes), { x: M, y: yy, size: 8.5, font, color: MUTED });
    return yy - 14;
  }

  function drawContHeader(p: PDFPage) {
    const yy = A4[1] - M;
    p.drawText("MRRMR", { x: M, y: yy - 10, size: 9, font: bold, color: BRAND });
    p.drawText(t(`Statement · ${s.name} · ${periodText(s)}`), { x: M + 46, y: yy - 10, size: 8.5, font, color: MUTED, maxWidth: A4[0] - 2 * M - 46 });
    return yy - 24;
  }

  function drawTableHead(p: PDFPage, yy: number) {
    p.drawRectangle({ x: M, y: yy - headH, width: A4[0] - 2 * M, height: headH, color: BAND });
    let x = M;
    for (const c of COLS) {
      const w = bold.widthOfTextAtSize(c.label, 7.5);
      p.drawText(c.label, { x: c.right ? x + c.w - PAD - w : x + PAD, y: yy - PAD - 9, size: 7.5, font: bold, color: MUTED });
      x += c.w;
    }
    p.drawLine({ start: { x: M, y: yy - headH }, end: { x: A4[0] - M, y: yy - headH }, thickness: 0.6, color: LINE });
    return yy - headH;
  }

  function drawLine(p: PDFPage, l: Line, yy: number) {
    const h = heightOf(l);
    if (l.kind === "total" || l.kind === "opening") p.drawRectangle({ x: M, y: yy - h, width: A4[0] - 2 * M, height: h, color: BAND });
    const f = l.strong ? bold : font;
    let x = M;
    for (const c of COLS) {
      if (c.key === "desc") {
        l.desc.forEach((d, i) => p.drawText(t(d), { x: x + PAD, y: yy - PAD - 8 - i * LINE_H, size: SIZE, font: f, color: l.kind === "empty" ? MUTED : INK }));
      } else {
        const v = t(l.cells[c.key] ?? "");
        if (v) {
          // Very large amounts shrink to fit their column rather than overflowing into the next one.
          const avail = c.w - 2 * PAD;
          const size = Math.min(SIZE, (SIZE * avail) / f.widthOfTextAtSize(v, SIZE));
          const w = f.widthOfTextAtSize(v, size);
          const color = c.key === "repaid" ? BRAND : c.key === "balance" && l.kind !== "row" ? OWED : INK;
          p.drawText(v, { x: c.right ? x + c.w - PAD - w : x + PAD, y: yy - PAD - 8, size, font: f, color });
        }
      }
      x += c.w;
    }
    p.drawLine({ start: { x: M, y: yy - h }, end: { x: A4[0] - M, y: yy - h }, thickness: 0.4, color: LINE });
  }
}
