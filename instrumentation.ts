/**
 * Next.js instrumentation hook — roda uma vez por runtime no boot.
 * Configura o adapter do @nexusai360/webhook-routing no singleton do pacote,
 * antes de qualquer handler de rota executar.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { configureWebhookRouting } = await import("@nexusai360/webhook-routing");
  const { webhookAdapter } = await import("@/lib/webhook/adapter");
  configureWebhookRouting(webhookAdapter);
}
