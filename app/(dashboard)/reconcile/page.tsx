import { loadFinance } from "@/lib/data";
import { loadAudit } from "@/lib/audit-data";
import { todayIso } from "@/lib/format";
import { ReconcileView } from "./reconcile-view";

export const metadata = { title: "Reconcile & Audit" };

export default async function ReconcilePage() {
  const [data, audit] = await Promise.all([loadFinance(), loadAudit()]);
  return <ReconcileView data={data} audit={audit} today={todayIso()} />;
}
