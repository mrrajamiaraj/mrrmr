import { loadFinance } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { DebtorsView, type Filter } from "./debtors-view";

export const metadata = { title: "People" };

const FILTERS: Filter[] = ["all", "owing", "overdue", "soon", "repaid"];

/** ?show=owing|overdue|soon|repaid opens the list already filtered (the Overview's figures link here). */
export default async function DebtorsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const [{ show }, data] = await Promise.all([searchParams, loadFinance()]);
  const initial = FILTERS.includes(show as Filter) ? (show as Filter) : "all";
  return <DebtorsView data={data} today={todayIso()} initialFilter={initial} />;
}
