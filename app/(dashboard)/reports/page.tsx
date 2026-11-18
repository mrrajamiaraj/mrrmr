import { loadFinance } from "@/lib/data";
import { loadResearch } from "@/lib/research-data";
import { todayIso } from "@/lib/format";
import { ReportsView } from "./reports-view";

export const metadata = { title: "Reports & Outlook" };

export default async function ReportsPage() {
  const [data, research] = await Promise.all([loadFinance(), loadResearch()]);
  return <ReportsView data={data} research={research} today={todayIso()} />;
}
