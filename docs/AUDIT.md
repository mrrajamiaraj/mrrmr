# MRRMR — Engineering Audit (2026-11-19)

Scope: the whole repository, plus the live Supabase project `ksmkrkbqrckxlnehofsb`, inspected **read-only**: catalog
queries (policies, functions, view definition), the security advisor, and one query of EMI amounts/months. No data
was written and no schema was changed. Code and the live catalog are the source of truth here; the README was checked
against them (see §A.4).

---

## A. Current architecture

### A.1 Stack
| Layer | What | Notes |
| --- | --- | --- |
| Framework | Next.js 16.4 (App Router, Turbopack), React 19.3, TypeScript 7 | `proxy.ts` is Next 16's middleware |
| Styling | Tailwind CSS 4, tokens in `app/globals.css` (`@theme static`), night mode via `[data-theme=dark]` | IBM Plex Sans/Mono + Noto Sans Bengali (for ৳), self-hosted |
| Data | Supabase Postgres + Auth via `@supabase/ssr`; **server-only** client (no `NEXT_PUBLIC_` keys) | Browser never talks to Supabase; CSP `connect-src 'self'` |
| Writes | Server actions (`lib/actions.ts`, `lib/research-actions.ts`) → RPC functions or table writes | |
| Reads | `lib/data.ts` / `lib/research-data.ts`: whole ledger per request, `force-dynamic` | Fine at personal scale |
| Domain logic | `lib/ledger.ts` (profiles, EMI schedule, allocation), `lib/money.ts` (exact paisa arithmetic — new) | |
| Tests | `node --test` on `tests/*.test.mjs` (security, money, ledger) | No browser/e2e tests yet |
| CI | `.github/workflows/keep-supabase-awake.yml` (daily ping only) | No test/build CI |
| Hosting | Vercel (per README) | Env: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, optional viewer/site vars |

### A.2 Routes
| Route | Who | Purpose |
| --- | --- | --- |
| `/` | admin | redirects to `/account` (the old Overview page no longer exists) |
| `/account` | admin | City Bank balance, debit-card running total, bank loans per person, cash-flow chart |
| `/debtors` | admin | everyone who owes (loans + card use), status, due dates, profiles, repay, delete |
| `/cards/1`, `/cards/2` | admin | per-card balance, limit, pay-by, third-party use, EMI schedules, own share |
| `/research` | admin + viewer | research expenses/contributions, settlement, analytics, monthly trends |
| `/export` | admin | CSV of every record (finance + research) |
| `/login`, `/auth/callback`, `/auth/reset` | public | sign-in, reset link handling, set new password (recovery session only) |
| `/view` | public | view-mode passcode → shared viewer user → `/research` |

### A.3 Authorization model (verified)
1. **Database (authoritative).** RLS on every public table. `owner only` (ALL, `owner_id = auth.uid()`) on all 8 data
   tables. Restrictive `viewer no insert/update/delete` on all 8. `viewer read` exists **only** on `research_expenses`
   and `research_contributions` (migration 0007 is applied). `viewers` has one row. All finance RPCs are
   `SECURITY INVOKER`, so RLS applies inside them. `debtor_summary` is `security_invoker=true`.
2. **Proxy.** Signed-out → `/login`; viewer → `/research` for every other path, including `/export`.
3. **Server actions.** `writer()` refuses signed-out and viewer sessions before any query.
4. **UI.** `useViewer()` hides write controls; `useTabs()` shows only Research to the viewer.

### A.4 README vs. reality
| README says | Actually |
| --- | --- |
| View mode "can see every page" | Viewer sees **Research only** (0007 + proxy). README fixed in this phase. |
| "Overview → monthly summary" table | No Overview page; `/` redirects to `/account`. Monthly views are the per-page `FlowChart`s and Research → Monthly. README fixed. |
| Migrations "0001 … 0002" in layout | 0001–0008 exist and **all are applied** in production. |
| Card EMI, debit-card total | Implemented (0006, 0008) but undocumented. README updated. |

---

## B. Database & financial mutation map

### B.1 Tables (live)
`accounts(balance ≥ 0, debit_used ≥ 0)` · `cards(slot 1|2, balance ≥ 0, credit_limit, pay_by)` ·
`people(unique lower(name) per owner)` · `loans(amount > 0, method ∈ 4, account_id)` ·
`card_uses(amount > 0, person_id NULL = me, pay_plan full|emi, emi_months 2–60, due_on)` ·
`repayments(amount > 0, via ∈ 4, applies_to loan|card, card_id required for card, account_id)` ·
`research_expenses`, `research_contributions` · `viewers(viewer_id → owner_id)`.
Every money column is `numeric(14,2)`.

