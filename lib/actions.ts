"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { passwordProblems } from "@/lib/password";

export type ActionResult = { error?: string; personId?: string | null };

type DbError = { message: string; code?: string } | null;

function friendly(error: NonNullable<DbError>): string {
  const m = error.message;
  if ((error.code === "PGRST202" || /could not find the function/i.test(m)) && /delete_record/.test(m))
    return "Deleting needs one more database function. Run supabase/migrations/0004_delete_records.sql in the Supabase SQL Editor, then try again.";
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

const orNull = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

// ---- balances ---------------------------------------------------------------

export async function setAccountBalance(accountId: string, balance: number): Promise<ActionResult> {
  const b = money(balance);
  if (!(b >= 0)) return { error: "Enter a balance of 0 or more." };
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").update({ balance: b }).eq("id", accountId);
  return done(error);
}

export async function setCardBalance(cardId: string, balance: number): Promise<ActionResult> {
  const b = money(balance);
  if (!(b >= 0)) return { error: "Enter a balance of 0 or more." };
  const supabase = await createClient();
  const { error } = await supabase.from("cards").update({ balance: b }).eq("id", cardId);
  return done(error);
}

// ---- first-run setup --------------------------------------------------------

export async function createAccount(input: { name: string; holder_name: string; balance: number }): Promise<ActionResult> {
  if (!input.name.trim()) return { error: "Enter the account name." };
  const b = money(input.balance);
  if (!(b >= 0)) return { error: "Enter a balance of 0 or more." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .insert({ name: input.name.trim(), holder_name: orNull(input.holder_name), balance: b });
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
  if (!input.bank.trim() || !input.name.trim()) return { error: "Enter the bank and card name." };
  if (input.last4 && !/^\d{4}$/.test(input.last4)) return { error: "Last 4 digits must be 4 numbers." };
  const b = money(input.balance);
  if (!(b >= 0)) return { error: "Enter a balance of 0 or more." };
  const supabase = await createClient();
  const { error } = await supabase.from("cards").insert({
    slot: input.slot,
    bank: input.bank.trim(),
    name: input.name.trim(),
    network: orNull(input.network),
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
  const supabase = await createClient();
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
  if (!input.name.trim()) return { error: "Enter who took the money." };
  if (!(amount > 0)) return { error: "Enter an amount above 0." };
  if (!input.reason.trim()) return { error: "Enter why they took it." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_loan", {
    p_person_name: input.name.trim(),
    p_amount: amount,
    p_reason: input.reason.trim(),
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
}): Promise<ActionResult> {
  const amount = money(input.amount);
  if (!input.name.trim()) return { error: "Enter who used the card (or “Me” for your own spending)." };
  if (!(amount > 0)) return { error: "Enter an amount above 0." };
  if (!input.reason.trim()) return { error: "Enter why or where it was used." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_card_use", {
    p_card_id: input.cardId,
    p_person_name: input.name.trim(),
    p_amount: amount,
    p_reason_or_place: input.reason.trim(),
    p_used_on: orNull(input.usedOn),
    p_category: input.category,
    p_due_on: orNull(input.dueOn),
    p_add_to_balance: input.addToBalance,
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

  const supabase = await createClient();
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
  if (!input.name.trim()) return { error: "Enter a name." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ name: input.name.trim(), relation: orNull(input.relation), phone: orNull(input.phone), notes: orNull(input.notes) })
    .eq("id", personId);
  return done(error, { personId });
}

/** Only succeeds for people with no records: the foreign keys are ON DELETE RESTRICT. */
export async function deletePerson(personId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("people").delete().eq("id", personId);
  return done(error);
}

export type RecordKind = "loan" | "card_use" | "repayment";

/** Permanently deletes one loan, card use or repayment; optionally undoes its balance change in the same transaction. */
export async function deleteRecord(kind: RecordKind, id: string, undoBalance: boolean): Promise<ActionResult> {
  if (!["loan", "card_use", "repayment"].includes(kind)) return { error: "Unknown record type." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_record", { p_kind: kind, p_id: id, p_undo_balance: undoBalance });
  return done(error);
}

// ---- admin password ---------------------------------------------------------

export async function changePassword(current: string, next: string, confirm: string): Promise<ActionResult> {
  if (!current) return { error: "Enter your current password." };
  if (passwordProblems(next).length) return { error: "The new password does not meet all four requirements." };
  if (next === current) return { error: "The new password must be different from the current one." };
  if (next !== confirm) return { error: "The two new passwords do not match." };

  const supabase = await createClient();
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
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const email = claims?.claims?.email as string | undefined;
  if (!email) return { error: "Your session has expired. Sign in again." };
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset`,
  });
  return error ? { error: error.message } : {};
}
