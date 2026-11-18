// Financial outlook: CONFIRMED obligations vs UNCERTAIN expected collections, over a horizon, with scenarios.
// Projections only — never balances. Pure; tested in tests/forecast.test.mjs.
//
//  • Confirmed obligation: a card balance with a pay-by date inside the horizon (statement minimums aren't tracked,
//    so the full balance is used). Past pay-by dates are listed as "date passed".
//  • Expected collection: an unpaid receivable item (lib/dashboard open items) due inside the horizon. Uncertain by
//    nature. Overdue items are listed separately: they were already expected and haven't come.
//  • Bank-loan collections go to the bank; card collections go toward that card's balance (they never become cash).
import { addDays } from "./format.ts";
import { subMoney, sumBy } from "./money.ts";
import type { Dashboard, OpenItem } from "./dashboard.ts";

export type Scenario = { id: "none" | "onTime" | "delayed"; label: string; cash: number; cardOwed: number; note: string };

export type Forecast = {
  until: string;
  obligations: { cardId: string; label: string; iso: string; amount: number; passed: boolean }[];
  obligationsTotal: number;
  expected: OpenItem[];
  expectedLoans: number;
  expectedCards: number;
  overdue: OpenItem[];
  scenarios: Scenario[];
};

export function forecast(d: Dashboard, days: number, delayed: Set<string>, today = d.today): Forecast {
  const until = addDays(today, days);
  const obligations = d.obligations.filter((o) => o.iso <= until);
  const expected = d.open.filter((o) => o.iso && o.iso >= today && o.iso <= until);
  const overdue = d.open.filter((o) => o.status === "overdue");
  const sum = (xs: OpenItem[], src: OpenItem["source"]) => sumBy(xs.filter((o) => o.source === src), (o) => o.left);
  const kept = expected.filter((o) => !delayed.has(o.personId));
  const cash = d.bank?.balance ?? 0;
  const owed = d.liabilities.cards;
  const scen = (id: Scenario["id"], label: string, xs: OpenItem[], note: string): Scenario => ({
    id, label, note,
    cash: sumBy([cash, sum(xs, "loan")], (x) => x),
    cardOwed: Math.max(subMoney(owed, sum(xs, "card")), 0),
  });
  return {
    until, obligations, obligationsTotal: sumBy(obligations, (o) => o.amount), expected,
    expectedLoans: sum(expected, "loan"), expectedCards: sum(expected, "card"), overdue,
    scenarios: [
      scen("none", "No collections", [], "Nobody pays anything in this period."),
      scen("onTime", "All on time", expected, "Every scheduled repayment arrives on its due date."),
      scen("delayed", "With delays", kept, delayed.size ? `${delayed.size} ${delayed.size === 1 ? "person" : "people"} pay after this period.` : "Pick people below to delay them."),
    ],
  };
}
