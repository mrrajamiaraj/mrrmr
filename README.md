# RMR Finance

Personal finance and loan-recovery workspace, with day and night themes (header toggle, `T`, or follows the device).

A private dashboard for one person: City Bank balance, two credit cards, who owes you money (loans and card
use), repayments, and a monthly recovery summary. Built with Next.js (App Router), TypeScript, Tailwind CSS and
Supabase (`@supabase/ssr`). Amounts are Bangladeshi Taka with Indian grouping (৳1,43,345).

| Page | Route | Design |
| --- | --- | --- |
| Bank Account (home; `/` redirects here) | `/account` | `design/Accounts.dc.html` |
| Debtors & Loans | `/debtors` | `design/Lending.dc.html` |
| City Bank Credit Card | `/cards/1` | `design/Cards.dc.html` |
| Community Bank Credit Card | `/cards/2` | `design/Card2.dc.html` |
| Research Finance Ledger | `/research` | screenshots of the Google Sheets dashboard |
| Admin password dialog | header, every page | `design/AdminButton.dc.html` |
| CSV backup | `/export` (“Export CSV” in the nav) | — |
| View mode (read-only, password `mrrmr`) | `/view` | Research Finance only, no edit buttons |

## One-time Supabase setup

The tables, RLS policies and the `debtor_summary` view already exist (`supabase/migrations/0001_finance_schema.sql`,
kept for reference — don't run it again).

1. **Add the write functions.** Open the Supabase dashboard → SQL Editor → New query, paste the contents of
   `supabase/migrations/0002_finance_functions.sql`, and run it. It creates four functions (`add_loan`,
   `add_card_use`, `record_repayment`, `find_or_create_person`) and changes no tables. They let the app insert a
   row and move a balance in a single transaction, so balances never drift. They run as the signed-in user, so RLS
   still applies.
   Then do the same with `supabase/migrations/0003_research_ledger.sql`, which creates the two Research tables
   (`research_expenses`, `research_contributions`) with the same owner-only RLS.
   Finally run `supabase/migrations/0004_delete_records.sql` (one function, `delete_record`, no table changes). It
   powers the 🗑 Delete buttons: it permanently deletes a loan, card use or repayment and, if you tick the box,
   undoes its balance change in the same transaction.
2. **Create your login.** Authentication → Users → Add user → enter your email and a password, tick
   “Auto Confirm User”. Then Authentication → Sign In / Providers → turn **off** “Allow new users to sign up”, so
   nobody else can create an account on your deployed site.
3. **Allow the reset link.** Authentication → URL Configuration: set Site URL to your Vercel URL and add
   `http://localhost:3000/auth/callback` and `https://<your-vercel-domain>/auth/callback` to Redirect URLs.
4. **Make reset links work in any browser** (optional but recommended). Authentication → Emails → Templates →
   Reset Password: change the link to
   `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset`.
   Without this, a reset link only works in the same browser where you pressed “Forgot password?”.

## View mode

Anyone who opens `/view` (or “Just viewing?” on the sign-in page) and types the view password (`mrrmr`, or
`VIEW_PASSCODE` if set) can see the **Research Finance** page only, and change nothing. Every other page and the CSV
export redirect to Research, and since `0007_viewer_research_only.sql` the database itself gives the viewer no read
access to the bank, card, people, loan or repayment tables. Behind the scenes they are signed in as one shared
Supabase user, the *viewer*. Add/edit/delete buttons are hidden for that user, the server actions refuse it, and
the database itself blocks every write from it, so view mode stays read-only even if someone calls the API directly.

One-time setup:

1. Run `supabase/migrations/0005_view_mode.sql`, then `0007_viewer_research_only.sql`, in the SQL Editor.
2. Authentication → Users → Add user: an email such as `viewer@yourdomain.com` and a long random password, tick
   “Auto Confirm User”. Visitors never see or type this password.
3. Link the viewer to your account by running the `insert into public.viewers …` statement at the bottom of
   `0005_view_mode.sql`, with both emails filled in.
4. Already done for this project: the viewer `viewer@mrrmr.app` exists and its login is the built-in default in
   `lib/viewer.ts`, so nothing needs adding to Vercel. To use a different viewer, set `VIEWER_EMAIL` and
   `VIEWER_PASSWORD`; `VIEW_PASSCODE` (default `mrrmr`) changes the key visitors type.

“Exit” in the header signs the viewer out. Opening `/view` while you are signed in as admin just goes to the dashboard.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in the two values (on Windows: copy .env.example .env.local)
npm run dev
```

Open http://localhost:3000 and sign in.

### Environment variables

| Name | Where to find it |
| --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → Publishable key |
| `VIEWER_EMAIL`, `VIEWER_PASSWORD` | Optional; the read-only viewer user (built-in default: `viewer@mrrmr.app`) |
| `VIEW_PASSCODE` | Optional; the password visitors type at `/view` (default `mrrmr`) |

Only server code (`proxy.ts`, `lib/supabase/server.ts`) reads them, so they have no `NEXT_PUBLIC_` prefix and
never reach the browser. **Never** put the `service_role` / secret key in this app.

## Security

What the app enforces (tests: `npm test`; dependency check: `npm run audit`):

- **Database is the real boundary.** Every table has owner-only RLS; view mode is blocked from writing by restrictive
  policies. Server actions also refuse signed-out and view-mode callers before any query runs.
- **Sign-in:** per-IP limits (view key 8 tries / 15 min, admin 10 / 15 min, reset emails 5 / hour), one generic error
  message, constant-time view-key check, safe `next` redirects (no `//` or `/\` tricks).
- **Password reset** without the old password only works from a fresh reset-email session, never for the viewer.
- **Session cookies** are `httpOnly`, `SameSite=Lax`, and `Secure` in production.
- **Headers:** CSP (`connect-src 'self'`, `frame-ancestors 'none'`), HSTS, `nosniff`, Referrer- and Permissions-Policy;
  private pages and the CSV are `no-store`. CSV cells that start with `= + - @` are defused for Excel.

The in-memory rate limits are per server instance, so on Vercel they slow guessing rather than cap it globally.

**Do these yourself (the app can't):**

1. **Rotate the viewer password.** Its old value is in the source (`lib/viewer.ts`). Supabase → Authentication → Users →
   the viewer → set a new long random password; put it in Vercel as `VIEWER_PASSWORD` with `VIEWER_EMAIL`.
2. **Use a stronger view key.** Set `VIEW_PASSCODE` in Vercel to a passphrase (e.g. four random words), not `mrrmr`.
3. **Set `SITE_URL`** in Vercel to your https address (reset emails use it).
4. Supabase → Authentication → Providers → Email: turn on **Secure password change**; keep sign-ups **off**;
   check that **Redirect URLs** only lists your own domains.
5. If this repository is public on GitHub, make it private (it contains the old viewer login and project ref).

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: Add New → Project → import the repo. The framework is detected as Next.js; keep the defaults.
3. Under Environment Variables add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
4. Deploy, then add the Vercel URL to Supabase's URL Configuration (step 3 above).

## Keep the free Supabase project awake

Free projects pause after a week with no activity. `.github/workflows/keep-supabase-awake.yml` sends one tiny
request every day. In GitHub → Settings → Secrets and variables → Actions, add:

- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` — the same values as in `.env.local`

You can run it by hand from the Actions tab (“Run workflow”) to check it works.

## How the money logic works

- **Bank account and cards are kept separate.** The bank page only counts loans; card use and card
  repayments only ever touch that card's balance, never the bank balance.
- **Bank Account:** money now + what people owe on loans = balance after everyone pays back. “Add Debtor”
  finds or creates the person, inserts a loan, and (if ticked) takes the amount out of the account balance — all
  in one `add_loan` call. Loan repayments recorded here are added to the account balance.
- **Credit cards:** card balance − what people owe for this card = your own share. “Add Debtor” inserts a
  `card_use` (type **Me** as the name for your own spending) and optionally adds it to the card balance.
  Repayments can optionally lower the card balance.
- **Debtors & Loans:** totals, status (Pending / Partially Paid / Repaid — the view's 'Overdue' is shown as Pending or Partially Paid) and next due date come from
  the `debtor_summary` view. “Borrowed” there means loans + card use by that person.
- **Card EMI:** a card use is paid back in full by one date, or in 3–36 monthly installments (migration 0008).
  Each installment is the amount ÷ months rounded down to the paisa; the last one takes the remainder. A person's
  card repayments clear that card's installments oldest-payment-first, earliest-due-first.
- **Debit card:** `debit_used` on the account is a running total you raise one entry at a time (migration 0006).
- **Monthly view:** there is no Overview page (`/` opens Bank Account). Each page has a per-month “money out vs paid
  back” chart, and Research has its own Monthly tab.
- **Exact money:** all totals, EMI splits and allocations are computed in integer paisa (`lib/money.ts`), never by
  adding floating-point taka.

## Project layout

```
app/
  (dashboard)/          signed-in pages: account/, debtors/, cards/[slot]/, research/ (page.tsx redirects to /account)
  login/                sign-in + forgot password
  auth/callback, reset  password-reset link handling
  export/route.ts       CSV backup
components/             shell (header + nav), Admin dialog, modals, debtor profile/slider/forms
lib/
  data.ts               loads everything for a page from Supabase
  ledger.ts             per-person totals, history, EMI schedules and “owes after” running balances
  money.ts              exact paisa arithmetic (sums, rounding, EMI splits)
  actions.ts            server actions (all writes)
  format.ts             ৳ formatting and dates (Asia/Dhaka)
proxy.ts                sends signed-out visitors to /login (Next.js 16's name for middleware)
supabase/migrations/    0001 schema (reference) … 0008 card EMI — all applied in production
tests/                  security, money and ledger tests (npm test)
docs/AUDIT.md           architecture, mutation map, risk register and roadmap
design/                 the approved HTML designs
```
