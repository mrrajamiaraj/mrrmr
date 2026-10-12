# Personal Finance & Loan Recovery Workspace

A private dashboard for one person: City Bank balance, two credit cards, who owes you money (loans and card
use), repayments, and a monthly recovery summary. Built with Next.js (App Router), TypeScript, Tailwind CSS and
Supabase (`@supabase/ssr`). Amounts are Bangladeshi Taka with Indian grouping (৳1,43,345).

| Page | Route | Design |
| --- | --- | --- |
| Overview | `/` | `design/Main.dc.html` |
| Bank Account | `/account` | `design/Accounts.dc.html` |
| Debtors & Loans | `/debtors` | `design/Lending.dc.html` |
| Credit Card 1 / 2 | `/cards/1`, `/cards/2` | `design/Cards.dc.html`, `design/Card2.dc.html` |
| Admin password dialog | header, every page | `design/AdminButton.dc.html` |
| CSV backup | `/export` (“Export CSV” in the nav) | — |

## One-time Supabase setup

The tables, RLS policies and the `debtor_summary` view already exist (`supabase/migrations/0001_finance_schema.sql`,
kept for reference — don't run it again).

1. **Add the write functions.** Open the Supabase dashboard → SQL Editor → New query, paste the contents of
   `supabase/migrations/0002_finance_functions.sql`, and run it. It creates four functions (`add_loan`,
   `add_card_use`, `record_repayment`, `find_or_create_person`) and changes no tables. They let the app insert a
   row and move a balance in a single transaction, so balances never drift. They run as the signed-in user, so RLS
   still applies.
2. **Create your login.** Authentication → Users → Add user → enter your email and a password, tick
   “Auto Confirm User”. Then Authentication → Sign In / Providers → turn **off** “Allow new users to sign up”, so
   nobody else can create an account on your deployed site.
3. **Allow the reset link.** Authentication → URL Configuration: set Site URL to your Vercel URL and add
   `http://localhost:3000/auth/callback` and `https://<your-vercel-domain>/auth/callback` to Redirect URLs.

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
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → Publishable key |

Both are safe to expose to the browser — every table is protected by row-level security. **Never** put the
`service_role` / secret key in this app.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel: Add New → Project → import the repo. The framework is detected as Next.js; keep the defaults.
3. Under Environment Variables add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Deploy, then add the Vercel URL to Supabase's URL Configuration (step 3 above).

## Keep the free Supabase project awake

Free projects pause after a week with no activity. `.github/workflows/keep-supabase-awake.yml` sends one tiny
request every day. In GitHub → Settings → Secrets and variables → Actions, add:

- `SUPABASE_URL` — same value as `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` — same value as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

You can run it by hand from the Actions tab (“Run workflow”) to check it works.

## How the money logic works

- **Bank Account:** money now + what people owe = balance after everyone pays back. “Add Debtor” finds or
  creates the person, inserts a loan, and (if ticked) takes the amount out of the account balance — all in one
  `add_loan` call. Repayments recorded here are added to the account balance.
- **Credit cards:** card balance − what people owe for this card = your own share. “Add Debtor” inserts a
  `card_use` (type **Me** as the name for your own spending) and optionally adds it to the card balance.
  Repayments can optionally lower the card balance.
- **Debtors & Loans:** totals, status (Pending / Partially Paid / Repaid / Overdue) and next due date come from
  the `debtor_summary` view. “Borrowed” there means loans + card use by that person.
- **Overview → monthly summary:** there is no income/expense table, so the monthly table shows what the data
  does have: money lent, others' card use, your own card spending, money recovered, and the net per month.

## Project layout

```
app/
  (dashboard)/          signed-in pages: page.tsx (Overview), account/, debtors/, cards/[slot]/
  login/                sign-in + forgot password
  auth/callback, reset  password-reset link handling
  export/route.ts       CSV backup
components/             shell (header + nav), Admin dialog, modals, debtor profile/slider/forms
lib/
  data.ts               loads everything for a page from Supabase
  ledger.ts             per-person totals, history and “owes after” running balances
  actions.ts            server actions (all writes)
  format.ts             ৳ formatting and dates (Asia/Dhaka)
proxy.ts                sends signed-out visitors to /login (Next.js 16's name for middleware)
supabase/migrations/    0001 schema (reference), 0002 functions (run once)
design/                 the approved HTML designs
```
