# MRRMR — private financial workspace

A personal finance and receivables app for one owner: City Bank balance and debit tally, two credit cards (with
third-party purchases, split purchases and EMI plans), people who owe money (loans and card purchases), repayments,
a separate team **Research ledger**, reports, forecasts and data checks. Amounts are Bangladeshi Taka (৳1,43,345),
dates are Asia/Dhaka. Read-only **view mode** shows the Research ledger only.

> Engineering-reviewed, not certified. See `docs/SECURITY.md` for what was and wasn't verified.

## Architecture
| Layer | What |
| --- | --- |
| App | Next.js 16 (App Router, Turbopack), React 19, TypeScript 7, Tailwind CSS 4 |
| Data | Supabase Postgres + Auth via `@supabase/ssr`, called **only from the server** (no `NEXT_PUBLIC_` keys) |
| Writes | Server actions (`lib/actions.ts`, `lib/research-actions.ts`) → atomic Postgres functions (RPCs) |
| Rules | Pure, unit-tested modules: `lib/money` (exact paisa), `lib/ledger` (allocation, EMI), `lib/dashboard`, `lib/history`, `lib/forecast`, `lib/reports`, `lib/anomalies`, `lib/bank`, `lib/exports`, `lib/validate` |
| Security | Postgres RLS (authoritative) → `proxy.ts` route allow-list → server-action guards → UI |
| Design | Tokens in `app/globals.css` (Executive Minimal / Midnight Finance), primitives in `components/ui.tsx`; see `docs/DESIGN.md` |

## Pages
| Route | Purpose |
| --- | --- |
| `/account` | **Overview** (home): cash in the bank, owed to you, owed on cards (separate, clickable), labelled projection, Needs attention, recent activity, cards, City Bank tools |
| `/debtors`, `/debtors/[id]` | People (search, status filters, sort by amount owed or due date) and each person's profile: totals, history with running balance and date range, Export PDF, Actions → Delete data |
| `/repayments` | Repayments: overdue, due soon, recent collections, quick record, data checks |
| `/cards/1`, `/cards/2` | Card artwork + what you owe, pay-by, your share vs others', upcoming payments, EMI plans, transactions (filters, detail drawer with EMI schedule) |
| `/reports` | Monthly summary (one month at a time), Outlook, Past dates |
| `/export/pdf?id=…[&from&to]` | A4 PDF statement for one person (admin only) |
| `/research`, `/research/export` | Research ledger (separate from personal finance) and its CSV — the only pages view mode may open |
| `/settings` | Landing page, density, paisa display, default chart range |
| `/export` | Full backup CSV; `?type=debtor&id=` · `?type=card&slot=` · `?type=emi` |
| `/login`, `/view`, `/auth/*` | Admin sign-in, view mode (one button, no key), password reset |

## Environment variables (server-only; set in `.env.local` and Vercel)
| Name | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | yes | Project Settings → API |
| `SITE_URL` | production | `https://<domain>` — used in password-reset emails |
| `VIEWER_EMAIL`, `VIEWER_PASSWORD` | for view mode | the shared viewer account; password ≥ 16 random characters, never typed by people |

Never add the `service_role` key to this app.

