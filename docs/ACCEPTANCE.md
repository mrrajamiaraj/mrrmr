# MRRMR — Final Acceptance Report (2026-11-19)

Status words: **Verified** = implemented and checked (test, live database check, or in the browser with real data);
**Built** = implemented and type-checked, not exercised end-to-end; **Pending** = needs a migration or your action;
**Not done**.

## 1. Features delivered
| Area | Status | Evidence |
| --- | --- | --- |
| Exact money arithmetic (paisa) everywhere | Verified | `tests/money`, `ledger` (legacy-oracle comparisons on 2,000 random cases) |
| Per-source repayment limit; loan & card allocation rules | Verified | tests + live form check |
| Overview dashboard (asset / receivable / liability / projection, insights, snapshot, chart, receivables, cards, activity, customise) | Verified | browser, real data reconciled to the database view |
| Debtors list (sort, filters, overdue) and profile page | Verified | browser |
| Repayment Center, data checks | Verified | browser + `tests/intelligence` |
| Card pages: breakdown, EMI plans, filters, details drawer | Verified | browser |
| Guided card purchase (review step) | Verified (single payer) / **Pending** (splits & EMI charges need 0010) | browser walk-through to the review; not saved |
| EMI schedules (terms, rounding, timeline, settle early) | Verified | tests + browser |
| Bank recorded movements (partial by design) | Verified | `tests/bank` + browser |
| Research ledger (date range, export, reconciliation, separate identity) | Verified | browser; export route built |
| Reports, Outlook, Time machine | Verified | scenario tests + live figures cross-checked (then + changes = now) |
| Global search (authorization-filtered) | Built | type-checked; viewer path relies on verified RLS |
| Exports (full, debtor, card, EMI, research) with formula defusing | Verified | `tests/exports` |
| Preferences (landing, density, paisa, chart range) | Built | page renders; saving not exercised |
| Reconcile tool | Verified (compare) / **Pending** (adjustments need 0011) | browser |
| Audit trail | **Pending** (0011) | — |
| Idempotent repayments | **Pending** at DB (0012); app sends ids | — |
| Design system, two themes, sidebar/mobile shell | Verified (desktop) | browser, contrast test |

## 2. Pages redesigned
Overview, Debtors, Debtor profile (new), Repayment Center (new), City Bank Card, Community Card, Reports (new),
Reconcile (new), Research, Settings (new), Sign-in / View.

## 3. Screens and workflows tested (manually, real data, nothing saved unless stated)
Desktop (1568 px) in both themes: every page above · `T` theme shortcut · `?` shortcuts drawer · Ctrl K palette ·
skip link and focus ring · profile popup · EMI timeline · card purchase flow to the review (split + EMI + charges) ·
repayment preview (bank transfer vs cash defaults; over-limit) · customize dashboard (move/hide, cancel) · card
transaction filters and drawer · reconcile comparison. Sign-in page at 320 / 390 / 820 / 1440 px in both themes.

**Not tested:** signed-in pages on a phone-width window (Chrome stayed maximised); saving any record through the UI;
view-mode session in a browser (covered at the database and route layers instead).

## 4. Automated test results
* `npm test`: **68 passed, 0 failed** (10 files: money, ledger, dashboard, intelligence, bank, exports, format, prefs,
  contrast, security incl. viewer fail-closed & route allow-list).
* `npx tsc --noEmit`: clean. `npm run build`: succeeds. `npm audit`: 0 vulnerabilities.
* Live database (rolled back): `rls_viewer.sql` — viewer sees 0 finance rows, every write refused;
  `integration_rollback.sql` — **12/12** checks true; no test data persisted.
* Browser E2E (Playwright) — **Not done** (would need installing browsers; recommended next step).

## 5. Database migrations
| # | Status | Content |
| --- | --- | --- |
| 0001–0008 | Applied | schema, functions, research, delete, view mode, debit, viewer research-only, card EMI |
| 0009 | Written, not applied | repayment limit + lock (superseded by 0010) |
| 0010 | Written, not applied | split purchases, EMI charges (buyer pays), charge-aware view and limit |
| 0011 | Written, not applied | append-only audit log, balance adjustments, `reconcile_balance` |
| 0012 | Written, not applied | least privilege, FK index, idempotent repayments, date constraints |
All are additive with a DOWN section; none modifies existing rows. Apply order and backup steps: `docs/SECURITY.md` §5.

## 6. Security findings and fixes
See `docs/SECURITY.md`: 15 findings ranked; fixed in code: viewer secrets (fail closed), validation, error boundary,
viewer sign-out scope, route allow-list tests; fixed in pending migrations: limits under lock, idempotency, audit
trail, least privilege. Open: legacy undo ambiguity, unused auth account, shared `tracker` app, MFA, nonce CSP.

## 7. Performance measurements (local machine → Supabase ap-south-1; not real-world field data)
| Measure | Result |
| --- | --- |
| Client JS, all routes combined | 1,099 KB raw / **339 KB gzip** (27 files) |
| Overview page, JS transferred | 203 KB (13 files) |
| Server response (warm, full HTML) | 100–270 ms per page |
| Overview, warm production load | TTFB 194 ms · FCP/LCP **340 ms** · CLS **0** · 1 long task (107 ms) |
| Overview, first cold request | TTFB 2.3 s (first connection/TLS to Supabase) |
| Supabase round trip from this machine | ~85–220 ms |
| Console errors / hydration warnings (production build) | none observed |
Lighthouse / field Core Web Vitals were **not** measured.

## 8. Known limitations
Listed in README "Known limitations" and `docs/SECURITY.md` "Open".

## 9. Deployment checklist
`docs/SECURITY.md` §5 (backup → migrations in order → env vars → auth settings → deploy → post-deploy checks).

## 10. Remaining manual tasks
1. Rotate the viewer password; set `VIEW_PASSCODE`, `VIEWER_PASSWORD`, `VIEWER_EMAIL`, `SITE_URL` in Vercel **before** deploying.
2. Back up, then apply 0010 → 0011 → 0012; re-run the two SQL test scripts.
3. Supabase Auth: confirm sign-ups off, enable leaked-password protection, check redirect URLs.
4. Decide on the unused auth account and the `tracker` app sharing the project.
5. Check signed-in pages on a phone; record one real repayment and one card purchase after deploying.
6. Review the three likely duplicate people flagged by Data checks.
