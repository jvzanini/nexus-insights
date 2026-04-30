"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { Visibility } from "@/lib/reports/visibility";
import { updateSetting } from "@/lib/actions/settings";
import { VisibilitySelect } from "./visibility-select";

interface MatrixIAToggleCardProps {
  initialVisibility: Visibility;
}

const HELPER_BY_VISIBILITY: Record<Visibility, string> = {
  all: "Todos os usuários veem as conversas da inbox Matrix IA.",
  super_admin_only:
    "Apenas super admins veem as conversas da inbox Matrix IA.",
  none:
    "A inbox Matrix IA fica oculta para todos os usuários, inclusive super admin.",
};

export function MatrixIAToggleCard({
  initialVisibility,
}: MatrixIAToggleCardProps) {
  const router = useRouter();
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: Visibility) {
    if (next === visibility) return;
    const previous = visibility;
    setVisibility(next);
    startTransition(async () => {
      const result = await updateSetting({
        key: "reports.matrix_ia_visibility",
        value: next,
        category: "visibility",
      });
      if (!result.success) {
        setVisibility(previous);
        toast.error(result.error || "Erro ao salvar");
        return;
      }
      toast.success("Visibilidade Matrix IA atualizada");
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-2">
      <div className="rounded-xl bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <Bot className="h-[18px] w-[18px] text-violet-500" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-foreground">
              Incluir Matrix IA nos relatórios
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Controle granular de quem enxerga a inbox Matrix IA nas tabelas,
              gráficos, KPIs e dropdowns de filtros.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Visibilidade da inbox Matrix IA
            </p>
            <p className="text-xs text-muted-foreground">
              {HELPER_BY_VISIBILITY[visibility]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isPending ? (
              <Loader2
                className="h-4 w-4 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            ) : null}
            <VisibilitySelect
              value={visibility}
              onChange={handleChange}
              disabled={isPending}
              className="w-full sm:w-[260px]"
              triggerClassName="min-h-[44px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
