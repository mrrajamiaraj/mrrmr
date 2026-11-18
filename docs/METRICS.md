# Overview metrics — definitions

Every figure on the Overview (`/account`) comes from `lib/dashboard.ts` (tested in `tests/dashboard.test.mjs`) and the
database. Nothing is estimated or invented. Four kinds of number are shown side by side and **never added together**.

| Kind | Meaning |
| --- | --- |
| **Asset** | Money you have now. |
| **Receivable** | Money other people owe you. Not cash until repaid. |
| **Liability** | Money you owe (the card issuers). |
| **Projection** | What a balance *would* be if receivables were repaid. Never "available". |

## Financial position (hero)
| Figure | Kind | Definition |
| --- | --- | --- |
| Cash · City Bank | Asset | `accounts.balance` exactly as last entered. As-of = `accounts.updated_at`. The balance has no history table, so **no month-over-month change is shown** for it. |
| Owed to you | Receivable | Bank-loan receivables + card receivables (below). |
| Owed on your cards | Liability | Sum of `cards.balance` (what is owed on each card). |
| Bank after loans repaid | Projection | Cash + **bank-loan** receivables only. Card receivables are excluded: when people repay card purchases, that money pays the card, not the bank. |

## Receivables
* **Bank-loan receivables:** for each person, loans − loan repayments. Repayments clear the earliest pay-back date
  first (no date = last; same date = older loan first).
* **Card receivables:** for each person and card, their purchases on that card − their repayments for that card.
  Repayments clear installments earliest-due first. Purchases without a due date are listed as "No due date".
* **Reconciliation:** the itemised total must equal the database view `debtor_summary` (per person, netted across
  sources). They differ only if someone overpaid one source while owing on another. The dashboard then shows an
  insight; it never silently picks one.
* **Due in 7 days:** unpaid items due from today to today + 7. **Overdue:** unpaid items due before today.
* **Collection progress:** all repayments ever ÷ everything ever lent (loans + others' card purchases).
* **Largest receivables:** per-person still-owed from `debtor_summary`, top five, with share of the total.

## Credit cards (per card)
| Figure | Definition |
| --- | --- |
| Owed on card | `cards.balance` (liability). |
| Available | limit − balance (never below 0). |
| Others owe | That card's receivables (above). |
| Your share | balance − others owe. Negative means others owe more than the card balance, which usually means the balance needs updating. |
| EMI still to come | Unpaid EMI installments on the card. **Next EMI:** the first unpaid one due today or later. |
| Pay by | `cards.pay_by`. Shown as "passed" when it is before today and the card has a balance. |

## EMI charges and split purchases (owner decisions 2026-11-19; need migration 0010)
* **What a person owes for a card purchase** = amount + `emi_charges`. Charges are recorded only from the card
  statement (never assumed), apply to EMI shares only, are **owed by the buyer**, and are spread over the
  installments. They are not added to the card balance when recorded; the card balance picks them up when you update
  it from a statement. Rows without charges, which is every row before 0010, are unchanged (tests show before = after).
* **EMI schedule:** each installment = total payable ÷ months, rounded down to the paisa; the last one absorbs the
  remainder. Shown with paisa when it isn't whole. **Settle early** = one repayment of the remaining amount, which
  clears every remaining installment (earliest first).
* **Split purchase:** one receipt, several payers (you and/or others), saved in one transaction. Each share is its
  own card use, linked by `purchase_group`. The total goes on the card balance once. Your share is never a receivable.

## City Bank recorded movements
Partial by design (owner decision): repayments **credited** to the account (stored only when added to the balance),
and loans made from it (**whether deducted isn't recorded** for past loans). Manual balance edits and individual
debit entries aren't stored, so there is no reconciliation tool. That needs the balance journal proposed in AUDIT P3.

## Repayments (owner rules)
* **Bank effect is explicit.** A loan repayment is added to the bank only when “Add this money to City Bank” is ticked.
  It defaults to on for Bank transfer and **off for Cash, bKash and Nagad**. Card repayments never touch the bank.
* **Limit:** never more than is owed to that source (bank loans, or that one card). **Allocation:** loans earliest
  pay-back date first; card installments earliest-due first.
* **Duplicate guard:** an identical repayment (same person, amount, date and source) recorded in the last 2 minutes
  needs an explicit "it's a separate payment" confirmation.

## Time machine, Outlook, Reports, Data checks (lib/history, forecast, reports, anomalies)
* **Time machine:** receivables and the research ledger as at the end of a past date, rebuilt from dated events.
  Bank and card balances are **not shown** for past dates: they have no history (manual edits, running totals).
* **Outlook:** confirmed obligations = card balances with a pay-by date in the horizon. Expected collections = unpaid
  items due in the horizon (uncertain; overdue items are listed separately and not counted). Scenarios: none, all on
  time, with chosen people delayed. Loan collections → bank; card collections → that card's balance.
* **Reports:** each event in exactly one column of one period. "Into the bank" is a subset of loan repayments, and
  "Owed at end" is a balance; neither is added to the flow columns.
* **Data checks:** duplicate-looking entries, per-source overpayments, others owing more than a card balance,
  identical EMI plans, missing due dates, date-order problems, similar names. They warn only and never change data.

## Snapshot, chart, activity
* **Debit card tally:** `accounts.debit_used`, a running total you add to. It does not change the bank balance.
* **Obligations:** each card's balance with its pay-by date. Statement minimums aren't tracked, so the full balance
  is shown.
* **Collections, month to date:** repayments from the 1st to today, compared with **the same days of the previous
  month** (never a partial month against a full one).
* **Cash movement chart:** "Lent" = loans + others' card purchases, by date taken. "Recovered" = repayments, by date
  paid. Filters: all lending, bank loans only, or card purchases only (with their matching repayments). Your own
  card spending is never included. Views: 6 or 12 months, all months, or by year.
* **Activity:** each loan, card purchase (yours and others') and repayment exactly once. The status comes from the
  allocation rules above.

## Insights (deterministic)
Each insight is shown only when its condition holds, and it states the numbers behind it:
overdue items · due in 7 days · EMI installments in 30 days · collections vs the same days last month (a percentage
only within ±300%; otherwise the amounts) · change in receivables this month (lent − recovered) · card ≥ 80% used ·
pay-by date passed · outstanding loans with no pay-back date · **possible duplicate people** (names 4+ letters long
that differ by one letter) · per-source vs per-person mismatch.
