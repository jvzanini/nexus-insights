import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PromptConfigForm } from "@/components/agente-nex/prompt-config-form";
import { PromptPreviewCard } from "@/components/agente-nex/prompt-preview-card";
import { ResourcesToggles } from "@/components/agente-nex/resources-toggles";
import { KbSection } from "@/components/agente-nex/kb-section";
import { PlaygroundLauncher } from "@/components/agente-nex/playground-launcher";
import { getCurrentUser } from "@/lib/auth";
import { getNexPromptConfig } from "@/lib/nex/prompt";
import { getKbDocsForPrompt, listKbDocuments } from "@/lib/nex/kb";
import { getActiveLlmConfig } from "@/lib/llm/get-active-config";
import { isNexBubbleEnabled } from "@/lib/llm/get-nex-bubble-enabled";
import { listChatwootAccountUrlsAction } from "@/lib/actions/settings";
import { PROVIDER_LABELS } from "@/lib/llm/pricing";

export const metadata = { title: "Prompt — Agente Nex | Nexus Insights" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [cfg, kbDocs, kbForPrompt, llmActive, bubbleEnabled, accountUrlsResult] =
    await Promise.all([
      getNexPromptConfig(),
      listKbDocuments().catch(() => []),
      getKbDocsForPrompt().catch(() => []),
      getActiveLlmConfig().catch(() => null),
      isNexBubbleEnabled().catch(() => true),
      listChatwootAccountUrlsAction().catch(() => ({
        ok: false as const,
        data: undefined,
      })),
    ]);

  const providerAtual = llmActive?.provider ?? null;
  const providerLabel = providerAtual ? PROVIDER_LABELS[providerAtual] : undefined;
  const modelLabel = llmActive?.model ?? undefined;
  const accountUrls =
    accountUrlsResult.ok && accountUrlsResult.data
      ? accountUrlsResult.data.map((row) => ({
          accountId: row.accountId,
          publicUrl: row.publicUrl,
          label: row.label,
        }))
      : [];

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={BookOpen}
        title="Prompt do Agente Nex"
        subtitle="Configure personalidade, tom, regras e base de conhecimento."
        actions={
          <PlaygroundLauncher
            currentConfig={cfg}
            providerLabel={providerLabel}
            modelLabel={modelLabel}
          />
        }
      />
      <div className="space-y-6">
        {/* Card 1 (NOVO no topo): Preview do prompt completo. */}
        <PromptPreviewCard
          config={cfg}
          kbDocs={kbForPrompt}
          accountUrls={accountUrls}
        />

        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader>
            <CardTitle>Comportamento</CardTitle>
          </CardHeader>
          <CardContent>
            <PromptConfigForm initial={cfg} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader>
            <CardTitle>Recursos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResourcesToggles
              initial={cfg}
              providerAtual={providerAtual}
              bubbleEnabled={bubbleEnabled}
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader>
            <CardTitle>Base de conhecimento</CardTitle>
          </CardHeader>
          <CardContent>
            <KbSection initial={kbDocs} />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
