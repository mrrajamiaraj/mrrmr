import { notFound } from "next/navigation";
import { loadFinance } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { DebtorProfileView } from "./profile-view";

export const metadata = { title: "Debtor" };

/** One debtor's full profile. Data is RLS-scoped (a viewer gets nothing) and the proxy keeps viewers out anyway. */
export default async function DebtorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadFinance();
  if (!data.people.some((p) => p.id === id)) notFound();
  return <DebtorProfileView data={data} personId={id} today={todayIso()} />;
}
