import { loadFinance } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { AccountView } from "./account-view";

export const metadata = { title: "Bank Account · Finance Workspace" };

export default async function AccountPage() {
  const data = await loadFinance();
  return <AccountView data={data} today={todayIso()} />;
}
