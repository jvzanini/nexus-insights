"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Database, HeartPulse, Radio, Settings2 } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { BindingTableItem } from "./bindings-table";
import type { JobsStatusRow } from "@/lib/actions/jobs";

/**
 * Lazy-load das 4 tabs — code splitting reduz bundle inicial: Recharts (Aba
 * 2) só baixa quando user clicar em Sincronização. Cada chunk fica em ~50KB
 * gzip vs 200KB monolítico.
 */
const ConexaoTab = dynamic(
  () => import("./tabs/conexao-tab").then((m) => m.ConexaoTab),
  { loading: () => <TabSkeleton />, ssr: false },
);
const SincronizacaoTab = dynamic(
  () => import("./tabs/sincronizacao-tab").then((m) => m.SincronizacaoTab),
  { loading: () => <TabSkeleton />, ssr: false },
);
const JobsTab = dynamic(
  () => import("./tabs/jobs-tab").then((m) => m.JobsTab),
  { loading: () => <TabSkeleton />, ssr: false },
);
const SaudeTab = dynamic(
  () => import("./tabs/saude-tab").then((m) => m.SaudeTab),
  { loading: () => <TabSkeleton />, ssr: false },
);

export interface ConnectionDetailData {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  sslMode: string;
  applicationName: string;
  status: string;
  lastTestAt: string | null;
  lastTestError: string | null;
  /**
   * Timestamp do último polling delta executado com sucesso (ISO 8601).
   * Substitui `lastWebhookAt` (v0.41 — webhook removido).
   */
  lastSyncAt: string | null;
  /**
   * Intervalo em segundos entre cada polling delta nesta conexão.
   * Default schema = 30s, mínimo permitido = 20s.
   */
  pollingIntervalSeconds: number;
  createdAt: string;
}

type TabKey = "conexao" | "sincronizacao" | "jobs" | "saude";

const TAB_KEYS: TabKey[] = ["conexao", "sincronizacao", "jobs", "saude"];

interface Props {
  connection: ConnectionDetailData;
  bindings: BindingTableItem[];
  defaultTab?: TabKey;
  /**
   * Snapshot SSR de `getJobsStatus({ connectionId })` — usado pra hidratar
   * `<JobsTab>` sem fetch initial no client. Polling 5s permanece.
   */
  initialJobsStatus?: { rows: JobsStatusRow[] } | null;
}

function isValidTab(value: string | null): value is TabKey {
  return value !== null && TAB_KEYS.includes(value as TabKey);
}

export function ConnectionDetailTabs({
  connection,
  bindings,
  defaultTab = "conexao",
  initialJobsStatus,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const activeTab: TabKey = isValidTab(tabFromUrl) ? tabFromUrl : defaultTab;

  const handleTabChange = useCallback(
    (next: string | number | null) => {
      const value = String(next);
      if (!isValidTab(value)) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", value);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      orientation="horizontal"
      className="w-full"
    >
      <TabsList variant="line" className="overflow-x-auto">
        <TabsTrigger value="conexao">
          <Database className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Conexão
        </TabsTrigger>
        <TabsTrigger value="sincronizacao">
          <Radio className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Sincronização
        </TabsTrigger>
        <TabsTrigger value="jobs">
          <Settings2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Jobs
        </TabsTrigger>
        <TabsTrigger value="saude">
          <HeartPulse className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Saúde
        </TabsTrigger>
      </TabsList>

      <TabsContent value="conexao" className="mt-4">
        <ConexaoTab connection={connection} bindings={bindings} />
      </TabsContent>
      <TabsContent value="sincronizacao" className="mt-4">
        <SincronizacaoTab
          connectionId={connection.id}
          lastSyncAt={connection.lastSyncAt}
          pollingIntervalSeconds={connection.pollingIntervalSeconds}
        />
      </TabsContent>
      <TabsContent value="jobs" className="mt-4">
        <JobsTab
          connectionId={connection.id}
          initialStatus={initialJobsStatus ?? null}
        />
      </TabsContent>
      <TabsContent value="saude" className="mt-4">
        <SaudeTab connectionId={connection.id} />
      </TabsContent>
    </Tabs>
  );
}

function TabSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
