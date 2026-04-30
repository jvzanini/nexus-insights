"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { setMatrixIAEnabled } from "@/lib/actions/settings/matrix-ia";

interface MatrixIAToggleCardProps {
  initialEnabled: boolean;
}

export function MatrixIAToggleCard({ initialEnabled }: MatrixIAToggleCardProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<boolean>(initialEnabled);
  const [isPending, startTransition] = useTransition();

  function handleToggle(next: boolean) {
    // Update otimista — reverte se falhar.
    const previous = enabled;
    setEnabled(next);
    startTransition(async () => {
      const result = await setMatrixIAEnabled(next);
      if (!result.ok) {
        setEnabled(previous);
        toast.error(result.error || "Erro ao salvar");
        return;
      }
      toast.success(
        next
          ? "Matrix IA agora aparece nos relatórios"
          : "Matrix IA oculta para usuários não super admin",
      );
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
              Quando ativo, a inbox Matrix IA aparece nas tabelas, gráficos,
              KPIs e dropdowns de filtros para todos os usuários. Quando
              desativo, apenas super admins veem (a inbox some completamente
              para os demais).
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-border bg-background/40 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              Matrix IA visível para todos
            </p>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? "Todos os usuários veem as conversas da inbox Matrix IA."
                : "Apenas super admins veem as conversas da inbox Matrix IA."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isPending ? (
              <Loader2
                className="h-4 w-4 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            ) : null}
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={isPending}
              aria-label="Incluir Matrix IA nos relatórios"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
