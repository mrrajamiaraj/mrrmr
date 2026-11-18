export type Status = "Pending" | "Partially Paid" | "Repaid";

export type Account = {
  id: string;
  name: string;
  holder_name: string | null;
  balance: number;
  debit_used: number;
  updated_at: string;
};

export type Card = {
  id: string;
  slot: 1 | 2;
  bank: string;
  name: string;
  network: string | null;
  last4: string | null;
  credit_limit: number | null;
  balance: number;
  pay_by: string | null;
  updated_at: string;
};

export type Person = {
  id: string;
  name: string;
  relation: string | null;
  phone: string | null;
  notes: string | null;
};

export type Loan = {
  id: string;
  person_id: string;
  account_id: string | null;
  amount: number;
  taken_on: string;
  reason: string;
  method: string;
  due_on: string | null;
  created_at: string;
};

export type CardUse = {
  id: string;
  card_id: string;
  person_id: string | null;
  amount: number;
  used_on: string;
  reason_or_place: string;
  category: string;
  /** Full payment: pay back by this date. EMI: the first installment date. */
  due_on: string | null;
  /** Missing until migration 0008 runs; treat as "full". */
  pay_plan?: PayPlan;
  emi_months?: number | null;
  /** EMI interest / fees from the card statement, owed by the buyer on top of `amount`. Missing until 0010 → 0. */
  emi_charges?: number;
  /** Links the shares of one split purchase. Missing until 0010. */
  purchase_group?: string | null;
  created_at: string;
};

export type PayPlan = "full" | "emi";

export type Repayment = {
  id: string;
  person_id: string;
  amount: number;
  paid_on: string;
  via: string;
  applies_to: "loan" | "card";
  card_id: string | null;
  account_id: string | null;
  created_at: string;
};

export type DebtorSummary = {
  person_id: string;
  name: string;
  relation: string | null;
  loaned: number;
  loan_count: number;
  card_used: number;
  card_use_count: number;
  repaid: number;
  repaid_loan: number;
  repaid_card: number;
  repayment_count: number;
  last_paid_on: string | null;
  still_owes: number;
  next_due: string | null;
  /** The view can still return 'Overdue'; the app shows those people as Pending / Partially Paid. */
  status: Status | "Overdue";
};

export type FinanceData = {
  accounts: Account[];
  cards: Card[];
  people: Person[];
  loans: Loan[];
  cardUses: CardUse[];
  repayments: Repayment[];
  summary: DebtorSummary[];
};

export const LOAN_METHODS = ["Bank transfer", "Cash withdrawal", "Cheque", "bKash from bank"] as const;
export const REPAY_VIA = ["Bank transfer", "Cash", "bKash", "Nagad"] as const;
export const EMI_MONTHS = [3, 6, 9, 12, 18, 24, 36] as const;
export const CARD_CATEGORIES = ["Shopping", "Food", "Groceries", "Travel", "Transport", "Electronics", "Health", "Bills", "Subscription", "Other"] as const;
