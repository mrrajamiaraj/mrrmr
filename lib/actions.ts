"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { writer } from "@/lib/viewer";
import { passwordProblems } from "@/lib/password";
import { cleanText, siteOrigin } from "@/lib/security";
import { EMI_MONTHS, type PayPlan } from "@/lib/types";

export type ActionResult = { error?: string; personId?: string | null };

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

function money(n: unknown) {
  const v = Math.round(Number(n) * 100) / 100;
  return Number.isFinite(v) ? v : NaN;
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
}): Promise<ActionResult> {
  const amount = money(input.amount);
  if (!(amount > 0)) return { error: "Enter an amount above 0." };
  if (input.appliesTo === "card" && !input.cardId) return { error: "Pick which card this repayment is for." };

  const supabase = await writer();
  const { data: s } = await supabase.from("debtor_summary").select("still_owes").eq("person_id", input.personId).maybeSingle();
  if (s && amount > Number(s.still_owes)) return { error: `They only owe ৳${Number(s.still_owes).toLocaleString("en-IN")}.` };

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
