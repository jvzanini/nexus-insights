import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { LlmCredentialsManager } from "@/components/settings/llm-credentials-manager";
import { getCurrentUser } from "@/lib/auth";
import { listCredentials } from "@/lib/llm/credentials";
import { getPublicActiveLlmConfig } from "@/lib/llm/get-active-config";

export const metadata = { title: "Chaves de API — Agente Nex" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [credentials, llmConfig] = await Promise.all([
    listCredentials().catch(() => []),
    getPublicActiveLlmConfig(),
  ]);

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={KeyRound}
        title="Chaves de API"
        subtitle="Gerencie as chaves por provedor."
      />
      <Card className="rounded-2xl border border-border bg-muted/30 p-2">
        <CardContent>
          <LlmCredentialsManager
            initial={credentials}
            activeCredentialId={llmConfig?.credentialId ?? null}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
