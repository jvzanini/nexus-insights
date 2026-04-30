"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CustomSelect, type SelectOption } from "@/components/ui/custom-select";
import { saveDashboardSettings } from "@/lib/actions/settings";

interface DashboardSettingsCardProps {
  initial: {
    weekStartsOn: number;
    weekMode: "current" | "rolling";
    monthMode: "current" | "rolling";
  };
}

const WEEK_DAYS: SelectOption[] = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
];

const WEEK_MODE_OPTIONS: SelectOption[] = [
  {
    value: "current",
    label: "Semana atual",
    description: "Do dia configurado até hoje",
  },
  {
    value: "rolling",
    label: "Últimos 7 dias",
    description: "Janela móvel (rolling)",
  },
];

const MONTH_MODE_OPTIONS: SelectOption[] = [
  {
    value: "current",
    label: "Mês atual",
    description: "Do dia 1 até hoje",
  },
  {
    value: "rolling",
    label: "Últimos 30 dias",
    description: "Janela móvel (rolling)",
  },
];

export function DashboardSettingsCard({
  initial,
}: DashboardSettingsCardProps) {
  const router = useRouter();
  const [weekStartsOn, setWeekStartsOn] = useState<string>(
    String(initial.weekStartsOn),
  );
  const [weekMode, setWeekMode] = useState<"current" | "rolling">(
    initial.weekMode,
  );
  const [monthMode, setMonthMode] = useState<"current" | "rolling">(
    initial.monthMode,
  );
  const [isPending, startTransition] = useTransition();

  const dirty =
    weekStartsOn !== String(initial.weekStartsOn) ||
    weekMode !== initial.weekMode ||
    monthMode !== initial.monthMode;

  function handleSave() {
    if (isPending || !dirty) return;
    startTransition(async () => {
      const res = await saveDashboardSettings({
        weekStartsOn: parseInt(weekStartsOn, 10),
        weekMode,
        monthMode,
      });
      if (res.success) {
        toast.success("Configurações do dashboard salvas");
        router.refresh();
      } else {
        toast.error(res.error ?? "Falha ao salvar");
      }
    });
  }

  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <CalendarDays className="h-4 w-4 text-violet-500" />
          Dashboard
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Define como os filtros de Semana e Mês do dashboard são calculados.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="dashboard-week-starts-on">
                Início da semana
              </Label>
              <CustomSelect
                value={weekStartsOn}
                onChange={setWeekStartsOn}
                options={WEEK_DAYS}
                placeholder="Selecionar dia"
                disabled={isPending}
                triggerClassName="min-h-[44px]"
              />
              <p className="text-xs text-muted-foreground">
                Primeiro dia considerado pela semana atual.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dashboard-week-mode">Modo da semana</Label>
              <CustomSelect
                value={weekMode}
                onChange={(v) => setWeekMode(v as "current" | "rolling")}
                options={WEEK_MODE_OPTIONS}
                placeholder="Selecionar modo"
                disabled={isPending}
                triggerClassName="min-h-[44px]"
              />
              <p className="text-xs text-muted-foreground">
                Como o filtro Semana calcula a janela de datas.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dashboard-month-mode">Modo do mês</Label>
              <CustomSelect
                value={monthMode}
                onChange={(v) => setMonthMode(v as "current" | "rolling")}
                options={MONTH_MODE_OPTIONS}
                placeholder="Selecionar modo"
                disabled={isPending}
                triggerClassName="min-h-[44px]"
              />
              <p className="text-xs text-muted-foreground">
                Como o filtro Mês calcula a janela de datas.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
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
              Salvar configurações
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
