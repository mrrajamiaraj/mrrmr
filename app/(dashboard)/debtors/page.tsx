import { loadFinance } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { DebtorsView } from "./debtors-view";

export const metadata = { title: "Debtors & Loans · Finance Workspace" };

export default async function DebtorsPage() {
  const data = await loadFinance();
  return <DebtorsView data={data} today={todayIso()} />;
}
