import { loadFinance } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { DebtorProfileView } from "./profile-view";

export const metadata = { title: "Person" };

/**
 * One person's full profile. Data is RLS-scoped (a viewer gets nothing) and the proxy keeps viewers out anyway.
 * An unknown or just-removed person renders a "not found" state from the view rather than a 404, so removing someone
 * from this page lands cleanly.
 */
export default async function DebtorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadFinance();
  return <DebtorProfileView data={data} personId={id} today={todayIso()} />;
}
