import { loadFinance } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { OverviewView } from "./overview-view";

export default async function OverviewPage() {
  const data = await loadFinance();
  return <OverviewView data={data} today={todayIso()} />;
}
