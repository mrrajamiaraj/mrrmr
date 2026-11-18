"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { writer } from "@/lib/viewer";
import { passwordProblems } from "@/lib/password";
import { cleanText, siteOrigin } from "@/lib/security";
import { EMI_MONTHS, type PayPlan } from "@/lib/types";
import { compareMoney, roundMoney, subMoney, sumBy } from "@/lib/money";
import { normalizeLayout } from "@/lib/dashboard-layout";
import { normalizePrefs } from "@/lib/prefs";

export type ActionResult = { error?: string; personId?: string | null; groupId?: string | null };

type DbError = { message: string; code?: string } | null;

function friendly(error: NonNullable<DbError>): string {
  const m = error.message;
  if ((error.code === "PGRST202" || /could not find the function/i.test(m)) && /delete_record/.test(m))
    return "Deleting needs one more database function. Run supabase/migrations/0004_delete_records.sql in the Supabase SQL Editor, then try again.";
  if ((error.code === "PGRST202" || /could not find the function/i.test(m)) && /add_debit_use/.test(m))
    return "The debit card total needs one more database function. Run supabase/migrations/0006_debit_card_used.sql in the Supabase SQL Editor, then try again.";
  if ((error.code === "PGRST202" || /could not find the function/i.test(m)) && /add_card_use/.test(m) && /p_emi_months|p_pay_plan/.test(m))
    return "EMI needs a database update. Run supabase/migrations/0008_card_emi.sql in the Supabase SQL Editor, then try again.";
  if (error.code === "PGRST202" || /could not find the function/i.test(m))
    return "The database functions are missing. Run supabase/migrations/0002_finance_functions.sql in the Supabase SQL Editor, then try again.";
  if (/balance_check/.test(m)) return "That would make the balance go below ৳0.";
  if (/people_owner_name_uniq/.test(m)) return "Someone with that name already exists.";
  if (/violates foreign key constraint/.test(m)) return "This person still has loans, card uses or repayments, so they can't be deleted.";
  return m;
}

function done(error: DbError, extra: ActionResult = {}): ActionResult {
  if (error) return { error: friendly(error) };
  revalidatePath("/", "layout");
  return extra;
}

/** Today in Bangladesh time — the database's default for a repayment date when none is given. */
function todayIsoServer() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}

/** Exact two-decimal rounding of client input (half away from zero); NaN for anything that isn't an amount. */
function money(n: unknown) {
  return roundMoney(n);
}

// Free text is trimmed and capped server-side; the forms are not the only way to call these actions.
const NAME = 120, TEXT = 500;
const orNull = (s: string | null | undefined, max = TEXT) => cleanText(s, max) || null;
const req = (s: string | null | undefined, max = TEXT) => cleanText(s, max);

// ---- balances ---------------------------------------------------------------

export async function setAccountBalance(accountId: string, balance: number): Promise<ActionResult> {
  const b = money(balance);
  if (!(b >= 0)) return { error: "Enter a balance of 0 or more." };
  const supabase = await writer();
  const { error } = await supabase.from("accounts").update({ balance: b }).eq("id", accountId);
  return done(error);
}

export async function addDebitUse(accountId: string, amount: number): Promise<ActionResult> {
  const a = money(amount);
  if (!(a > 0)) return { error: "Enter an amount above 0." };
  const supabase = await writer();
  const { error } = await supabase.rpc("add_debit_use", { p_account_id: accountId, p_amount: a });
  return done(error);
}

export async function setDebitUsed(accountId: string, total: number): Promise<ActionResult> {
  const t = money(total);
  if (!(t >= 0)) return { error: "Enter a total of 0 or more." };
  const supabase = await writer();
  const { error } = await supabase.from("accounts").update({ debit_used: t }).eq("id", accountId);
  return done(error);
}

export async function setCardBalance(cardId: string, balance: number): Promise<ActionResult> {
  const b = money(balance);
  if (!(b >= 0)) return { error: "Enter a balance of 0 or more." };
  const supabase = await writer();
  const { error } = await supabase.from("cards").update({ balance: b }).eq("id", cardId);
  return done(error);
}

// ---- first-run setup --------------------------------------------------------

export async function createAccount(input: { name: string; holder_name: string; balance: number }): Promise<ActionResult> {
  if (!req(input.name, NAME)) return { error: "Enter the account name." };
  const b = money(input.balance);
  if (!(b >= 0)) return { error: "Enter a balance of 0 or more." };
  const supabase = await writer();
  const { error } = await supabase
    .from("accounts")
    .insert({ name: req(input.name, NAME), holder_name: orNull(input.holder_name, NAME), balance: b });
  return done(error);
}

