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

---

# Hardening pass (2026-11-21) — branch `security/hardening` (+ `security/nonce-csp`)

Seven phases, one commit each, every one with tests. After every phase: `npm test` (110 → **151** on
`security/hardening`, **157** on `security/nonce-csp`), `npm run build` and `npm audit --omit=dev` (**0 vulnerabilities**)
all passed. No migration was run, no secret was added, no NEXT_PUBLIC_ variable, no service_role key, no RLS
policy/grant weakened. Nothing pushed or deployed.

| Commit | Phase |
| --- | --- |
| `e36afbd` | 1 Turnstile on every unauthenticated action |
| `a1cba9e` | 2 Global rate limiting |
| `0329b2f` | 3 Admin MFA (TOTP) + migration 0014 (not applied) |
| `67ce858` | 5 Server actions, exports, input surface |
| `df87990` | 6 CI, Dependabot, secret scan |
| `29c21bd` | 7 Security event logging |
| `f315c0a` | 4 Nonce CSP — **on `security/nonce-csp` only** (see "Still open") |

## 7. Findings → fixes

| Finding | Fix | File(s) | Test that proves it | Status |
| --- | --- | --- | --- | --- |
| Bots can script sign-in, reset and view mode | Cloudflare Turnstile; order is rate limit → Turnstile → Supabase; token checked for `success`, **action** and **hostname**; ≤ 2048 chars; 5 s timeout; fails closed (no secret, network error, timeout, non-200, test secret in production) | `lib/turnstile-core.ts`, `lib/turnstile.ts`, `components/turnstile.tsx`, `app/login/*`, `app/view/*`, `app/auth/reset/*`, `app/auth/mfa/*` | `tests/turnstile.test.mjs` (13) | Done — needs keys (§9) |
| S15 rate limits were per instance | Upstash Redis sliding window over its REST API (no new package), memory fallback with one warning. Login 5/15 min/IP + 10/h/email (SHA-256), reset 3/h/IP + 3/h/email, view 8/15 min/IP, MFA 5/15 min per account and per IP, exports 30/10 min/user | `lib/rate-limit-core.ts`, `lib/rate-limit.ts` | `tests/rate-limit.test.mjs` (7) | Done — global once Upstash is set |
| Client IP came from a spoofable `x-forwarded-for` | IP only from `x-real-ip` / `x-vercel-forwarded-for` (what `@vercel/functions` `ipAddress()` reads) on Vercel; off Vercel one shared key | `lib/rate-limit-core.ts` `trustedClientIp` | "a spoofed multi-hop x-forwarded-for can't change the rate-limit key" | Done |
| S7 no MFA | TOTP in Settings (QR + manual key + first code; removal needs a code entered in the last 10 min); `/auth/mfa` step (rate limit + Turnstile); proxy sends an aal1 admin with a verified factor to `/auth/mfa` (factor list from `getUser()`, never the cookie); `writer()` re-checks aal2 for every write; migration **0014** adds a RESTRICTIVE "require aal2" policy on every data table (viewer research reads unchanged) with a DOWN section; `rls_viewer.sql` has an aal1-owner probe that must read 0 rows | `lib/mfa-core.ts`, `lib/mfa-actions.ts`, `lib/viewer.ts`, `proxy.ts`, `app/auth/mfa/*`, `app/(dashboard)/settings/*`, `supabase/migrations/0014_require_aal2.sql`, `supabase/tests/rls_viewer.sql` | `tests/mfa.test.mjs` (9) | Code done; 0014 **not applied** |
| S9 CSP allowed `'unsafe-inline'` scripts | Per-request nonce CSP set in `proxy.ts`: `script-src 'self' 'nonce-…' 'strict-dynamic' https://challenges.cloudflare.com`; nonce on the theme script and Turnstile loader; other directives unchanged. Also `Cross-Origin-Resource-Policy: same-origin`, `X-Permitted-Cross-Domain-Policies: none`, sandboxed CSP on static assets | `lib/csp.ts`, `proxy.ts`, `app/layout.tsx`, `next.config.ts` | `tests/csp.test.mjs` (6) | **Branch only** — signed-in pages unverified |
| Server actions accepted 1 MB bodies, any proxy origin config | `serverActions.allowedOrigins` = SITE_URL host only, `bodySizeLimit: "100kb"` | `next.config.ts` | `tests/hardening.test.mjs` | Done |
| Client ids reached queries unchecked; `via`/`method` uncapped; booleans loosely typed | UUID check on every id before any query (RLS still decides ownership); `via`/`method` capped at 40; booleans must be real booleans | `lib/actions.ts`, `lib/research-actions.ts` | `tests/hardening.test.mjs` | Done |
| Raw Postgres/Supabase error text reached users (table/constraint names) | Only our own RAISE messages (SQLSTATE P0001) pass through; 42501 → "not allowed" message; anything else generic, code logged | `lib/actions.ts`, `lib/research-actions.ts`, `app/auth/reset/actions.ts` | `tests/hardening.test.mjs` | Done |
| `/export` and research exports relied on the proxy for access | `exportGuard()` in every export route: signed in, admin-only for finance (aal2 if MFA), viewer allowed for research; 30/10 min per user; `private, no-store` kept; PDF range ≤ 10 years, ≤ 400 pages, ≤ 15 MB | `lib/export-guard.ts`, `app/export/**`, `app/research/export/**` | `tests/hardening.test.mjs` | Done |
| No CI, no dependency updates, no secret scanning | `.github/workflows/ci.yml` (`permissions: contents: read`; npm ci, test, build, audit; gitleaks over full history from a checksum-verified release, `--redact`); actions pinned to commit SHAs; Dependabot weekly for npm + github-actions | `.github/**` | `tests/supply-chain.test.mjs` (3) | Done — runs once pushed |
| No security telemetry | One-line JSON events: `signin_success/fail`, `mfa_success/fail/enrolled/removed`, `turnstile_fail`, `rate_limit_hit`, `view_entry/fail`; time + HMAC-hashed IP + allow-listed short fields only; never emails, tokens, passwords or amounts | `lib/security-log-core.ts`, `lib/security-log.ts` | `tests/security-log.test.mjs` (4) | Done |

