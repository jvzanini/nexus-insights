"use client";

import { useState, useTransition } from "react";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { updateSetting } from "@/lib/actions/settings";

interface VisibilitySettingsFormProps {
  initial: {
    matrixIaVisibleToSuperAdminOnly: boolean;
    excludeMatrixIaGlobally: boolean;
    csatEnabled: boolean;
    slaEnabled: boolean;
  };
}

export function VisibilitySettingsForm({ initial }: VisibilitySettingsFormProps) {
  const [matrixIaVisibleToSuperAdminOnly, setMatrixIaVisibleToSuperAdminOnly] =
    useState<boolean>(initial.matrixIaVisibleToSuperAdminOnly);
  const [excludeMatrixIaGlobally, setExcludeMatrixIaGlobally] = useState<boolean>(
    initial.excludeMatrixIaGlobally,
  );
  const [csatEnabled, setCsatEnabled] = useState<boolean>(initial.csatEnabled);
  const [slaEnabled, setSlaEnabled] = useState<boolean>(initial.slaEnabled);
  const [isPending, start] = useTransition();

  function handleSave() {
    start(async () => {
      const updates = [
        updateSetting({
          key: "feature_flags.matrix_ia_visible_to_super_admin_only",
          value: matrixIaVisibleToSuperAdminOnly,
          category: "visibility",
        }),
        updateSetting({
          key: "feature_flags.exclude_matrix_ia_globally",
          value: excludeMatrixIaGlobally,
          category: "visibility",
        }),
        updateSetting({
          key: "feature_flags.csat_enabled",
          value: csatEnabled,
          category: "modules",
        }),
        updateSetting({
          key: "feature_flags.sla_enabled",
          value: slaEnabled,
          category: "modules",
        }),
      ];

      const results = await Promise.all(updates);
      const failed = results.find((r) => !r.success);

      if (failed) {
        toast.error(failed.error || "Erro ao salvar configurações");
      } else {
        toast.success("Configurações de visibilidade salvas");
      }
    });
  }

  const switches: Array<{
    key: string;
    title: string;
    description: string;
    checked: boolean;
    onCheckedChange: (v: boolean) => void;
  }> = [
    {
      key: "matrix-ia-restrict",
      title: "Matrix IA visível somente para super admin",
      description:
        "Esconde o relatório do inbox Matrix IA para usuários que não são super admin.",
      checked: matrixIaVisibleToSuperAdminOnly,
      onCheckedChange: setMatrixIaVisibleToSuperAdminOnly,
    },
    {
      key: "matrix-ia-exclude",
      title: "Excluir Matrix IA das métricas globais",
      description:
        "Remove conversas do inbox Matrix IA dos cálculos agregados nos demais relatórios.",
      checked: excludeMatrixIaGlobally,
      onCheckedChange: setExcludeMatrixIaGlobally,
    },
    {
      key: "csat",
      title: "Relatório de CSAT",
      description: "Exibir módulo de CSAT no menu (placeholder se não houver dados).",
      checked: csatEnabled,
      onCheckedChange: setCsatEnabled,
    },
    {
      key: "sla",
      title: "Relatório de SLA",
      description: "Exibir módulo de SLA no menu (placeholder se não houver dados).",
      checked: slaEnabled,
      onCheckedChange: setSlaEnabled,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {switches.map((s) => (
          <div
            key={s.key}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/40 p-3.5"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{s.title}</p>
              <p className="text-xs text-muted-foreground">{s.description}</p>
            </div>
            <Switch
              checked={s.checked}
              onCheckedChange={s.onCheckedChange}
              disabled={isPending}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending} className="cursor-pointer">
          {isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Salvar
        </Button>
      </div>
    </div>
  );
}