export async function createCard(input: {
  slot: 1 | 2;
  bank: string;
  name: string;
  network: string;
  last4: string;
  credit_limit: number | null;
  balance: number;
  pay_by: string;
}): Promise<ActionResult> {
  if (input.slot !== 1 && input.slot !== 2) return { error: "Unknown card slot." };
  if (!req(input.bank, NAME) || !req(input.name, NAME)) return { error: "Enter the bank and card name." };
  if (input.last4 && !/^\d{4}$/.test(input.last4)) return { error: "Last 4 digits must be 4 numbers." };
  const b = money(input.balance);
  if (!(b >= 0)) return { error: "Enter a balance of 0 or more." };
  const supabase = await writer();
  const { error } = await supabase.from("cards").insert({
    slot: input.slot,
    bank: req(input.bank, NAME),
    name: req(input.name, NAME),
    network: orNull(input.network, 40),
    last4: orNull(input.last4),
    credit_limit: input.credit_limit == null || Number.isNaN(input.credit_limit) ? null : money(input.credit_limit),
    balance: b,
    pay_by: orNull(input.pay_by),
  });
  return done(error);
}

export async function updateCardDetails(
  cardId: string,
  input: { credit_limit: number | null; pay_by: string }
): Promise<ActionResult> {
  const supabase = await writer();
  const { error } = await supabase
    .from("cards")
    .update({ credit_limit: input.credit_limit == null ? null : money(input.credit_limit), pay_by: orNull(input.pay_by) })
    .eq("id", cardId);
  return done(error);
}

// ---- debtors ----------------------------------------------------------------

export async function addLoan(input: {
  name: string;
  amount: number;
  reason: string;
  takenOn: string;
  method: string;
  dueOn: string;
  accountId: string | null;
  deduct: boolean;
  initialRepaid?: number;
  notes?: string;
}): Promise<ActionResult> {
  const amount = money(input.amount);
  if (!req(input.name, NAME)) return { error: "Enter who took the money." };
  if (!(amount > 0)) return { error: "Enter an amount above 0." };
  if (!req(input.reason)) return { error: "Enter why they took it." };
  const supabase = await writer();
  const { data, error } = await supabase.rpc("add_loan", {
    p_person_name: req(input.name, NAME),
    p_amount: amount,
    p_reason: req(input.reason),
    p_taken_on: orNull(input.takenOn),
    p_method: input.method,
    p_due_on: orNull(input.dueOn),
    p_account_id: input.accountId,
    p_deduct: input.deduct && !!input.accountId,
    p_initial_repaid: money(input.initialRepaid ?? 0) || 0,
    p_notes: orNull(input.notes),
  });
  return done(error, { personId: data as string });
}

export async function addCardUse(input: {
  cardId: string;
  name: string;
  amount: number;
  reason: string;
  usedOn: string;
  category: string;
  dueOn: string;
  addToBalance: boolean;
  plan?: PayPlan;
  emiMonths?: number;
}): Promise<ActionResult> {
  const amount = money(input.amount);
  if (!req(input.name, NAME)) return { error: "Enter who used the card (or “Me” for your own spending)." };
  if (!(amount > 0)) return { error: "Enter an amount above 0." };
  if (!req(input.reason)) return { error: "Enter why or where it was used." };
  const emi = input.plan === "emi";
  if (input.plan && input.plan !== "full" && !emi) return { error: "Pick full payment or EMI." };
  if (emi && !(EMI_MONTHS as readonly number[]).includes(Number(input.emiMonths))) return { error: "Pick how many months the EMI runs." };
  if (emi && !orNull(input.dueOn)) return { error: "Pick the first installment date." };
  const supabase = await writer();
  const { data, error } = await supabase.rpc("add_card_use", {
    p_card_id: input.cardId,
    p_person_name: req(input.name, NAME),
    p_amount: amount,
    p_reason_or_place: req(input.reason),
    p_used_on: orNull(input.usedOn),
    p_category: req(input.category, 40),
    p_due_on: orNull(input.dueOn),
    p_add_to_balance: input.addToBalance,
    // Only sent for EMI, so full-payment uses keep working before migration 0008 is run.
    ...(emi ? { p_pay_plan: "emi", p_emi_months: Number(input.emiMonths) } : {}),
  });
  return done(error, { personId: (data as string | null) ?? null });
}

