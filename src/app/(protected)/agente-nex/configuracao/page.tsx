import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { LlmConfigForm } from "@/components/agente-nex/llm-config-form";
import { getCurrentUser } from "@/lib/auth";
import { getPublicActiveLlmConfig } from "@/lib/llm/get-active-config";
import { listCredentials } from "@/lib/llm/credentials";
import { getUsdBrlRate, DEFAULT_CARD_SPREAD } from "@/lib/llm/exchange-rate";
import { isNexBubbleEnabled } from "@/lib/llm/get-nex-bubble-enabled";

export const metadata = { title: "Configuração — Agente Nex | Nexus Insights" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [llmConfig, nexBubbleEnabled, initialCredentials, currentRate] =
    await Promise.all([
      getPublicActiveLlmConfig(),
      isNexBubbleEnabled(),
      listCredentials().catch(() => []),
      getUsdBrlRate().catch(() => null),
    ]);
  const initialSpread = currentRate?.spread ?? DEFAULT_CARD_SPREAD;

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={Sparkles}
        title="Configuração do Agente Nex"
        subtitle="Provedor, modelo, chave em uso, cotação USD/BRL e spread cartão."
      />
      <Card className="rounded-2xl border border-border bg-muted/30 p-2">
        <CardContent>
          <LlmConfigForm
            initial={llmConfig}
            initialNexEnabled={nexBubbleEnabled}
            initialCredentials={initialCredentials}
            initialSpread={initialSpread}
            initialCommercialRate={currentRate?.commercial ?? null}
            initialRateSource={currentRate?.source ?? null}
            initialFetchedAt={
              currentRate?.fetchedAt ? currentRate.fetchedAt.toISOString() : null
            }
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
