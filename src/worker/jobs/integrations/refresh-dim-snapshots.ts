import type { Job } from "bullmq";
import { refreshAllDimSnapshots } from "@/lib/integrations/power-bi/dim-sync";

export async function processRefreshDimSnapshots(_job: Job): Promise<unknown> {
  const results = await refreshAllDimSnapshots();
  console.log("[worker.integrations.refresh-dim]", results);
  return { results, completedAt: new Date().toISOString() };
}