export type PurchasePart = { name: string; amount: number; plan: PayPlan; emiMonths?: number; dueOn?: string; emiCharges?: number };

/**
 * Records one card purchase with one or more payers (you and/or others) in ONE transaction (add_card_purchase,
 * migration 0010). Before 0010, a single-payer purchase without EMI charges falls back to add_card_use, which has
 * always been atomic; splits and charges then return a clear "run migration 0010" message.
 */
export async function addCardPurchase(input: {
  cardId: string; reason: string; usedOn: string; category: string; addToBalance: boolean; parts: PurchasePart[];
}): Promise<ActionResult & { groupId?: string | null }> {
  if (!req(input.reason)) return { error: "Enter why or where the card was used." };
  if (!Array.isArray(input.parts) || input.parts.length < 1 || input.parts.length > 10) return { error: "A purchase can have 1 to 10 payers." };
  const parts = [];
  const seen = new Set<string>();
  for (const p of input.parts) {
    const name = req(p.name, NAME);
    const amount = money(p.amount);
    const charges = money(p.emiCharges ?? 0);
    const me = name.toLowerCase() === "me";
    if (!name) return { error: "Enter who pays each share (or “Me”)." };
    if (seen.has(name.toLowerCase())) return { error: `“${name}” appears twice — combine their shares into one.` };
    seen.add(name.toLowerCase());
    if (!(amount > 0)) return { error: `${me ? "Your" : `${name}'s`} share must be above ৳0.` };
    if (!(charges >= 0)) return { error: "EMI charges can't be negative." };
    const emi = !me && p.plan === "emi";
    if (emi && !(EMI_MONTHS as readonly number[]).includes(Number(p.emiMonths))) return { error: `Pick how many months ${name}'s EMI runs.` };
    if (emi && !orNull(p.dueOn)) return { error: `Pick ${name}'s first installment date.` };
    if (!emi && charges > 0) return { error: "Charges apply to EMI shares only." };
    parts.push({
      name, amount, plan: emi ? "emi" : "full", emi_months: emi ? Number(p.emiMonths) : null,
      due_on: me ? null : orNull(p.dueOn), emi_charges: emi ? charges : 0,
    });
  }

  const supabase = await writer();
  const { data, error } = await supabase.rpc("add_card_purchase", {
    p_card_id: input.cardId, p_reason: req(input.reason), p_used_on: orNull(input.usedOn),
    p_category: req(input.category, 40), p_add_to_balance: input.addToBalance, p_parts: parts,
  });
  const missing = error && (error.code === "PGRST202" || /could not find the function/i.test(error.message));
  if (!missing) return done(error, { groupId: (data as string | null) ?? null });

  // Pre-0010 fallback: exactly what the old form did, for the cases the old function can represent.
  const [only] = parts;
  if (parts.length > 1) return { error: "Splitting a purchase needs a database update. Run supabase/migrations/0010_card_purchases.sql in the Supabase SQL Editor, then try again." };
  if (only.emi_charges > 0) return { error: "Recording EMI charges needs a database update. Run supabase/migrations/0010_card_purchases.sql in the Supabase SQL Editor, then try again." };
  return addCardUse({
    cardId: input.cardId, name: only.name, amount: only.amount, reason: input.reason, usedOn: input.usedOn, category: input.category,
    dueOn: only.due_on ?? "", addToBalance: input.addToBalance, plan: only.plan as PayPlan, emiMonths: only.emi_months ?? undefined,
  });
}

export async function recordRepayment(input: {
  personId: string;
  amount: number;
  via: string;
  paidOn?: string;
  appliesTo: "loan" | "card";
  cardId: string | null;
  accountId: string | null;
  addToAccount: boolean;
  lowerCard: boolean;
  /** set after the user confirmed that an identical-looking repayment really is a second payment */
  confirmDuplicate?: boolean;
}): Promise<ActionResult & { duplicate?: boolean }> {
  const amount = money(input.amount);
  if (!(amount > 0)) return { error: "Enter an amount above 0." };
  if (input.appliesTo === "card" && !input.cardId) return { error: "Pick which card this repayment is for." };
  // Never put money in the bank without saying which account (and only for loan repayments).
  if (input.addToAccount && (!input.accountId || input.appliesTo !== "loan")) return { error: "Only a loan repayment can be added to a bank account — pick the account." };
  if (!input.addToAccount && input.accountId) return { error: "Inconsistent request: an account was given but the money isn't being added to it." };

  const supabase = await writer();
  // Duplicate guard: the same person, amount, date and source recorded in the last 2 minutes is almost always a
  // double-tap or a resubmitted form. Ask once; the user can confirm it is a genuinely separate payment.
  if (!input.confirmDuplicate) {
    let dq = supabase.from("repayments").select("id", { count: "exact", head: true })
      .eq("person_id", input.personId).eq("amount", amount).eq("applies_to", input.appliesTo)
      .eq("paid_on", orNull(input.paidOn) ?? todayIsoServer()).gte("created_at", new Date(Date.now() - 120_000).toISOString());
    if (input.cardId) dq = dq.eq("card_id", input.cardId);
    const { count } = await dq;
    if (count) return { duplicate: true, error: `An identical repayment of ৳${amount.toLocaleString("en-IN")} was recorded moments ago. Is this a second, separate payment?` };
  }
  // A repayment can't be more than the person owes to THAT source: bank loans, or the one card it is for.
  // (Not their total across everything — extra on one card must not hide what is still owed elsewhere.)
  const owed = await owedToSource(supabase, input.personId, input.appliesTo, input.cardId);
  if (owed === null) return { error: "Could not check what they owe right now. Try again." };
  if (compareMoney(amount, owed) > 0) {
    const where = input.appliesTo === "loan" ? "on loans" : "for that card";
    return { error: owed > 0 ? `They only owe ৳${owed.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${where}.` : `They owe nothing ${where}.` };
  }

  const { error } = await supabase.rpc("record_repayment", {
    p_person_id: input.personId,
    p_amount: amount,
    p_applies_to: input.appliesTo,
    p_via: input.via,
    p_paid_on: orNull(input.paidOn),
    p_card_id: input.cardId,
    p_account_id: input.accountId,
    p_add_to_account: input.addToAccount,
    p_lower_card: input.lowerCard,
  });
  return done(error, { personId: input.personId });
}

/**
 * What a person still owes to one source, exact to the paisa and never below 0: bank loans minus loan repayments,
 * or their uses of one card minus their repayments for that card. Null if the database could not be read.
 */
async function owedToSource(
  supabase: Awaited<ReturnType<typeof writer>>,
  personId: string,
  appliesTo: "loan" | "card",
  cardId: string | null
): Promise<number | null> {
  // select("*") so this works before and after migration 0010 (emi_charges); card debt = amount + emi_charges.
  const taken = appliesTo === "loan"
    ? supabase.from("loans").select("amount").eq("person_id", personId)
    : supabase.from("card_uses").select("*").eq("person_id", personId).eq("card_id", cardId!);
  let paidQ = supabase.from("repayments").select("amount").eq("person_id", personId).eq("applies_to", appliesTo);
  if (appliesTo === "card") paidQ = paidQ.eq("card_id", cardId!);
  const [t, p] = await Promise.all([taken, paidQ]);
  if (t.error || p.error) return null;
  const owedRow = (r: { amount: unknown; emi_charges?: unknown }) => sumBy([r.amount, r.emi_charges ?? 0], (x) => x);
  return Math.max(subMoney(sumBy(t.data ?? [], owedRow), sumBy(p.data ?? [], (r) => r.amount)), 0);
}

export async function updatePerson(
  personId: string,
  input: { name: string; relation: string; phone: string; notes: string }
): Promise<ActionResult> {
  if (!req(input.name, NAME)) return { error: "Enter a name." };
  const supabase = await writer();
  const { error } = await supabase
    .from("people")
    .update({ name: req(input.name, NAME), relation: orNull(input.relation, NAME), phone: orNull(input.phone, 40), notes: orNull(input.notes) })
    .eq("id", personId);
  return done(error, { personId });
}

/** Only succeeds for people with no records: the foreign keys are ON DELETE RESTRICT. */
export async function deletePerson(personId: string): Promise<ActionResult> {
  const supabase = await writer();
  const { error } = await supabase.from("people").delete().eq("id", personId);
  return done(error);
}

export type RecordKind = "loan" | "card_use" | "repayment";

/** Permanently deletes one loan, card use or repayment; optionally undoes its balance change in the same transaction. */
export async function deleteRecord(kind: RecordKind, id: string, undoBalance: boolean): Promise<ActionResult> {
  if (!["loan", "card_use", "repayment"].includes(kind)) return { error: "Unknown record type." };
  const supabase = await writer();
  const { error } = await supabase.rpc("delete_record", { p_kind: kind, p_id: id, p_undo_balance: undoBalance });
  return done(error);
}

/**
 * Permanently deletes several records (e.g. a person's whole history), each via delete_record.
 * Every record is its own transaction, so a failure part-way leaves the ones already deleted consistent.
 */
export async function deleteRecords(
  records: { kind: RecordKind; id: string }[],
  undoBalance: boolean
): Promise<ActionResult> {
  if (!Array.isArray(records) || records.length > 500) return { error: "Too many records at once." };
  if (records.some((r) => !["loan", "card_use", "repayment"].includes(r.kind))) return { error: "Unknown record type." };
  const supabase = await writer();
  let deleted = 0;
  for (const r of records) {
    const { error } = await supabase.rpc("delete_record", { p_kind: r.kind, p_id: r.id, p_undo_balance: undoBalance });
    if (error) {
      revalidatePath("/", "layout");
      return { error: `${deleted} of ${records.length} records were deleted, then: ${friendly(error)}` };
    }
    deleted++;
  }
  return done(null);
}

// ---- dashboard preferences ----------------------------------------------------

/** Saves the Overview layout (section order and hidden sections) to the signed-in admin's user metadata. */
export async function saveDashboardLayout(layout: unknown): Promise<ActionResult> {
  const clean = normalizeLayout(layout);
  const supabase = await writer();
  const { error } = await supabase.auth.updateUser({ data: { dashboard_layout: clean } });
  if (error) return { error: error.message };
  revalidatePath("/account");
  return {};
}

/**
 * Reconciles the bank account or a card to a statement figure through reconcile_balance (migration 0011): the
 * recorded figure, the statement figure and the difference are stored as a permanent adjustment, and the balance is
 * set — in one transaction. Never a silent overwrite.
 */
export async function reconcileBalance(input: { target: "account" | "card"; id: string; statement: number; statementDate: string; note: string }): Promise<ActionResult> {
  if (input.target !== "account" && input.target !== "card") return { error: "Pick the bank account or a card." };
  const s = money(input.statement);
  if (!(s >= 0)) return { error: "Enter the statement figure (0 or more)." };
  const supabase = await writer();
  const { error } = await supabase.rpc("reconcile_balance", {
    p_target: input.target, p_id: input.id, p_statement: s, p_statement_date: orNull(input.statementDate), p_note: orNull(input.note),
  });
  if (error && (error.code === "PGRST202" || /could not find the function/i.test(error.message)))
    return { error: "Recording adjustments needs a database update. Run supabase/migrations/0011_audit_and_reconcile.sql in the Supabase SQL Editor, then try again." };
  return done(error);
}

/** Saves personal preferences (landing page, density, paisa, chart range) to user metadata. Never touches records. */
export async function savePrefs(prefs: unknown): Promise<ActionResult> {
  const clean = normalizePrefs(prefs);
  const supabase = await writer();
  const { error } = await supabase.auth.updateUser({ data: { prefs: clean } });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}

// ---- admin password ---------------------------------------------------------

export async function changePassword(current: string, next: string, confirm: string): Promise<ActionResult> {
  if (!current) return { error: "Enter your current password." };
  if (current.length > 256 || next.length > 256) return { error: "Passwords can be at most 256 characters." };
  if (passwordProblems(next).length) return { error: "The new password does not meet all four requirements." };
  if (next === current) return { error: "The new password must be different from the current one." };
  if (next !== confirm) return { error: "The two new passwords do not match." };

  const supabase = await writer();
  const { data: claims } = await supabase.auth.getClaims();
  const email = claims?.claims?.email as string | undefined;
  if (!email) return { error: "Your session has expired. Sign in again." };

  const check = await supabase.auth.signInWithPassword({ email, password: current });
  if (check.error) return { error: "Your current password is not correct." };

  const { error } = await supabase.auth.updateUser({
    password: next,
    data: { password_changed_at: new Date().toISOString() },
  });
  if (error) return { error: error.message };
  return {};
}

export async function sendPasswordReset(): Promise<ActionResult> {
  const supabase = await writer();
  const { data: claims } = await supabase.auth.getClaims();
  const email = claims?.claims?.email as string | undefined;
  if (!email) return { error: "Your session has expired. Sign in again." };
  const h = await headers();
  const origin = siteOrigin((n) => h.get(n));
  if (!origin) return { error: "Could not work out this site's address. Set SITE_URL and try again." };
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset`,
  });
  return error ? { error: error.message } : {};
}
