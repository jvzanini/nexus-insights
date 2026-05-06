"use client";

import { useState, useTransition } from "react";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateSetting } from "@/lib/actions/settings";

interface PollingSettingsFormProps {
  initial: {
    liveSeconds: number;
    refreshButtonEnabled: boolean;
  };
}

const LIVE_MIN = 5;
const LIVE_MAX = 300;

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function PollingSettingsForm({ initial }: PollingSettingsFormProps) {
  const [liveSeconds, setLiveSeconds] = useState<number>(initial.liveSeconds);
  const [refreshButtonEnabled, setRefreshButtonEnabled] = useState<boolean>(
    initial.refreshButtonEnabled,
  );
  const [isPending, start] = useTransition();

  function handleSave() {
    const live = clamp(liveSeconds, LIVE_MIN, LIVE_MAX);

    setLiveSeconds(live);

    start(async () => {
      const updates = [
        updateSetting({
          key: "polling.live_seconds",
          value: live,
          category: "polling",
        }),
        updateSetting({
          key: "polling.refresh_button_enabled",
          value: refreshButtonEnabled,
          category: "polling",
        }),
      ];

      const results = await Promise.all(updates);
      const failed = results.find((r) => !r.success);

      if (failed) {
        toast.error(failed.error || "Erro ao salvar configurações");
      } else {
        toast.success("Configurações de atualização salvas");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="polling-live">Intervalo de atualização automática (segundos)</Label>
          <Input
            id="polling-live"
            type="number"
            min={LIVE_MIN}
            max={LIVE_MAX}
            value={liveSeconds}
            onChange={(e) => setLiveSeconds(parseInt(e.target.value, 10) || 0)}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            O dashboard recarrega os dados automaticamente a cada N segundos. Mínimo {LIVE_MIN}s, máximo {LIVE_MAX}s.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/40 p-3.5">
          <div>
            <p className="text-sm font-medium text-foreground">
              Botão &ldquo;Atualizar agora&rdquo;
            </p>
            <p className="text-xs text-muted-foreground">
              Exibe um botão no dashboard para forçar a atualização imediata dos dados.
            </p>
          </div>
          <Switch
            checked={refreshButtonEnabled}
            onCheckedChange={setRefreshButtonEnabled}
            disabled={isPending}
          />
        </div>
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