### B.2 Mutations
| Action (server) | DB path | Atomic? | Balance effect |
| --- | --- | --- | --- |
| `addLoan` | `add_loan` RPC | ✅ one txn | if `deduct`: `accounts.balance −= amount − initial_repaid` |
| `addCardUse` | `add_card_use` RPC (0008 signature) | ✅ | if `add_to_balance`: `cards.balance += amount` |
| `recordRepayment` | pre-check `debtor_summary.still_owes`, then `record_repayment` RPC | ⚠️ check is outside the txn | optional `accounts += amount`; optional `cards = max(cards − amount, 0)` |
| `deleteRecord` | `delete_record` RPC | ✅ | optional undo, chosen by the user at delete time |
| `deleteRecords` | loop of `delete_record` | ⚠️ one txn per record (documented) | same |
| `addDebitUse` | `add_debit_use` RPC | ✅ | `accounts.debit_used += amount` |
| `setAccountBalance`, `setCardBalance`, `setDebitUsed`, `updateCardDetails` | direct `update` | ✅ single statement | **overwrites** with no history |
| `createAccount`, `createCard`, `updatePerson`, `deletePerson` | direct table writes | ✅ | — |
| research `save*/delete*` | direct table writes | ✅ | — |
| `changePassword`, `sendPasswordReset`, `resetPassword` | Supabase Auth | — | — |

### B.3 Derived figures
* **Still owes / status / next due** per person: `debtor_summary` view (authoritative). The app maps the view's
  `Overdue` to Pending/Partially Paid.
* **Per-source (bank loans vs. each card) totals:** computed in `lib/ledger.ts` from raw rows, server-side, on every request.
* **EMI schedule:** not stored. Derived from `amount`, `emi_months` and `due_on` (first installment). Rule: each month =
  amount ÷ months rounded **down** to the paisa, and the last month takes the remainder.
* **Repayment allocation (cards):** a person's card repayments, oldest first, clear that card's installments, earliest
  due first. Loans (since 2026-11-19, §I.3): a person's loan repayments clear their loans earliest pay-back date first.
* **Stored balances** (`accounts.balance`, `cards.balance`, `debit_used`) are mutable running numbers. There is no
  ledger they can be rebuilt from.

---

## C. Risk register

Severity: **H** = can produce wrong money or expose data; **M** = integrity/traceability gap; **L** = hygiene.

| # | Sev | Risk | Evidence | Mitigation (phase) |
| --- | --- | --- | --- | --- |
| C1 | **H** | **Balance-undo depends on the user remembering.** Loans always store `account_id` even when the amount was *not* deducted. Card repayments always store `card_id` even when the bill was *not* lowered. On delete, ticking "undo" moves money that never moved. | `add-debtor-dialog.tsx:82`, `0004_delete_records.sql`, `delete-record-dialog.tsx:79` | Additive migration: `balance_applied boolean` (+ `balance_delta numeric`) on loans/card_uses/repayments, set by the RPCs. Undo uses the stored fact; legacy rows stay "unknown" and keep today's prompt. (P3) |
| C2 | **H** | **Asymmetric clamping drifts card balances.** `record_repayment` and `delete_record(card_use)` floor the card at 0 (`greatest(…,0)`). The matching undo adds back the full amount. | `0002:159`, `0004:37,50` | Store the *applied* delta (C1) and undo exactly that. (P3) |
| C3 | M | **No audit trail for balance overrides.** `setAccountBalance`, `setCardBalance` and `setDebitUsed` overwrite values. Debit use is a bare running total with no entries and no per-entry undo. | `actions.ts:48-78`, `0006` | Additive `balance_events` journal written by the RPCs and the set-balance functions; debit entries become rows. (P3) |
| C4 | M | **Over-repayment check is pooled and racy.** It compares against the person's *total* (loans + all cards), not the selected loan pool or card, and runs outside the RPC transaction. | `actions.ts:220-221` | Needs a business-rule decision (I2); then enforce inside `record_repayment`. (P3) |
| C5 | M | **Viewer credentials in source.** `VIEWER_PASSWORD` fallback is committed. With 0007 applied, direct login exposes **research data only** (verified), not finance. | `lib/viewer.ts:13` | Rotate the password; set `VIEWER_PASSWORD`/`VIEW_PASSCODE` in Vercel; then delete the fallback (fail closed). (manual + P2) |
| C6 | M | **Unrelated SECURITY DEFINER RPC in the same project.** `public.tracker_api(jsonb)` (a key-gated patient case tracker writing `tracker.*`) is executable by `anon`. It does not touch finance tables, but it shares the project, its blast radius and its backups. | Supabase advisor | Not part of this repo — **left untouched**. Decide whether it belongs in a separate project (I7). |
| C7 | ~~M~~ | ~~**Next.js advisory**~~ (GHSA-mfr8-8qww-v76h, GHSA-vc7v-qv4w-wrv8, 16.2.0–16.4.4). | `npm audit` | **Fixed 2026-11-19:** `next@16.4.6`; `npm audit` reports 0 vulnerabilities. |
| C8 | L→M | **Float money arithmetic.** Sums and EMI splits used JS doubles; ~1.3% of amount/month pairs got a 1-paisa-low EMI installment; `1.005` rounded to `1.00`. | `ledger.ts`, `actions.ts` | **Fixed in P1** for all domain/server code (`lib/money.ts`). UI-only page totals still use `reduce` (display rounds to whole ৳). (P2) |
| C9 | L | Hard-coded hex status colours ignored night mode. | `ledger.ts STATUS_PILL` | **Fixed in P1.** Research chips still hex (P2). |
| C10 | L | Leaked-password protection is off in Supabase Auth. | advisor | Manual toggle. |
| C11 | L | `deleteRecords` is not all-or-nothing. | `actions.ts:271` | Single `delete_records` RPC (P3). |
| C12 | L | No CI for tests/build; no e2e or accessibility tests. | `.github/` | Add a CI workflow (P2). |
| C13 | L | In-memory rate limits are per instance. | README | Acceptable; Supabase limits apply behind them. |
| C14 | L | Raw Postgres messages can reach the UI (`friendly()` falls back to `m`). No secrets are in them, but they read badly. | `actions.ts:27` | Map the remaining codes (P2). |

