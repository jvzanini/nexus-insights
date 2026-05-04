"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Database, HeartPulse, Radio, Settings2 } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { TourTriggerButton } from "@/components/tour/tour-trigger-button";
import type { TourConfig } from "@/components/tour/tour-provider";
import { conexaoTour } from "@/components/tour/tours/bancos-de-dados/conexao";
import { sincronizacaoTour } from "@/components/tour/tours/bancos-de-dados/sincronizacao";
import { jobsTour } from "@/components/tour/tours/bancos-de-dados/jobs";
import { saudeTour } from "@/components/tour/tours/bancos-de-dados/saude";
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

/**
 * Tour exibido pelo botão "?" muda conforme a tab ativa — cada tab tem
 * seu próprio fluxo guiado, então não faz sentido um único tour global.
 */
const TOUR_BY_TAB: Record<TabKey, TourConfig> = {
  conexao: conexaoTour,
  sincronizacao: sincronizacaoTour,
  jobs: jobsTour,
  saude: saudeTour,
};

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
      <div className="flex items-center justify-between gap-2">
        <TabsList variant="line" className="overflow-x-auto">
          <TabsTrigger value="conexao">
            <span data-tour="aba-conexao" className="inline-flex items-center">
              <Database className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Conexão
            </span>
          </TabsTrigger>
          <TabsTrigger value="sincronizacao">
            <span
              data-tour="aba-sincronizacao"
              className="inline-flex items-center"
            >
              <Radio className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Sincronização
            </span>
          </TabsTrigger>
          <TabsTrigger value="jobs">
            <span data-tour="aba-jobs" className="inline-flex items-center">
              <Settings2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Jobs
            </span>
          </TabsTrigger>
          <TabsTrigger value="saude">
            <span data-tour="aba-saude" className="inline-flex items-center">
              <HeartPulse className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Saúde
            </span>
          </TabsTrigger>
        </TabsList>
        <TourTriggerButton config={TOUR_BY_TAB[activeTab]} />
      </div>

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
