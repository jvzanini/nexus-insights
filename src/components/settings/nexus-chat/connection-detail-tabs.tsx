"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Database, HeartPulse, Radio, Settings2 } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { BindingTableItem } from "./bindings-table";

/**
 * Lazy-load das 4 tabs — code splitting reduz bundle inicial: Recharts (Aba
 * 2) só baixa quando user clicar em Tempo real. Cada chunk fica em ~50KB
 * gzip vs 200KB monolítico.
 */
const ConexaoTab = dynamic(
  () => import("./tabs/conexao-tab").then((m) => m.ConexaoTab),
  { loading: () => <TabSkeleton />, ssr: false },
);
const TempoRealTab = dynamic(
  () => import("./tabs/tempo-real-tab").then((m) => m.TempoRealTab),
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
  lastWebhookAt: string | null;
  webhookToken: string | null;
  createdAt: string;
}

type TabKey = "conexao" | "tempo-real" | "jobs" | "saude";

const TAB_KEYS: TabKey[] = ["conexao", "tempo-real", "jobs", "saude"];

interface Props {
  connection: ConnectionDetailData;
  bindings: BindingTableItem[];
  defaultTab?: TabKey;
}

function isValidTab(value: string | null): value is TabKey {
  return value !== null && TAB_KEYS.includes(value as TabKey);
}

export function ConnectionDetailTabs({
  connection,
  bindings,
  defaultTab = "conexao",
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
        <TabsTrigger value="tempo-real">
          <Radio className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Tempo real
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
      <TabsContent value="tempo-real" className="mt-4">
        <TempoRealTab
          connectionId={connection.id}
          lastWebhookAt={connection.lastWebhookAt}
        />
      </TabsContent>
      <TabsContent value="jobs" className="mt-4">
        <JobsTab connectionId={connection.id} />
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