## Local setup
Requires Node.js 20.9+ (tests use Node's built-in TypeScript support: Node 23.6+ recommended).
```bash
npm install
cp .env.example .env.local      # fill in the values (Windows: copy .env.example .env.local)
npm run dev                     # http://localhost:3000
npm test                        # unit tests
npm run build                   # production build
npm run audit                   # dependency check
```

## Supabase setup
1. Run the migrations in `supabase/migrations` in order in the SQL Editor (0001 is reference only — already applied in
   the original project). **0001–0008 and 0013 are applied in production; 0009–0012 are written and awaiting review**
   (apply 0010 → 0011 → 0012; 0010 includes 0009). 0013 (`delete_records`, atomic multi-entry deletion) is
   independent of them.
2. Authentication → Users: create the admin (auto-confirm) and the viewer; link them with the `insert into public.viewers…`
   statement at the end of `0005_view_mode.sql`. Turn **off** sign-ups; turn **on** leaked-password protection.
3. Authentication → URL Configuration: Site URL = your domain; Redirect URLs = `https://<domain>/auth/callback`
   (+ `http://localhost:3000/auth/callback` for dev). Reset-password template link:
   `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset`.

## Authentication & view mode
* Admin: email + password (generic errors, per-IP rate limits, reset only from a fresh recovery session, sign-out
  revokes all sessions). Sign-ups disabled.
* View mode: **no key** (owner decision 2026-11-19). One button on `/view` (rate-limited) signs the visitor in as the
  shared **viewer** account; anyone with the link can open it. An admin signed in on the same browser is signed out
  first. The database lets that account **read the two research tables only** and blocks every write
  (0005 + 0007); `proxy.ts` redirects it away from every other route; server actions refuse it. Verified with
  `supabase/tests/rls_viewer.sql`. Exiting signs out that one viewer only.

## Database: tables and functions
Tables: `accounts`, `cards`, `people`, `loans`, `card_uses`, `repayments`, `research_expenses`,
`research_contributions`, `viewers` (+ `balance_adjustments`, `audit_log` from 0011). View: `debtor_summary`.
Every table: RLS "owner only"; viewer read on research only; restrictive "viewer no insert/update/delete".
Functions (all `SECURITY INVOKER`, fixed `search_path`): `add_loan`, `add_card_use`, `add_card_purchase` (0010),
`record_repayment` (limit + lock from 0009/0010, idempotency from 0012), `delete_record`, `add_debit_use`,
`find_or_create_person`, `reconcile_balance` (0011), `viewed_owner`. Audit trigger (0011) is the only `SECURITY DEFINER`
function MRRMR adds; it can only append to `audit_log`.

## Money rules (summary — full definitions in `docs/METRICS.md`)
* All arithmetic in integer paisa (`lib/money.ts`); display in whole taka unless "Show paisa" is on.
* Bank and cards are separate: loans/loan repayments may move the bank (only when you choose); card purchases and
  card repayments move only that card. A cash repayment is never added to the bank unless you tick it.
* Repayments can't exceed what's owed to that source. Allocation: loans earliest pay-back date first; card
  installments earliest-due first.
* EMI: total payable (purchase + recorded statement charges, owed by the buyer) ÷ months, rounded down to the paisa;
  the last installment absorbs the remainder.

## Testing
* `npm test` — 81 unit tests (incl. statements/PDF and deletion impact): money precision, allocation, EMI rounding, dashboard reconciliation, history, forecast,
  reports, anomalies, exports, contrast, validation, view-mode fail-closed, route allow-list.
* `supabase/tests/rls_viewer.sql`, `supabase/tests/integration_rollback.sql` — run in the SQL Editor; both roll back.
* Not automated yet: browser end-to-end tests (Playwright) — see `docs/ACCEPTANCE.md`.

## Backup and recovery
* **Before every migration:** Supabase → Database → Backups (daily backups on paid plans; on the free plan download a
  backup with `pg_dump` or the dashboard's manual export) **and** `/export` (full CSV).
* Recovery: restore the Supabase backup (point-in-time on paid plans). The CSV is a human-readable record and an
  audit aid; there is **no in-app import** — restoring from CSV is a manual, reviewed SQL task.
* Every migration file ends with a DOWN section.

## Deployment (Vercel)
Import the repo, set the env vars above (Production), deploy, then add the domain to Supabase URL configuration.
Follow the deployment checklist in `docs/SECURITY.md` §5. The GitHub Action `keep-supabase-awake.yml` sends one
anonymous, RLS-denied read per day to keep a free project awake; it has no write access and `permissions: {}`.

## Known limitations
* Bank and card balances have no history before migration 0011 (time machine can't reconstruct them).
* Legacy records don't store whether they changed a balance (undo on delete asks you).
* Viewer is one shared account (per-person viewer accounts would allow individual revocation).
* No MFA, no in-app restore, no nonce-based CSP, no automated browser tests yet.
* Phone layout verified on the sign-in page only (see `docs/ACCEPTANCE.md`).

More: `docs/AUDIT.md` (original audit), `docs/METRICS.md`, `docs/DESIGN.md`, `docs/SECURITY.md`, `docs/ACCEPTANCE.md`.
