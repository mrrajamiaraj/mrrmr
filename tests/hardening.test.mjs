// Phase 5: server actions, exports and input surface. Mostly source checks: these modules import Next/Supabase.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const fnBody = (src, name) => src.slice(src.indexOf(`export async function ${name}(`)).split(/\nexport /)[0];

test("server actions: only our own host is an extra allowed origin; body limit 100 KB", () => {
  const cfg = read("../next.config.ts");
  assert.match(cfg, /allowedOrigins: siteHost \? \[siteHost\] : \[\]/);
  assert.match(cfg, /bodySizeLimit: "100kb"/);
  assert.ok(!/allowedOrigins:[^\n]*\*/.test(cfg), "no wildcard origins");
});

test("every id an action takes from the client is shape-checked before any query", () => {
  const src = read("../lib/actions.ts");
  const checks = {
    setAccountBalance: "isUuid(accountId)", addDebitUse: "isUuid(accountId)", setDebitUsed: "isUuid(accountId)",
    setCardBalance: "isUuid(cardId)", updateCardDetails: "isUuid(cardId)", addLoan: "badId(input.accountId)",
    addCardUse: "isUuid(input.cardId)", addCardPurchase: "isUuid(input.cardId)", recordRepayment: "isUuid(input.personId)",
    updatePerson: "isUuid(personId)", deletePerson: "isUuid(personId)", deleteEntries: "isUuid(e.id)",
  };
  for (const [fn, check] of Object.entries(checks)) {
    const body = fnBody(src, fn);
    assert.ok(body.includes(check), `${fn}: ${check}`);
    assert.ok(body.indexOf(check) < body.indexOf("await writer()"), `${fn}: checked before the database is touched`);
  }
  const research = read("../lib/research-actions.ts");
  for (const fn of ["saveExpense", "deleteExpense", "saveContribution", "deleteContribution"]) assert.match(fnBody(research, fn), /isUuid\(id\)/, fn);
});

test("free-text method/via are capped; booleans must be real booleans", () => {
  const src = read("../lib/actions.ts");
  assert.match(src, /p_method: req\(input\.method, 40\)/);
  assert.match(src, /p_via: req\(input\.via, 40\)/);
  assert.match(src, /p_deduct: input\.deduct === true/);
  assert.match(src, /typeof input\.addToAccount !== "boolean"/);
});

test("database errors never reach the user raw (only our own RAISE messages, P0001)", () => {
  for (const f of ["../lib/actions.ts", "../lib/research-actions.ts"]) {
    const src = read(f);
    const friendly = src.slice(src.indexOf("function friendly("), src.indexOf("function done("));
    assert.ok(!/return (m|e\.message);\s*\}\s*$/m.test(friendly.trim()), `${f}: no raw fallback`);
    assert.match(friendly, /Could not save that right now/);
  }
  const actions = read("../lib/actions.ts");
  for (const fn of ["savePrefs", "changePassword", "sendPasswordReset"]) assert.ok(!fnBody(actions, fn).includes("error.message"), fn);
});

test("every export route checks access and rate-limits in the route itself, before reading data", () => {
  for (const [f, kind] of [["../app/export/route.ts", "admin"], ["../app/export/pdf/route.ts", "admin"], ["../app/research/export/route.ts", "research"], ["../app/research/export/pdf/route.ts", "research"]]) {
    const src = read(f);
    const guard = src.indexOf(`await exportGuard("${kind}")`);
    const load = src.search(/await load(Finance|Research)\(/);
    assert.ok(guard > 0 && load > guard, `${f}: guard (${kind}) before data`);
    assert.match(src, /"Cache-Control": "private, no-store"/, `${f}: private, no-store`);
  }
  const guard = read("../lib/export-guard.ts");
  assert.match(guard, /limiter\("exportUser"\)/);
  assert.match(guard, /kind === "admin" && viewer/);
  for (const f of ["../app/export/pdf/route.ts", "../app/research/export/pdf/route.ts"]) {
    const src = read(f);
    assert.match(src, /pdfRangeTooLong\(from, to\)/, f);
    assert.match(src, /pdfTooBig\(/, f);
  }
});

test("no eval / new Function anywhere; dangerouslySetInnerHTML only for the fixed theme script", () => {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n)) files.push(p); } };
  for (const d of ["app", "components", "lib"]) walk(new URL(`../${d}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const hits = [];
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    if (/\beval\(|new Function\(/.test(s)) hits.push(`eval: ${f}`);
    const inner = s.match(/dangerouslySetInnerHTML=\{\{ __html: (\w+) \}\}/g) ?? [];
    if (/dangerouslySetInnerHTML/.test(s) && !inner.every((m) => m.includes("themeScript"))) hits.push(`innerHTML: ${f}`);
  }
  assert.deepEqual(hits, []);
});
