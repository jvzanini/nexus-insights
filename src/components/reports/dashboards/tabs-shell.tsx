"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export interface TabConfig {
  /** Valor canônico (sincronizado com ?tab=). */
  value: string;
  /** Rótulo exibido no trigger. */
  label: string;
  /** Conteúdo da aba (RSC ou client). */
  content: ReactNode;
}

interface TabsShellProps {
  /** Lista ordenada de tabs. A primeira é o default. */
  tabs: TabConfig[];
  /** Valor ativo (vindo do searchParam). */
  activeValue: string;
  /** Nome do search param na URL. Default: "tab". */
  paramKey?: string;
  className?: string;
}

/**
 * Shell de tabs reutilizável para os super-relatórios (B8).
 *
 * - Sincroniza valor com URL (?tab=...) via router.push, sem scroll.
 * - Usa shallow transition para preservar feedback responsivo.
 * - Quando a tab default (primeira) é selecionada, remove o param da URL
 *   para manter URLs limpas.
 * - aria-* delegado ao base-ui Tabs primitive.
 */
export function TabsShell({
  tabs,
  activeValue,
  paramKey = "tab",
  className,
}: TabsShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const defaultValue = tabs[0]?.value ?? "";
  const value = tabs.some((t) => t.value === activeValue)
    ? activeValue
    : defaultValue;

  const handleValueChange = (next: unknown) => {
    if (typeof next !== "string" || next === value) return;
    const sp = new URLSearchParams(searchParams.toString());
    if (next === defaultValue) {
      sp.delete(paramKey);
    } else {
      sp.set(paramKey, next);
    }
    const qs = sp.toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : "?", { scroll: false });
    });
  };

  return (
    <Tabs
      value={value}
      onValueChange={handleValueChange}
      className={className}
    >
      <TabsList variant="line" className="w-full justify-start gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent
          key={tab.value}
          value={tab.value}
          className="pt-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
