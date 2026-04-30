"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { REPORTS_CATALOG, ALL_REPORT_KEYS } from "@/lib/reports/catalog";
import type { Visibility } from "@/lib/reports/visibility";
import { updateSetting } from "@/lib/actions/settings";
import { VisibilitySelect } from "./visibility-select";

interface EnabledReportsCardProps {
  initialVisibility: Record<string, Visibility>;
}

function buildInitial(
  initial: Record<string, Visibility>,
): Record<string, Visibility> {
  const out: Record<string, Visibility> = {};
  for (const key of ALL_REPORT_KEYS) {
    out[key] = initial[key] ?? "all";
  }
  return out;
}

export function EnabledReportsCard({
  initialVisibility,
}: EnabledReportsCardProps) {
  const router = useRouter();
  const initialMap = useMemo(() => buildInitial(initialVisibility), [
    initialVisibility,
  ]);
  const [visibility, setVisibility] = useState<Record<string, Visibility>>(
    () => ({ ...initialMap }),
  );
  const [isPending, startTransition] = useTransition();

  const dirty = ALL_REPORT_KEYS.some((k) => visibility[k] !== initialMap[k]);

  const counts = useMemo(() => {
    let all = 0;
    let superOnly = 0;
    let none = 0;
    for (const k of ALL_REPORT_KEYS) {
      const v = visibility[k];
      if (v === "all") all++;
      else if (v === "super_admin_only") superOnly++;
      else if (v === "none") none++;
    }
    return { all, superOnly, none };
  }, [visibility]);

  function handleChange(key: string, next: Visibility) {
    setVisibility((prev) => ({ ...prev, [key]: next }));
  }

  function handleSave() {
    const changed = ALL_REPORT_KEYS.filter(
      (k) => visibility[k] !== initialMap[k],
    );
    if (changed.length === 0) return;

    startTransition(async () => {
      const results = await Promise.all(
        changed.map((key) =>
          updateSetting({
            key: `reports.visibility.${key}`,
            value: visibility[key],
            category: "visibility",
          }),
        ),
      );
      const firstError = results.find((r) => !r.success);
      if (firstError) {
        toast.error(firstError.error || "Erro ao salvar");
        return;
      }
      toast.success("Configurações salvas");
      router.refresh();
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
              Defina quem enxerga cada relatório. Os ocultos não aparecem na
              sidebar do usuário.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {REPORTS_CATALOG.map((report) => {
            const Icon = report.icon;
            const current = visibility[report.key] ?? "all";
            const isOn = current === "all";
            return (
              <div
                key={report.key}
                className="flex flex-col gap-3 rounded-lg bg-muted/40 px-4 py-3 transition-colors hover:bg-muted/60 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
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
                </div>
                <VisibilitySelect
                  value={current}
                  onChange={(v) => handleChange(report.key, v)}
                  disabled={isPending}
                  className="w-full sm:w-[260px] shrink-0"
                  triggerClassName="min-h-[44px]"
                />
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{counts.all}</span>{" "}
              de {ALL_REPORT_KEYS.length} para todos
            </span>
            {counts.superOnly > 0 ? (
              <span>
                <span className="font-medium text-foreground">
                  {counts.superOnly}
                </span>{" "}
                somente super admin
              </span>
            ) : null}
            {counts.none > 0 ? (
              <span>
                <span className="font-medium text-foreground">
                  {counts.none}
                </span>{" "}
                ocultos
              </span>
            ) : null}
          </div>
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
