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
    historicalSeconds: number;
    refreshButtonEnabled: boolean;
    sseEnabled: boolean;
  };
}

const LIVE_MIN = 5;
const LIVE_MAX = 300;
const HISTORICAL_MIN = 30;
const HISTORICAL_MAX = 3600;

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function PollingSettingsForm({ initial }: PollingSettingsFormProps) {
  const [liveSeconds, setLiveSeconds] = useState<number>(initial.liveSeconds);
  const [historicalSeconds, setHistoricalSeconds] = useState<number>(
    initial.historicalSeconds,
  );
  const [refreshButtonEnabled, setRefreshButtonEnabled] = useState<boolean>(
    initial.refreshButtonEnabled,
  );
  const [sseEnabled, setSseEnabled] = useState<boolean>(initial.sseEnabled);
  const [isPending, start] = useTransition();

  function handleSave() {
    const live = clamp(liveSeconds, LIVE_MIN, LIVE_MAX);
    const historical = clamp(historicalSeconds, HISTORICAL_MIN, HISTORICAL_MAX);

    setLiveSeconds(live);
    setHistoricalSeconds(historical);

    start(async () => {
      const updates = [
        updateSetting({
          key: "polling.live_seconds",
          value: live,
          category: "polling",
        }),
        updateSetting({
          key: "polling.historical_seconds",
          value: historical,
          category: "polling",
        }),
        updateSetting({
          key: "polling.refresh_button_enabled",
          value: refreshButtonEnabled,
          category: "polling",
        }),
        updateSetting({
          key: "realtime.sse_enabled",
          value: sseEnabled,
          category: "realtime",
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
          <Label htmlFor="polling-live">Intervalo ao vivo (segundos)</Label>
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
            Frequência de atualização dos painéis ao vivo ({LIVE_MIN}-{LIVE_MAX}s).
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="polling-historical">
            Intervalo histórico (segundos)
          </Label>
          <Input
            id="polling-historical"
            type="number"
            min={HISTORICAL_MIN}
            max={HISTORICAL_MAX}
            value={historicalSeconds}
            onChange={(e) =>
              setHistoricalSeconds(parseInt(e.target.value, 10) || 0)
            }
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            Frequência de atualização dos painéis históricos ({HISTORICAL_MIN}-
            {HISTORICAL_MAX}s).
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
              Mostrar botão manual de refresh nos relatórios.
            </p>
          </div>
          <Switch
            checked={refreshButtonEnabled}
            onCheckedChange={setRefreshButtonEnabled}
            disabled={isPending}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/40 p-3.5">
          <div>
            <p className="text-sm font-medium text-foreground">
              Atualizações em tempo real (SSE)
            </p>
            <p className="text-xs text-muted-foreground">
              Habilitar canal Server-Sent Events para invalidar caches em tempo real.
            </p>
          </div>
          <Switch
            checked={sseEnabled}
            onCheckedChange={setSseEnabled}
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
