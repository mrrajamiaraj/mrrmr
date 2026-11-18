import { loadFinance } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { RepaymentsView } from "./repayments-view";

export const metadata = { title: "Repayment Center" };

export default async function RepaymentsPage() {
  return <RepaymentsView data={await loadFinance()} today={todayIso()} />;
}