---

## D. Feature preservation checklist

Each item must still work after every phase (manual pass + automated where noted).

- [ ] Admin sign-in, generic error, rate limit; sign-out
- [ ] Forgot password → email → `/auth/callback` (token_hash and PKCE) → `/auth/reset` (recovery-only)
- [ ] Admin → change password (asks for current); last-changed date shown
- [ ] View mode: `/view` passcode → `/research` only; every other path, `/export` included, redirects; no write controls; Exit signs out
- [ ] Bank: edit balance, debit-use add/set, add loan (deduct toggle, initial repaid), loan repayment (add-to-account toggle)
- [ ] Cards 1/2: setup, edit limit/pay-by/balance, add use (Me / person, add-to-balance, Full vs EMI 3–36 months), repayment (lower-bill toggle), EMI schedule & next installment
- [ ] Debtors: totals, statuses, late/soon/later due, profile modal & slider, edit person, delete person (only with no records), delete record (+ undo), clear history
- [ ] Research: expenses/contributions CRUD, filters, settlement, analytics, monthly trends
- [ ] CSV export: all record types, formula-defused, BOM, `no-store`
- [ ] Day/night theme (toggle, `T`, system), command palette (⌘K, `/`), `G`+key navigation, `?` help, sorting, toasts
- [ ] Reduced motion honoured; phone stacked tables; bottom-sheet dialogs
- [x] Automated: `tests/security.test.mjs`, `tests/money.test.mjs`, `tests/ledger.test.mjs` (30 tests)

---

## E. UI/UX redesign plan

**Identity.** "Private financial OS": a quiet editorial surface where the numbers are the hero. Keep the existing
warm-paper palette and Plex type, which already set the app apart from bank templates. Push them further rather than replacing them.

1. **Typography system.** Display figures in Plex Sans 600 with tabular numerals at fixed sizes (hero 40/48, KPI 24,
   table 14.5). Labels in small caps. Paisa shown in a lighter weight where it matters (Research already uses `takaDec`).
2. **Information hierarchy per page.** One hero figure ("money now", "card balance", "still owed"), then three
   supporting KPIs, then the action row, then detail tables. The same skeleton on every page lowers learning cost.
3. **Overview ("Today") page** — reinstate `/` as a real home: net position (bank − own card share + receivables),
   next 7 days of dues across loans/EMIs, recent activity. Read-only composition of data that already exists; no new money rules.
4. **Night mode pass.** Remove all remaining hex colours (Research facility/member chips, avatar tints) in favour of tokens;
   re-validate contrast at 4.5:1.
5. **Forms.** One `MoneyField` (Indian grouping as you type, paisa-safe parse via `lib/money`), clear consequences
   ("This will take ৳5,000 out of City Bank"), primary action names the effect, double-submit lock.
6. **Visualisations.** Keep `FlowChart`; add an EMI timeline (installments as a strip, paid/left), a receivables
   ageing bar (current / 1–30 / 31–60 / 60+), and card utilisation as a meter. All have text equivalents (existing pattern).
7. **Motion.** Keep the existing reduced-motion guard. Limit motion to state changes (number roll on save, row highlight on insert).
8. **Branding.** MRRMR wordmark + monogram (the `brand.tsx` slot), app title "MRRMR" (currently "RMR Finance": I5).
9. **Accessibility.** Audit dialogs for `aria-describedby`, label every icon button, give charts `role="img"` with
   summaries, make sure all the "G"-shortcuts have visible equivalents, and keep 44px touch targets.

