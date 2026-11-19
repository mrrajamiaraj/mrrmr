# Portfolio redesign — handover (2026-11-19, branch `redesign/portfolio`)

## 1. Audit (prioritised, before changes)
1. **Overview was crowded and repetitive.** Hero position (4 figures) + a 5-tile snapshot repeating the same balances,
   a generic "Insights" grid, a cash-movement chart, receivables stats + ring + ranking, cards, activity, then the bank
   section with the projection a third time and two more tables. Hard to find the bank balance or act.
2. **Deletion was unsafe to complete.** "Clear history" deleted entries one transaction at a time (a failure half way
   left a partial delete) and asked one yes/no about *all* balances; no preview of what would change.
3. **No PDF statement** for a person; only a CSV.
4. **People list** buried the list under a chart, a ranking and three tabs; per-person delete/edit was on every card.
5. **Card pages** repeated the same figures in a statement row, a ring, a breakdown and an outlook table, plus a chart.
6. **Monthly summary** was a 10-column table of every month; the selected month's story was hard to read.
7. Profiles opened as modals in four places with different scopes (bank / card / all), duplicating the profile page.

## 2. What changed
| Area | Change |
| --- | --- |
| Overview | Three separate, clickable figures (cash in City Bank → bank tools; owed to you → People filtered; you owe on cards → cards). The projection is its own dashed line, labelled **Projection**. **Needs attention** (overdue + next 14 days, card pay-by passed) with a Record button per row. Recent activity. Both cards with artwork. City Bank tools (balance, debit tally, recorded movements). |
| People `/debtors` | Instant search, status chips with counts, figures that double as filters, sort by amount owed / due date / name / recent. One row per person; Repay inline; row opens the profile. `?show=` deep links. |
| Profile `/debtors/[id]` | Total borrowed, total repaid, outstanding (with progress), next due. Coming up + where it's owed. History with date range, type filter, method, running balance, opening/closing lines, expandable EMI schedule, delete per entry. **Export PDF** button; **Actions** menu (edit, CSV, *Delete data…*). |
| PDF | `/export/pdf` — A4, header, period, export date, summary boxes (opening balance when filtered), table header repeated on every page, page numbers, only that person, admin only. |
| Deletion | One dialog everywhere with an impact preview: the entries, each affected person's outstanding before → after, EMI schedules removed, split-purchase shares kept, overpayment warning, and one explicit question per linked bank/card balance (Yes = reverse it / No / **Not sure = keep the records**). Applied in ONE transaction (`delete_records`, migration 0013). Repeats are a safe no-op. |
| Cards `/cards/1`, `/cards/2` | Original card illustration + text figures: what you owe (editable), pay-by (late in words), your share vs other people's (labelled split bar), limit/available/utilisation, EMI still to come. Upcoming payments, who owes on the card (Repay inline), EMI plans as expandable rows, transactions with filters and a drawer showing the breakdown, split shares and the EMI schedule. |
| Monthly summary `/reports` | One selected month: lent out, paid back (with "of which into the bank" explained as part of loans, not extra), owed at start → end with the change explained, own card spending, EMI due, research (separate), that month's entries; an every-month index. Outlook and Past dates kept. |
| Navigation | Groups Money · Lending · Credit cards · Records · Workspace; "Insight" group removed. |

### Removed (callers checked; nothing else used them)
Insights section and its data (`lib/dashboard` insights) · Snapshot tiles · Cash-movement and card-activity charts
(`components/charts.tsx`) · collection ring and "largest receivables" · dashboard customisation (`lib/dashboard-layout`,
`saveDashboardLayout`) and the chart-range preference · profile modal and people slider · old delete dialogs ·
bank "Repayment outlook" and "Loans from this account" tables (the same rows are in Recorded movements and profiles).
Where the useful Insights data went: overdue / due-soon items → **Needs attention** (Overview) and **Repayments**;
pay-by passed → Needs attention + card page; possible duplicate people, overpayments → **Data checks** (Repayments).

## 3. Checks run
| Check | Result |
| --- | --- |
| `npm test` | **81 passed, 0 failed** (incl. new `statement` 9, `deletion` 6) |
| `npx tsc --noEmit` | clean |
| `next build` | succeeds |
| `npm audit --omit=dev` | 0 vulnerabilities (adds `pdf-lib@1.17.1`) |
| PDF (unit) | empty, short, multi-page (header on every page, every row once, "Page i of n"), date-filtered (opening balance row), non-Latin names |
| PDF (visual) | synthetic samples in `docs/portfolio/` rendered and read back |
| `supabase/tests/delete_records_rollback.sql` on the live DB, rolled back | **10/10 true**: bank restored exactly when "yes", card untouched when "no", person removed, other person's purchase kept, repeat refused & changes nothing, a batch with one bad id deletes nothing, another person's record can't be slipped in. Afterwards: no test rows, no function left behind. |
| Migration 0013 | applied with approval; `SECURITY INVOKER`, `anon` cannot execute, `authenticated` can |
| Signed-out access | `/export/pdf`, `/debtors/[id]`, `/account` → 307 to sign-in; view mode can't open `/export/pdf` (unit test) |

## 4. Not done / limitations (stated plainly)
* **No browser testing of the redesigned signed-in screens, and no screenshots.** It needed a separate demo user so
  that no real records appear on screen; none was created, and testing was skipped by choice. So these are **not
  verified in a browser**: the new layouts at 320–1440 px, keyboard paths through the new dialogs, contrast of new
  combinations, the PDF download from the UI, and the delete dialog end-to-end. `supabase/seed/demo_seed.sql`
  (synthetic data, refuses to touch the main account) is ready for when a demo user exists.
* Whether a legacy entry changed a balance is still not stored; the delete dialog asks rather than guesses.
* The PDF uses the standard Helvetica font: amounts are "BDT", and non-Latin letters (e.g. Bangla) print as "?".
* Official card art isn't used (rights not confirmed) — see `docs/CARD_ART.md`.

## 5. CV entry
**MRRMR — personal finance & receivables web app** · Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase (Postgres, Auth, RLS), pdf-lib
* Designed and built a private finance workspace tracking a bank account, two credit cards with EMI plans, money lent
  to people and repayments, with all arithmetic in integer paisa and 81 unit tests on the money rules.
* Shipped per-person A4 PDF statements with date filtering, opening balances, repeated table headers and page numbers,
  served by an admin-only route.
* Made deletion safe: an impact preview (balances before → after, EMI schedules, split purchases) and a single Postgres
  transaction that reverses linked bank or card balances only when the user confirms them, verified with rolled-back
  integration tests.
* Enforced access with row-level security, a read-only view mode and server-side checks.

## 6. Case-study paragraph
MRRMR started as a working tool with every number on screen at once: the same balance appeared three times on the
home page, and deleting someone's history could stop half way. The redesign begins from the decisions the owner makes
each day: how much is in the bank, who owes what, what is due. The home page now shows three separate figures (cash,
money owed to you, card debt), and the projection is labelled as one. A "Needs attention" list puts a Record button
next to every overdue or upcoming installment. Each person has a statement-style history with a running balance and a
one-click A4 PDF. Deletion previews its impact, asks about each linked balance instead of guessing, and runs as one
database transaction. Credit cards get original artwork in each bank's colours, with every amount kept as text beside
it. The money rules underneath (exact paisa, earliest-due allocation, EMI rounding) are unchanged and covered by 81 tests.
