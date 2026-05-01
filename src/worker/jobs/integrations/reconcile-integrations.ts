import type { Job } from "bullmq";
import { reconcileIntegrations } from "@/lib/integrations/power-bi/reconcile";

export async function processReconcileIntegrations(
  _job: Job,
): Promise<unknown> {
  const result = await reconcileIntegrations();
  console.log("[worker.integrations.reconcile]", result);
  return result;
}
