import { loadResearch } from "@/lib/research-data";
import { ResearchView } from "./research-view";

export const metadata = { title: "Research Finance Ledger · Finance Workspace" };

export default async function ResearchPage() {
  const data = await loadResearch();
  return <ResearchView data={data} />;
}
