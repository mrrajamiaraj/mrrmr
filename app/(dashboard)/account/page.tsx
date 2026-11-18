import { loadFinance } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { normalizeLayout } from "@/lib/dashboard-layout";
import { AccountView } from "./account-view";

export const metadata = { title: "Overview" };

/** Hour of day in Bangladesh, for the greeting (computed on the server so it never differs from the render). */
function dhakaHour() {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Dhaka" }).format(new Date()));
}

export default async function AccountPage() {
  const supabase = await createClient();
  const [data, { data: auth }] = await Promise.all([loadFinance(), supabase.auth.getUser()]);
  const layout = normalizeLayout(auth.user?.user_metadata?.dashboard_layout);
  return <AccountView data={data} today={todayIso()} hour={dhakaHour()} layout={layout} />;
}
