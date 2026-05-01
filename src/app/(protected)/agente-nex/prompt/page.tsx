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
import { ResourcesToggles } from "@/components/agente-nex/resources-toggles";
import { KbSection } from "@/components/agente-nex/kb-section";
import { Playground } from "@/components/agente-nex/playground";
import { getCurrentUser } from "@/lib/auth";
import { getNexPromptConfig } from "@/lib/nex/prompt";
import { listKbDocuments } from "@/lib/nex/kb";
import { getActiveLlmConfig } from "@/lib/llm/get-active-config";
import { isNexBubbleEnabled } from "@/lib/llm/get-nex-bubble-enabled";

export const metadata = { title: "Prompt — Agente Nex | Nexus Insights" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [cfg, kbDocs, llmActive, bubbleEnabled] = await Promise.all([
    getNexPromptConfig(),
    listKbDocuments().catch(() => []),
    getActiveLlmConfig().catch(() => null),
    isNexBubbleEnabled().catch(() => true),
  ]);

  const providerAtual = llmActive?.provider ?? null;

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={BookOpen}
        title="Prompt do Agente Nex"
        subtitle="Configure personalidade, tom, regras e base de conhecimento."
      />
      <div className="space-y-6">
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

        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader>
            <CardTitle>Playground</CardTitle>
          </CardHeader>
          <CardContent>
            <Playground currentConfig={cfg} />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
