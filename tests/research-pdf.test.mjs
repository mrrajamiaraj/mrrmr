// Research ledger PDFs: every section renders; figures match lib/research-stats; the expenses filter is honoured;
// long tables span pages with the header repeated. Synthetic data only. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { RESEARCH_SECTIONS, buildResearchReport, renderResearchPdf, researchPdfName } from "../lib/research-pdf.ts";
import { filterExpenses } from "../lib/research-stats.ts";

const ex = (id, spent_on, facility, member, amount, description = "Scan", tag = null) => ({ id, spent_on, facility, member, description, tag, amount, created_at: id });
const co = (id, paid_on, member, amount) => ({ id, paid_on, member, note: "Cash", amount, created_at: id });
const base = {
  expenses: [ex("e1", "2026-01-05", "BHS", "Raja", 0.1), ex("e2", "2026-01-20", "BHS", "Somik", 0.2, "Printer", "Printer Vara"), ex("e3", "2026-03-02", "NICVD", "Raja", 500)],
  contributions: [co("c1", "2026-01-01", "Raja", 1000), co("c2", "2026-04-10", "Somik", 250)],
  facilities: ["BHS", "NICVD"], members: ["Raja", "Somik"], from: null, to: null, generatedOn: "2026-11-21",
};

async function pdfText(bytes) {
  const buf = Buffer.from(bytes);
  const out = [];
  let i = 0;
  while ((i = buf.indexOf("stream", i)) !== -1) {
    let start = i + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const end = buf.indexOf("endstream", start);
    if (end === -1) break;
    let s;
    try { s = inflateSync(buf.subarray(start, end)).toString("latin1"); } catch { s = buf.subarray(start, end).toString("latin1"); }
    for (const m of s.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) out.push(Buffer.from(m[1], "hex").toString("latin1"));
    i = end + 9;
  }
  return out.join("|");
}

test("every section renders a valid PDF", async () => {
  for (const s of RESEARCH_SECTIONS) {
    const out = await renderResearchPdf(s, base);
    const doc = await PDFDocument.load(out.bytes);
    assert.equal(doc.getPageCount(), out.pageCount, s);
    assert.ok(out.pageCount >= 1, s);
  }
});

test("settlement figures are exact and match memberBalances", async () => {
  const text = await pdfText((await renderResearchPdf("settlement", base)).bytes);
  assert.match(text, /BDT 1,250\.00/, "contributed total");
  assert.match(text, /BDT 500\.30/, "spent total: 0.1 + 0.2 + 500 exactly");
  assert.match(text, /\+BDT 499\.90/, "Raja: 1000 - 500.10");
});

test("the expenses PDF honours the list's filters (same function as the page)", async () => {
  const filter = { fac: "BHS", q: "printer" };
  assert.deepEqual(filterExpenses(base.expenses, filter).map((e) => e.id), ["e2"]);
  const r = buildResearchReport("expenses", { ...base, filter });
  assert.equal(r.tables[0].rows.length, 1);
  assert.match(r.lines.join(" "), /Showing only: facility BHS, matching "printer"/);
  const text = await pdfText((await renderResearchPdf("expenses", { ...base, filter })).bytes);
  assert.ok(!/NICVD/.test(text), "a filtered-out facility is not in the file");
});

test("a long expenses table spans pages and repeats its header", async () => {
  const many = Array.from({ length: 140 }, (_, k) => ex(`x${k}`, "2026-02-01", "BHS", "Raja", 10 + k));
  const out = await renderResearchPdf("expenses", { ...base, expenses: many });
  assert.ok(out.pageCount >= 3);
  const text = await pdfText(out.bytes);
  assert.ok((text.match(/\|Description\|/g) ?? []).length >= out.pageCount, "header on every page");
  assert.match(text, /Page 3 of/);
});

test("filenames are ASCII and carry the range", () => {
  assert.equal(researchPdfName("contributions", null, null, "2026-11-21"), "MRRMR-research-contributions-2026-11-21.pdf");
  assert.equal(researchPdfName("all", "2026-01-01", null, "2026-11-21"), "MRRMR-research-all-2026-01-01-to-2026-11-21-2026-11-21.pdf");
});