### Phase 5 grep audit
| Pattern | Hits | Verdict |
| --- | --- | --- |
| `dangerouslySetInnerHTML` | `app/layout.tsx` theme script | Safe: a fixed string from `lib/theme-script.ts`, no input. Gets the nonce on the Phase 4 branch. |
| `eval`, `new Function` | none | — |
| Raw SQL string building | none | Every query goes through supabase-js builders or RPCs with named parameters; RPCs are SECURITY INVOKER. |
| Open redirects | `/auth/callback`, `signIn`, `/auth/mfa`, `verifyMfa` | Safe: all go through `safeNextPath` (tested). `/` → `prefs.landing` is allow-listed by `normalizePrefs`. `router.push` targets are internal paths built from ids. |

### Server-action audit (every exported action)
All 17 in `lib/actions.ts` and 4 in `lib/research-actions.ts` call `writer()` (admin, not view mode, aal2 if MFA).
`searchIndex` checks the session itself and is read-only. `lib/mfa-actions.ts` uses `writer()` except `verifyMfa`, which
has its own signed-in/not-viewer check. Before this pass, the ids in `setAccountBalance`, `addDebitUse`, `setDebitUsed`,
`setCardBalance`, `updateCardDetails`, `addLoan.accountId`, `addCardUse`/`addCardPurchase.cardId`,
`recordRepayment.personId/cardId/accountId`, `updatePerson`, `deletePerson` and the four research actions were not
shape-checked (RLS still limited them to the owner's rows). They are now.

## 8. Not applied, decisions, evaluations
* **HSTS `preload` was NOT added.** If you add it and submit to hstspreload.org, browsers hard-code HTTPS-only for the
  domain **and every subdomain**, for months even after removal. Any subdomain without a valid certificate, or anything
  later served over plain HTTP, becomes unreachable. Only do it for a domain you own outright, with every subdomain on
  HTTPS, and never for a `*.vercel.app` domain (you don't control it).
* **Vercel BotID** (evaluated, not added). Basic is free on every plan; Deep Analysis costs $1 per 1,000 checks on Pro.
  It would need the `botid` package plus `initBotId()` in `instrumentation-client.ts`, and `checkBotId()` in the same
  three actions. Turnstile already covers them, so a second package and vendor isn't worth it now. Reconsider if you
  move off Turnstile.
* **Your Vercel plan could not be read.** The API returned the team (`rmr`) but not the plan. Limits for the rules below:
  * **Hobby:** 3 custom rules, of which **1** may rate-limit (fixed window, 10 s–10 min, keyed by IP/JA4).
  * **Pro:** 40 rules, same windows.
* **Vercel Firewall rules to add** (Project → Firewall → Configure; publish after review). They fit Hobby:
  1. *Auth POST rate limit:* if Method = POST and Path matches `^/(login|view|auth/mfa|auth/reset)$` → Rate limit,
     fixed window 60 s, 10 requests, key IP → Deny (429).
  2. *Unexpected methods:* if Method is not one of GET, HEAD, POST → Deny.
  3. *Bots:* turn on the managed **Bot Protection** rule set in Challenge mode, if your plan shows it, and keep AI-bot
     blocking on. Otherwise use a custom rule that challenges known-bad user agents on POST.

## 9. You must do manually (in this order)
1. **The GitHub repository `mrrajamiaraj/mrrmr` is PUBLIC.** On 2026-11-21 it answered an unauthenticated API request
   with 200; on 2026-11-19 it was private. Make it private (Settings → General → Danger zone → Change visibility).
   Then treat everything below that was ever committed as exposed.
2. **Rotate what is in git history.** Commits `80185b8` and `7752e0c` (2026-10-19), in `lib/viewer.ts`, contain the old
   default **viewer password** and **view passcode** (removed in `607af54`). Set a new 32+ character password on the
   viewer account in Supabase → Authentication → Users and update `VIEWER_PASSWORD` in Vercel. Nothing else was found
   (see §11). Don't rewrite history yourself unless you also rotate: rotation is what makes the old value useless.
3. **Cloudflare Turnstile:** Cloudflare dashboard → Turnstile → Add widget.
   * Hostnames: your production domain, plus `localhost` if you want to test locally with real keys.
   * Mode: Managed.
   * In Vercel (Production and Preview), set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`, and mark the secret Sensitive.
   * **Without these keys, sign-in, reset, view mode and the MFA step are refused (fail closed), so set them BEFORE deploying.**
   * For local `next dev` you may use Cloudflare's published test keys in `.env.local` (site `1x00000000000000000000AA`,
     secret `1x0000000000000000000000000000000AA`). They are accepted only when NODE_ENV is not production.
4. **`SITE_URL`** = `https://<your-domain>` in Vercel. It is required in production: the Turnstile hostname check, the
   server-action allowed origin and the reset links all use it. Without it, Turnstile fails closed.
5. **Upstash:** Vercel Marketplace → Upstash Redis (free tier is enough). Make sure `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` exist as server env vars; the integration adds them. Without them, limits fall back to
   per-instance memory and log `rate_limit_fallback` once.
6. **`SECURITY_LOG_SALT`:** a long random string (Sensitive). It keys the IP hash in security logs.
7. **Migrations, on a Supabase branch first:** 0010 → 0011 → 0012 → 0013 → **0014**. After each one, run
   `supabase/tests/rls_viewer.sql` and `integration_rollback.sql`, then the advisors.
   * **Before 0014: enrol MFA** (Settings → Two-step sign-in → Add authenticator app), sign out, and sign in with the code.
   * After 0014, an owner session without the code reads nothing. That is the point, but it means losing the
     authenticator locks the data until you remove the policy (DOWN section) from the SQL editor.
   * Supabase → Authentication → MFA: make sure TOTP is enabled.
8. **Firewall rules** from §8.
9. **Supabase Auth settings:** leaked-password protection on, sign-ups off (from §5 above).
10. **Push and check CI.** The `secrets` job will fail on the history findings in item 2 until those commits are handled.
    Either rotate and accept them in a `.gitleaksignore` (fingerprints from the CI output), or rewrite history.

## 10. Monitoring: Vercel log drain and alert
Security events are single JSON lines in the function logs. For example:
`{"type":"security","event":"signin_fail","time":"…","ip":"3f9a…","status":"400"}`.
* **Drain:** Vercel → Team Settings → Drains → Add drain → Logs. Choose a destination (Axiom, Better Stack, Datadog…) and
  limit it to this project and to Production. Drains need a paid Vercel plan; on Hobby, use the project's **Logs** tab
  and search for `"type":"security"` by hand.
* **Alert** (in the destination): count lines where `type = "security"` and `event` is one of `signin_fail`, `mfa_fail`,
  `turnstile_fail`, `rate_limit_hit`, `view_fail`, over a sliding 10 minutes. Notify when the count is **> 20**.
  * Add a second alert on any single `ip` hash with > 10 failures in 10 minutes.
  * Add a third on any `mfa_removed` event (you should always know when that happens).

## 11. Secret scan of git history (2026-11-21)
gitleaks itself was not downloaded on this machine (no downloads without your OK). CI runs it on every push. Instead,
every added or removed line in `git log --all -p` was checked for:
* Supabase secret and publishable keys;
* JWTs and private keys;
* AWS, GitHub and Stripe tokens;
* password, secret and token assignments;
* env-var fallbacks.

| Finding | File | Commit(s) | Verdict |
| --- | --- | --- | --- |
| Viewer password default | `lib/viewer.ts` | added `80185b8`, `7752e0c`; removed `607af54` | **Real — rotate (§9.2)** |
| View passcode default | `lib/viewer.ts` | same | Real but obsolete (passcodes removed 2026-11-19) |
| Fake test values (`fake-token`, `…fake-secret-for-tests`) | `tests/rate-limit.test.mjs`, `tests/turnstile.test.mjs` | `a1cba9e`, `e36afbd` | Not secrets |
| `AX…` integrity hashes | `package-lock.json` | `500ab7a` | Not secrets |
| `?? "…"` in an aria-label | `components/research-viz.tsx` | `61739ce`, `19b534d` | Not secrets |
No Supabase key, JWT, private key or cloud token was found in any commit.

## 12. Still open (by severity)
1. **High — public repository and the old viewer password in history** (§9.1–9.2). Only you can fix it.
2. **High — migrations 0010–0014 not applied.** S3 and S4 (repayment limit and idempotency in the database), S14 (audit
   trail) and the database-level MFA requirement exist only in code until they are applied.
3. **Medium — Phase 4 (nonce CSP) is on `security/nonce-csp`, not merged.**
   * Verified on a local production build (`next build && next start`) for `/login`, `/view` and `/auth/reset`:
     every one of 14 script tags carries the per-request nonce, the nonce changes per request, the widget loads and
     the forms hydrate (submit enables after the Turnstile token), and there are 0 console messages.
   * **Not verified:** account, debtors, cards, research, settings, and the PDF/CSV exports. A production build refuses
     Cloudflare's test secret by design, so no one can sign in locally without real keys.
   * To finish: set real Turnstile keys and `SITE_URL=http://localhost:3000` (with `localhost` in the widget's
     hostnames), check out the branch, run `npm run build && npm start`, sign in, open each page with DevTools → Console
     open, and confirm there are no "Refused to …" lines. Or use a Vercel preview of the branch. Then merge.
4. **Medium — S2 balance-undo for old records** (unchanged, see above).
5. **Medium — admin lock-out risk after 0014.** Losing the authenticator means removing the policy from the SQL editor.
   Supabase TOTP has no recovery codes here, so keep the TOTP key (shown at setup) in a password manager.
6. **Low — without Upstash, limits stay per instance** (the memory fallback).
7. **Low — the per-email login limit can be used to slow the admin down** (10 bad tries per hour locks that email for up
   to an hour). This is the accepted trade-off against password guessing; Turnstile makes it costly.
8. **Low — static assets outside the proxy** get a fixed sandboxed CSP rather than the nonce policy. They never run scripts.