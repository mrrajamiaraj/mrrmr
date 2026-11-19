"use server";

import { revalidatePath } from "next/cache";
import { writer } from "@/lib/viewer";
import { cleanText } from "@/lib/security";
import { roundMoney } from "@/lib/money";
import { amountInRange, optionalDate } from "@/lib/validate";

export type Result = { error?: string };

function friendly(e: { code?: string; message: string }) {
  if (e.code === "42P01" || e.code === "PGRST205" || /could not find the table/i.test(e.message))
    return "The research tables are missing. Run supabase/migrations/0003_research_ledger.sql in the Supabase SQL Editor, then try again.";
  return e.message;
}

function done(error: { code?: string; message: string } | null): Result {
  if (error) return { error: friendly(error) };
  revalidatePath("/research");
  return {};
}

const amountOk = (n: number) => typeof n === "number" && amountInRange(roundMoney(n));
const dateOk = (s: string) => optionalDate(s).ok;
// Trimmed and capped server-side: these actions can be called without the form.
const clean = (s: string) => cleanText(s, 300);

export async function saveExpense(
  id: string | null,
  input: { spent_on: string; facility: string; member: string; description: string; tag: string; amount: number }
): Promise<Result> {
  if (!dateOk(input.spent_on)) return { error: "Enter a real date." };
  if (!clean(input.facility)) return { error: "Enter the facility / center." };
  if (!clean(input.member)) return { error: "Enter who paid." };
  if (!amountOk(input.amount)) return { error: "Enter an amount above 0." };
  const row = {
    spent_on: input.spent_on || undefined,
    facility: clean(input.facility),
    member: clean(input.member),
    description: clean(input.description) || `${clean(input.facility)} [${clean(input.member)}]`,
    tag: clean(input.tag) || null,
    amount: roundMoney(input.amount),
  };
  const supabase = await writer();
  const { error } = id
    ? await supabase.from("research_expenses").update(row).eq("id", id)
    : await supabase.from("research_expenses").insert(row);
  return done(error);
}

export async function deleteExpense(id: string): Promise<Result> {
  const supabase = await writer();
  const { error } = await supabase.from("research_expenses").delete().eq("id", id);
  return done(error);
}

export async function saveContribution(
  id: string | null,
  input: { paid_on: string; member: string; note: string; amount: number }
): Promise<Result> {
  if (!dateOk(input.paid_on)) return { error: "Enter a real date." };
  if (!clean(input.member)) return { error: "Enter who contributed." };
  if (!amountOk(input.amount)) return { error: "Enter an amount above 0." };
  const row = {
    paid_on: input.paid_on || undefined,
    member: clean(input.member),
    note: clean(input.note) || null,
    amount: roundMoney(input.amount),
  };
  const supabase = await writer();
  const { error } = id
    ? await supabase.from("research_contributions").update(row).eq("id", id)
    : await supabase.from("research_contributions").insert(row);
  return done(error);
}

export async function deleteContribution(id: string): Promise<Result> {
  const supabase = await writer();
  const { error } = await supabase.from("research_contributions").delete().eq("id", id);
  return done(error);
}
