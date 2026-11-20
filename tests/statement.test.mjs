// Person statements and their PDF: running balance, date filtering with an opening balance, only that person's data,
// and the A4 PDF (empty, short, multi-page, filtered) with repeated table headers and page numbers. Synthetic data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { buildStatement, slug } from "../lib/statement.ts";
import { renderStatementPdf, renderEveryonePdf, balanceText } from "../lib/pdf.ts";

const TODAY = "2026-11-19";
const person = (id, name) => ({ id, name, relation: null, phone: null, notes: null });
const card = { id: "c1", slot: 1, bank: "City Bank", name: "Demo", network: null, last4: "4242", credit_limit: 200000, balance: 0, pay_by: null, updated_at: "" };
const loan = (o) => ({ id: "l1", person_id: "p1", account_id: "a1", amount: 1000, taken_on: "2026-01-01", reason: "Rent", method: "Bank transfer", due_on: null, created_at: "2026-01-01T00:00:00Z", ...o });
const use = (o) => ({ id: "u1", card_id: "c1", person_id: "p1", amount: 1000, used_on: "2026-01-02", reason_or_place: "Phone", category: "Electronics", due_on: null, pay_plan: "full", emi_months: null, created_at: "2026-01-02T00:00:00Z", ...o });
const rep = (o) => ({ id: "r1", person_id: "p1", amount: 100, paid_on: "2026-01-05", via: "Cash", applies_to: "loan", card_id: null, account_id: null, created_at: "2026-01-05T00:00:00Z", ...o });
const data = (o) => ({ accounts: [], cards: [card], people: [person("p1", "Ayesha Rahman"), person("p2", "Other Person")], loans: [], cardUses: [], repayments: [], summary: [], ...o });

/** Text drawn in a pdf-lib PDF: inflate each content stream and decode the hex strings passed to Tj. */
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
    const raw = buf.subarray(start, end);
    let s;
    try { s = inflateSync(raw).toString("latin1"); } catch { s = raw.toString("latin1"); }
    for (const m of s.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) out.push(Buffer.from(m[1], "hex").toString("latin1"));
    for (const m of s.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) out.push(m[1]);
    i = end + 9;
  }
  return out;
}

test("running balance in date order; only this person's rows", () => {
  const d = data({
    loans: [loan({ amount: 5000 }), loan({ id: "lx", person_id: "p2", amount: 99999 })],
    cardUses: [use({ amount: 3000, emi_charges: 150, pay_plan: "emi", emi_months: 6 })],
    repayments: [rep({ amount: 2000 }), rep({ id: "r2", amount: 1000.5, paid_on: "2026-02-01", applies_to: "card", card_id: "c1", via: "bKash" })],
  });
  const s = buildStatement(d, "p1", TODAY);
  assert.equal(s.rows.length, 4);
  assert.deepEqual(s.rows.map((r) => r.balance), [5000, 8150, 6150, 5149.5]);
  assert.equal(s.rows[1].borrowed, 3150, "a card purchase owes amount + EMI charges");
  assert.equal(s.rows[3].method, "bKash");
  assert.ok(!s.rows.some((r) => r.id === "lx"), "another person's loan is never included");
  assert.equal(s.closing, 5149.5);
  assert.equal(s.opening, 0);
  assert.equal(s.closing, Math.round((s.opening + s.borrowed - s.repaid) * 100) / 100);
});

test("date filter carries an opening balance so the running balance reconciles", () => {
  const d = data({
    loans: [loan({ amount: 5000 }), loan({ id: "l2", amount: 700, taken_on: "2026-03-10" })],
    repayments: [rep({ amount: 1000 }), rep({ id: "r2", amount: 300, paid_on: "2026-03-15" }), rep({ id: "r3", amount: 50, paid_on: "2026-05-01" })],
  });
  const s = buildStatement(d, "p1", TODAY, { from: "2026-03-01", to: "2026-03-31" });
  assert.equal(s.opening, 4000);
  assert.deepEqual(s.rows.map((r) => r.id), ["l2", "r2"]);
  assert.equal(s.rows[0].balance, 4700);
  assert.equal(s.closing, 4400);
  assert.equal(s.closing, s.opening + s.borrowed - s.repaid);
  assert.equal(s.allTime.balance, 4350, "all-time balance ignores the filter");
  assert.match(s.filename, /^MRRMR-statement-Ayesha-Rahman-2026-03-01-to-2026-03-31\.pdf$/);
});

test("overpayment shows as a credit, not a clamped zero", () => {
  const s = buildStatement(data({ loans: [loan({ amount: 100 })], repayments: [rep({ amount: 150 })] }), "p1", TODAY);
  assert.equal(s.closing, -50);
  assert.equal(balanceText(-50), "50.00 CR");
});

test("unknown person → null; filenames are ASCII", () => {
  assert.equal(buildStatement(data({}), "nope", TODAY), null);
  assert.equal(slug("Mamun Vai (office)"), "Mamun-Vai-office");
  assert.equal(slug("রহিম"), "person");
});

