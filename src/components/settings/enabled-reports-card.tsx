"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { REPORTS_CATALOG, ALL_REPORT_KEYS } from "@/lib/reports/catalog";
import { setEnabledReportKeys } from "@/lib/actions/enabled-reports";

interface EnabledReportsCardProps {
  initialEnabled: string[];
}

export function EnabledReportsCard({ initialEnabled }: EnabledReportsCardProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(initialEnabled),
  );
  const [isPending, startTransition] = useTransition();

  const initialSet = new Set(initialEnabled);
  const dirty =
    enabled.size !== initialSet.size ||
    ALL_REPORT_KEYS.some((k) => enabled.has(k) !== initialSet.has(k));

  function toggle(key: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleSave() {
    if (enabled.size === 0) {
      toast.error("Pelo menos 1 relatório deve estar habilitado");
      return;
    }
    startTransition(async () => {
      const result = await setEnabledReportKeys(Array.from(enabled));
      if (result.ok) {
        toast.success("Configurações salvas");
        router.refresh();
      } else {
        toast.error(result.error || "Erro ao salvar");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-2">
      <div className="rounded-xl bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <LayoutDashboard className="h-[18px] w-[18px] text-violet-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Relatórios disponíveis
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Ative ou desative relatórios. Os desativados não aparecem na
              sidebar.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-2 md:grid-cols-2">
          {REPORTS_CATALOG.map((report) => {
            const Icon = report.icon;
            const isOn = enabled.has(report.key);
            return (
              <label
                key={report.key}
                className="flex cursor-pointer items-center gap-3 rounded-lg bg-muted/40 px-4 py-3 transition-colors hover:bg-muted/60"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isOn ? "bg-violet-500/15" : "bg-muted/60"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 transition-colors ${
                      isOn ? "text-violet-500" : "text-muted-foreground"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {report.label}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {report.description}
                  </div>
                </div>
                <Switch
                  checked={isOn}
                  onCheckedChange={() => toggle(report.key)}
                  disabled={isPending}
                  className="shrink-0"
                  aria-label={`Habilitar relatório ${report.label}`}
                />
              </label>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {enabled.size} de {ALL_REPORT_KEYS.length} habilitados
          </span>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!dirty || isPending}
            className="min-h-[44px] cursor-pointer"
          >
            {isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            {isPending ? "Salvando..." : "Salvar configurações"}
          </Button>
        </div>
      </div>
    </div>
  );
}
