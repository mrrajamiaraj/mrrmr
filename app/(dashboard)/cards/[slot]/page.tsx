import { notFound } from "next/navigation";
import { loadFinance } from "@/lib/data";
import { todayIso } from "@/lib/format";
import { CARD_NAMES } from "@/lib/ledger";
import { CardView } from "./card-view";

export async function generateMetadata({ params }: { params: Promise<{ slot: string }> }) {
  const { slot } = await params;
  return { title: `${slot === "2" ? CARD_NAMES[2] : CARD_NAMES[1]} · Finance Workspace` };
}

export default async function CardPage({ params }: { params: Promise<{ slot: string }> }) {
  const { slot } = await params;
  if (slot !== "1" && slot !== "2") notFound();
  const data = await loadFinance();
  return <CardView data={data} slot={Number(slot) as 1 | 2} today={todayIso()} />;
}
