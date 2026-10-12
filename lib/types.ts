export type Status = "Pending" | "Partially Paid" | "Repaid" | "Overdue";

export type Account = {
  id: string;
  name: string;
  holder_name: string | null;
  balance: number;
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
  due_on: string | null;
  created_at: string;
};

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
  status: Status;
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
export const CARD_CATEGORIES = ["Shopping", "Food", "Groceries", "Travel", "Transport", "Electronics", "Health", "Bills", "Subscription", "Other"] as const;