test("PDF: empty history renders one A4 page with a clear note", async () => {
  const s = buildStatement(data({}), "p1", TODAY);
  const r = await renderStatementPdf(s);
  const doc = await PDFDocument.load(r.bytes);
  assert.equal(doc.getPageCount(), 1);
  const { width, height } = doc.getPage(0).getSize();
  assert.equal(Math.round(width), 595); assert.equal(Math.round(height), 842);
  const text = (await pdfText(r.bytes)).join("\n");
  assert.match(text, /No entries recorded for this person\./);
  assert.match(text, /Ayesha Rahman/);
  assert.match(text, /Page 1 of 1/);
  assert.match(text, /Exported: Nov 19, 2026/);
});

test("PDF: short history has every row, totals and the person's name, nobody else's", async () => {
  const d = data({ loans: [loan({ amount: 5000 }), loan({ id: "lx", person_id: "p2", amount: 777 })], repayments: [rep({ amount: 1250.75 })] });
  const r = await renderStatementPdf(buildStatement(d, "p1", TODAY), { outstandingNow: 3749.25, nextDue: "2026-12-01" });
  const text = (await pdfText(r.bytes)).join("\n");
  assert.equal(r.pageCount, 1);
  assert.match(text, /5,000\.00/);
  assert.match(text, /1,250\.75/);
  assert.match(text, /3,749\.25/);
  assert.match(text, /Next due: Dec 1, 2026/);
  assert.doesNotMatch(text, /777\.00|Other Person/);
});

test("PDF: multi-page history repeats the table header on every page and numbers pages", async () => {
  const loans = Array.from({ length: 140 }, (_, i) => loan({ id: `l${i}`, amount: 100 + i, taken_on: `2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`, reason: `Synthetic entry number ${i} with a fairly long description so that it wraps onto a second line` }));
  const r = await renderStatementPdf(buildStatement(data({ loans }), "p1", TODAY));
  assert.ok(r.pageCount >= 3, `expected several pages, got ${r.pageCount}`);
  assert.equal(r.rowsPerPage.reduce((a, b) => a + b, 0), 140, "every row is drawn exactly once");
  const text = await pdfText(r.bytes);
  assert.equal(text.filter((x) => x === "Balance").length, r.pageCount, "table header on every page");
  for (let p = 1; p <= r.pageCount; p++) assert.ok(text.includes(`Page ${p} of ${r.pageCount}`));
});

test("PDF: filtered export shows the period and an opening-balance row", async () => {
  const d = data({ loans: [loan({ amount: 5000 }), loan({ id: "l2", amount: 700, taken_on: "2026-03-10" })], repayments: [rep({ amount: 1000 })] });
  const r = await renderStatementPdf(buildStatement(d, "p1", TODAY, { from: "2026-03-01", to: "2026-03-31" }));
  const text = (await pdfText(r.bytes)).join("\n");
  assert.match(text, /Opening balance \(carried forward\)/);
  assert.match(text, /4,000\.00/);
  assert.match(text, /Mar 1, 2026 to Mar 31, 2026/);
  assert.match(text, /4,700\.00/);
});

test("PDF: names the standard font can't draw don't break the export", async () => {
  const d = data({ people: [person("p1", "রহিম Uddin")], loans: [loan({ reason: "চিকিৎসা" })] });
  const r = await renderStatementPdf(buildStatement(d, "p1", TODAY));
  assert.equal(r.pageCount, 1);
});

test("everyone PDF: a summary page with totals, then each person's statement; people with no entries left out", async () => {
  const d = data({
    people: [person("p1", "Ayesha Rahman"), person("p2", "Other Person"), person("p3", "Nobody Yet")],
    loans: [loan({ id: "l1", amount: 1000 }), loan({ id: "l2", person_id: "p2", amount: 500.5 })],
    repayments: [rep({ id: "r1", amount: 100 })],
  });
  const items = ["p1", "p2", "p3"].map((id) => ({ s: buildStatement(d, id, TODAY, { from: null, to: null }), outstandingNow: undefined, nextDue: null }));
  const out = await renderEveryonePdf(items, TODAY, { from: null, to: null });
  const solo1 = await renderStatementPdf(items[0].s);
  const solo2 = await renderStatementPdf(items[1].s);
  assert.equal(out.pageCount, 1 + solo1.pageCount + solo2.pageCount, "summary page + both statements; Nobody Yet skipped");
  const doc = await PDFDocument.load(out.bytes);
  assert.equal(doc.getPageCount(), out.pageCount);
  const text = (await pdfText(out.bytes)).join("|");
  assert.match(text, /Everyone/);
  assert.match(text, /Totals \(2 people\)/);
  assert.match(text, /1,400\.50/, "closing balances add up exactly: 900 + 500.50");
  assert.ok(!/Nobody Yet/.test(text), "a person with no entries is not listed");
});
