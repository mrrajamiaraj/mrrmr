// Phase 6: CI and Dependabot configuration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

test("CI: read-only token, runs npm ci, tests, build, audit and a full-history gitleaks scan", () => {
  const ci = read("../.github/workflows/ci.yml");
  assert.match(ci, /^permissions:\r?\n  contents: read\r?$/m);
  for (const step of ["npm ci", "npm test", "npm run build", "npm audit --omit=dev"]) assert.ok(ci.includes(`run: ${step}`), step);
  assert.match(ci, /fetch-depth: 0/);
  assert.match(ci, /gitleaks git --log-opts="--all"/);
  assert.match(ci, /sha256sum --check/);
  assert.match(ci, /persist-credentials: false/);
});

test("every GitHub Action in every workflow is pinned to a full commit SHA", () => {
  const dir = new URL("../.github/workflows/", import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), "utf8");
    for (const m of src.matchAll(/uses:\s*([^\s#]+)/g)) assert.match(m[1], /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${f}: ${m[1]}`);
  }
});

test("Dependabot: npm and github-actions, weekly", () => {
  const d = read("../.github/dependabot.yml");
  assert.match(d, /package-ecosystem: npm[\s\S]*?interval: weekly/);
  assert.match(d, /package-ecosystem: github-actions[\s\S]*?interval: weekly/);
});
