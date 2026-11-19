import { loadFinance } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { AccountView } from "./account-view";

export const metadata = { title: "Overview" };

/** Hour of day in Bangladesh, for the greeting (computed on the server so it never differs from the render). */
function dhakaHour() {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Dhaka" }).format(new Date()));
}

export default async function AccountPage() {
  const data = await loadFinance();
  return <AccountView data={data} today={todayIso()} hour={dhakaHour()} />;
}
