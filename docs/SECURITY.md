# MRRMR — Security & Integrity Review (2026-11-19)

Scope: the application code, the live Supabase project (catalog, policies, grants, functions, advisors — read-only;
data tests ran inside rolled-back transactions), the GitHub repository and the Vercel project settings (names only).
This is an engineering review, **not** a certification or compliance attestation. No independent audit has been done.

## 1. Findings (severity-ranked)

| # | Sev | Finding | Status |
| --- | --- | --- | --- |
| S1 | **High** | **View-mode secrets in source, used in production.** `lib/viewer.ts` contained a default viewer password and the 5-character passcode `mrrmr`. Vercel has no `VIEW_PASSCODE`/`VIEWER_PASSWORD`, so production used them. Anyone with the source could sign in to Supabase as the viewer. Impact is bounded: the database lets the viewer read the research ledger only (verified, §3). | **Fixed in code:** no defaults; view mode is off unless both env vars are set (passcode ≥ 12 chars, password ≥ 16). **You must** rotate the viewer password and set the env vars (§4). |
| S2 | High | **Balance undo depends on memory.** For older records the app never stored whether a loan/card amount changed a balance, so "undo the balance" on delete can move money that never moved (AUDIT C1). | **Open.** Mitigated by clear prompts and the new reconciliation tool; a real fix needs `balance_applied` columns (proposed, not built). |
| S3 | Medium | **Repayment limits enforced in the app only until 0010/0012 are applied.** Two simultaneous submissions could both pass the app check. | Fixed in migrations 0010 + 0012 (per-person lock + in-transaction limit). **Not applied yet.** |
| S4 | Medium | **No database-level idempotency** for repayments. | Fixed in 0012 (`request_id`, unique). The app already sends ids and falls back safely before 0012. |
| S5 | Medium | **Unused auth account.** A second Gmail account (created 2026-10-13) has never signed in and owns no data. | **You decide:** delete it in Supabase → Authentication → Users if it's not yours/needed. |
| S6 | Medium | **Another app shares this Supabase project.** `public.tracker_api(jsonb)` is SECURITY DEFINER and callable by `anon` (a key-gated patient case tracker in schema `tracker`). It doesn't touch finance tables, but shares the project's blast radius and backups. | **Not changed** (not part of MRRMR). Recommend moving it to its own project. |
| S7 | Medium | Supabase **leaked-password protection is off**; **no MFA**. | Manual: turn on leaked-password protection. MFA (TOTP) is supported by Supabase; not built into the UI (§5). |
| S8 | Medium | **`SITE_URL` not set** in Vercel; reset links fall back to an Origin==Host check. | Manual: set `SITE_URL` (§4). |
| S9 | Low | CSP allows `'unsafe-inline'` scripts (Next inline payloads + the pre-paint theme script). | Open. A nonce-based CSP is possible since every page is dynamic; not done (risk of breaking hydration without e2e tests). |
| S10 | Low | `anon` could EXECUTE `viewed_owner()` and `touch_updated_at()` (harmless, but unnecessary). | Fixed in 0012. |
| S11 | Low | Dates and amounts weren't range-checked server-side (an invalid date reached Postgres; huge amounts errored in the DB). | **Fixed:** `lib/validate.ts` + checks in every action; 0012 adds DB date-range constraints. |
| S12 | Low | No root error boundary (a layout failure showed Next's default page). | **Fixed:** `app/global-error.tsx` (no internals shown). |
| S13 | Low | **Viewer "Exit" signed out every viewer** (shared account + global sign-out). | **Fixed:** viewer exit uses `scope: "local"`; admin sign-out stays global. |
| S14 | Low | No audit trail of changes; manual balance edits weren't traceable. | Fixed in 0011 (append-only `audit_log` + `balance_adjustments`). **Not applied yet.** |
| S15 | Info | In-memory rate limits are per server instance. | Accepted; Supabase Auth's own limits apply behind them. |

**Verified OK:** repository is **private** (GitHub returns 404 unauthenticated); `.env.local` is git-ignored and not
tracked; no `service_role` key anywhere in code or Vercel; no `NEXT_PUBLIC_` variables (Supabase is called from the
server only); every public table has RLS; `anon` has no table grants; every finance RPC is `SECURITY INVOKER` with a
fixed `search_path`; `debtor_summary` is `security_invoker`; `npm audit`: 0 vulnerabilities (next 16.4.6); cookies
httpOnly + SameSite=Lax + Secure in production; HSTS, `frame-ancestors 'none'`, `nosniff`, Referrer/Permissions
policies; generic sign-in / reset errors (no account enumeration); reset requires a fresh recovery session; admin
sign-out revokes all sessions (Supabase default `scope: "global"`, checked in the installed library).

## 2. Implemented in Phase 7
* `lib/viewer.ts` / `lib/view-config.ts`: no secrets in source; view mode fails closed (tested).
* `lib/validate.ts`: real-calendar date and amount range checks, applied in every server action (tested).
* Idempotent repayments: per-submission `requestId` (form) → `p_request_id` (0012), with a safe pre-0012 fallback.
* Viewer exit no longer signs out other viewers. Root error boundary. Server log for view sign-in failures carries
  status/code only (no credentials, no personal data).
* Migration **0012_hardening.sql**: least-privilege revokes, FK index, idempotency, date constraints (not applied).
* Route allow-list for view mode extracted and unit-tested (`viewerMayOpen`), incl. traversal/encoding tricks.

## 3. Verification run against the live database (all inside rolled-back transactions)
* **`supabase/tests/rls_viewer.sql`** — as the viewer: 0 rows from accounts, cards, people, loans, card_uses,
  repayments, debtor_summary; research visible (73/4); updates/deletes touch 0 rows; insert → `42501 viewer no
  insert`; `add_loan` RPC → `42501`. ✅
* **`supabase/tests/integration_rollback.sql`** — as the owner, 12/12 true: loan deducts exactly; repayment credits
  exactly; delete-with-undo restores each step; an overdrawing loan is rejected **and fully rolled back**; card
  purchase/repayment move the card only, never the bank; EMI stored; negative repayment rejected. Afterwards: 0 test
  rows remain, bank balance unchanged (৳57,300). ✅
* **Concurrency:** balance updates are single atomic statements (`balance = balance ± x`), each RPC is one
  transaction, and 0009/0010/0012 serialise repayments per person with `pg_advisory_xact_lock`. A true two-session
  race test needs two connections (SQL Editor tabs or psql) on a **staging branch** — procedure in §6; not run.

## 4. Secret rotation checklist (do these; values are never written here)
1. Supabase → Authentication → Users → the viewer account → **set a new long random password** (32+ chars).
2. Vercel → Project → Settings → Environment Variables (Production): add **`VIEWER_PASSWORD`** (that new password),
   **`VIEW_PASSCODE`** (a new passphrase, 12+ chars, e.g. four random words), **`VIEWER_EMAIL`** (the viewer's email),
   **`SITE_URL`** (`https://<your-domain>`). Mark them Sensitive.
3. Redeploy. Check `/view` accepts the new passcode and rejects the old one.
4. Optional: rotate the publishable key (Supabase → API Keys) and update Vercel + the GitHub Action secrets.
5. The old viewer password remains in git history — after step 1 it is useless. Keep the repo private.

## 5. Deployment security checklist
- [ ] Back up first (Supabase → Database → Backups, or download a manual backup; plus `/export` CSV).
- [ ] Apply migrations in order **0010 → 0011 → 0012** (0009 is included in 0010) on a branch first if possible; after each, run `supabase/tests/rls_viewer.sql` and `integration_rollback.sql` and the advisors.
- [ ] Set the four env vars (§4) **before** deploying this code (otherwise view mode is off — by design).
- [ ] Supabase Auth: sign-ups **off**; leaked-password protection **on**; "Secure password change" on; Redirect URLs list only `https://<your-domain>/auth/callback` (and localhost for dev).
- [ ] Reset-password email template uses the `token_hash` link (README).
- [ ] Decide on the unused auth account (S5) and the `tracker` app (S6).
- [ ] Optional: enable MFA (TOTP) for the admin in Supabase and enforce `aal2` in `proxy.ts` (not built).
- [ ] GitHub Action: secrets `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` only; `permissions: {}`; it sends one anonymous read that RLS denies — it cannot mutate data.

## 6. Two-session concurrency test (staging only)
In two SQL Editor tabs on a **branch**, as the owner: `begin;` → `select record_repayment(<person>, <amount = what they owe>, 'loan');` in tab A (don't commit) → run the same in tab B (it waits on the advisory lock) → `commit;` in A → tab B must fail with "They owe nothing on loans." → `rollback;` in B.