## F. Proposed component architecture

```
lib/
  money.ts            exact paisa arithmetic (P1, done)
  ledger.ts           pure domain: profiles, schedules, allocation (now paisa-exact)
  domain/             (P2) receivables ageing, overview aggregates — pure, unit-tested
components/
  ui/                 Button, IconButton, Field, MoneyField, Select, Checkbox, Dialog(=modal), Sheet, Tabs, Badge, Stat
  data/               Table (stack-table), Figure/KPI, EmptyState, Skeleton
  charts/             FlowChart, Meter, Ring, Timeline (all with text alternatives)
  finance/            BalanceEditor, CardVisual, EmiSchedule, RepayForm, AddDebtorDialog, DeleteRecordDialog
  shell/              TopBar, TabBar, CommandPalette, Theme, Toast, AdminButton
```
Rules: UI components never compute authoritative money. They get figures from `lib/` (server) or format them with
`lib/format` / `lib/money`. Variants are typed props, not ad-hoc class strings (today `btnPrimary` etc. are strings).

## G. Implementation phases

| Phase | Risk | Content |
| --- | --- | --- |
| **P1 Foundation** (done) | low, no DB | `lib/money.ts`; ledger + server actions on exact arithmetic; night-mode status colours; regression tests with legacy oracle; README corrections; this audit |
| **P2 Hygiene & UI kit** | low, no DB | CI workflow (tests + typecheck + build); Next.js security bump; remaining UI totals on `sumBy`; hex → tokens; `components/ui` primitives; `MoneyField`; friendlier DB errors; remove viewer fallback once env is set |
| **P3 Integrity migrations** | **high**, additive DB | 0009: `balance_applied`/`balance_delta` columns + RPC v2 that record them, exact undo, single-txn `delete_records`, in-txn over-repayment rule (per I2), `balance_events` journal, debit entries. Additive, reversible, old RPC signatures kept until the app switches |
| **P4 Redesign** | medium, UI only | Overview page, page skeleton, typography, new charts, branding, motion |
| **P5 Verification** | — | Playwright e2e against a Supabase branch (admin + viewer flows), axe accessibility checks, responsive screenshots |

## H. Testing & migration strategy

* **Unit:** pure modules (`money`, `ledger`, `security`, future `domain/*`) under `node --test`. Every change to money
  logic ships with a test that compares against the previous implementation (see `tests/ledger.test.mjs`).
* **Integration/e2e (P5):** Playwright against a **Supabase branch** (never production), seeded with synthetic data.
  Covers the admin and viewer matrices from §D, including direct server-action calls as the viewer.
* **Migrations:** numbered SQL in `supabase/migrations/`, additive only (new columns nullable or defaulted, new
  function versions alongside old ones). Each has a written `down` section. Each is applied first on a branch, checked
  with the advisor and an RLS probe as the viewer, then on production after a CSV export. No `UPDATE` of historical
  financial rows; legacy rows get `NULL` ("unknown"), never guessed values.
* **Reconciliation check (P3):** a read-only SQL report showing stored balance vs. what the journal implies, run before
  and after each integrity migration.

## I. Decisions needed from the owner

1. **Undo for legacy records** (C1): for rows saved before P3, keep asking "did the balance change?" (recommended), or treat them as non-undoable?
2. ~~**Over-repayment rule** (C4)~~ — **Decided 2026-11-19: per source.** A repayment can't exceed what the person owes
   on bank loans, or on the one card it is for. Enforced in `recordRepayment` (`owedToSource`), and it fails closed if
   the check can't run. The same check inside `record_repayment`, under a per-person lock, is written as
   `supabase/migrations/0009_repayment_limit.sql` (function-only, with an exact DOWN). **Not applied yet.**
3. ~~**Loan allocation**~~ — **Decided 2026-11-19: earliest-due loan first** (no date = last; same date = older loan
   first), like card installments. Totals are unchanged; only *which* loan is paid changes, and with it the due/late
   date. The Debtors page now uses the same rule instead of the view's `next_due`. That column only considers future
   dates (in UTC), ignores repayments, and so could never show "late". Applied to live data, this changed 1 Bank
   page date and 4 Debtors page dates, and no totals.
4. **Card balance below zero:** the DB forbids negative card balances (a credit). Keep clamping at ৳0, or allow a credit balance?
5. **Product name:** UI says "RMR Finance", the request says "MRRMR". Rename everywhere (title, manifest, icons)?
6. **Paisa display:** money is shown in whole taka (`৳1,43,345`) while stored to the paisa. Keep that, or show paisa where non-zero?
7. **`tracker_api` / `tracker` schema** in the same Supabase project: intended to live there?
