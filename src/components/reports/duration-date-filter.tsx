"use client";

// Conteúdos das seções de filtro "Critério de visualização" e "Tempo de
// mensagem", renderizados DENTRO de CollapsibleSection no modal (mesmo padrão
// dropdown dos demais filtros). São propriedades globais do FilterState:
//   - Critério de visualização: qual coluna o período observa (Criado em /
//     Última atualização em → ReportFilters.periodColumn).
//   - Tempo de mensagem: Sem resposta há / Aberta há / Parada há, com modo
//     (no mínimo / no máximo / entre), valor livre e unidade.
// O filtro de tempo é client-side (matchDuration) sobre segundos exatos.

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Info, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CustomSelect, type SelectOption } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { UNIT_SECONDS } from "@/lib/reports/match-duration";
import type { PeriodKey } from "@/lib/datetime-core";
import type {
  DateField,
  DurationFilter,
  DurationIndicator,
  DurationMode,
  DurationUnit,
} from "@/lib/reports/filter-state";
import {
  DATE_FIELD_HELP,
  DATE_FIELD_LABELS,
  EXACT_TIME_NOTE,
  INDICATOR_HELP,
  INDICATOR_LABELS,
  MODE_LABELS,
  RESOLVED_WARN,
  STATUS_RESOLVED_ID,
  UNIT_SELECT_LABELS,
  durationSentence,
} from "@/lib/reports/duration-copy";

const DEFAULT_DURATION: DurationFilter = {
  indicator: "waiting",
  mode: "gte",
  value: 10,
  unit: "minute",
};

const INDICATOR_OPTIONS: SelectOption[] = (
  ["waiting", "open", "stalled"] as DurationIndicator[]
).map((i) => ({
  value: i,
  label: INDICATOR_LABELS[i],
  description: INDICATOR_HELP[i],
}));

const UNIT_OPTIONS: SelectOption[] = (
  ["minute", "hour", "day", "month", "year"] as DurationUnit[]
).map((u) => ({ value: u, label: UNIT_SELECT_LABELS[u] }));

const MODE_OPTIONS: { value: DurationMode; label: string }[] = [
  { value: "gte", label: MODE_LABELS.gte },
  { value: "lte", label: MODE_LABELS.lte },
  { value: "between", label: MODE_LABELS.between },
];

function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Item de rádio com descrição sempre visível (sem tooltip/interrogação). */
function RadioCard({
  selected,
  title,
  description,
  onSelect,
  disabled,
}: {
  selected: boolean;
  title: string;
  description: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/30",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-primary" : "border-muted-foreground/40",
        )}
      >
        {selected ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}

/** Tag de status de conversa (aberta / resolvida / não resolvida) para destaque. */
function StatusTag({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "open" | "resolved" | "unresolved";
}) {
  const cls =
    tone === "open"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : tone === "unresolved"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-muted text-foreground/80";
  return (
    <span
      className={cn(
        "mx-0.5 inline-flex items-center rounded px-1.5 py-px text-[11px] font-medium",
        cls,
      )}
    >
      {children}
    </span>
  );
}

/** Descrição rica do indicador, com tags de status destacadas. */
const INDICATOR_RICH_DESC: Record<DurationIndicator, ReactNode> = {
  waiting: (
    <>
      Tempo desde a última mensagem do cliente sem o atendente responder. Só
      conversas <StatusTag tone="unresolved">não resolvidas</StatusTag> em que o
      cliente foi o último a falar. Uma nota privada do atendente encerra essa
      contagem.
    </>
  ),
  open: (
    <>
      Tempo desde a última mensagem do atendente numa conversa ainda{" "}
      <StatusTag tone="open">aberta</StatusTag>. Normalmente aguardando retorno
      do cliente ou conversa ainda não{" "}
      <StatusTag tone="resolved">resolvida</StatusTag>.
    </>
  ),
  stalled: (
    <>
      Tempo desde a última atividade na conversa (qualquer mensagem). Encontra
      conversas estagnadas ou esquecidas que ainda estão{" "}
      <StatusTag tone="open">abertas</StatusTag>.
    </>
  ),
};

/** Conteúdo da seção "Critério de visualização" (Criado em / Última atualização em). */
export function CriterioVisualizacaoContent({
  dateField,
  period,
  onChange,
}: {
  dateField: DateField;
  period: PeriodKey;
  onChange: (v: DateField) => void;
}) {
  const disabled = period === "todos";
  return (
    <div role="radiogroup" aria-label="Critério de visualização" className="space-y-2">
      <RadioCard
        selected={dateField === "created"}
        title={DATE_FIELD_LABELS.created}
        description={DATE_FIELD_HELP.created}
        onSelect={() => onChange("created")}
        disabled={disabled}
      />
      <RadioCard
        selected={dateField === "updated"}
        title={DATE_FIELD_LABELS.updated}
        description={DATE_FIELD_HELP.updated}
        onSelect={() => onChange("updated")}
        disabled={disabled}
      />
      {disabled ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          A escolha só afeta os períodos Hoje, Esta semana, Este mês e
          Personalizado.
        </p>
      ) : null}
    </div>
  );
}

/** Conteúdo da seção "Tempo de mensagem". */
export function TempoMensagemContent({
  durationFilter,
  statuses,
  onChange,
}: {
  durationFilter?: DurationFilter;
  statuses: number[];
  onChange: (v: DurationFilter | undefined) => void;
}) {
  const enabled = !!durationFilter;
  const df = durationFilter;

  const [valueStr, setValueStr] = useState(String(df?.value ?? DEFAULT_DURATION.value));
  const [valueEndStr, setValueEndStr] = useState(df?.valueEnd != null ? String(df.valueEnd) : "");

  useEffect(() => {
    setValueStr(String(df?.value ?? DEFAULT_DURATION.value));
    setValueEndStr(df?.valueEnd != null ? String(df.valueEnd) : "");
  }, [df?.value, df?.valueEnd, enabled]);

  function patch(next: Partial<DurationFilter>) {
    if (!df) return;
    onChange({ ...df, ...next });
  }

  function changeMode(mode: DurationMode) {
    if (!df) return;
    if (mode === "between") {
      onChange({
        ...df,
        mode,
        valueEnd: df.valueEnd ?? df.value * 2,
        unitEnd: df.unitEnd ?? df.unit,
      });
    } else {
      onChange({ ...df, mode });
    }
  }

  function commitValue(raw: string, which: "value" | "valueEnd") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    patch({ [which]: n });
  }

  const isWaitingOrOpen = !!df && (df.indicator === "waiting" || df.indicator === "open");
  const hasResolvedConflict = isWaitingOrOpen && statuses.includes(STATUS_RESOLVED_ID);
  const betweenInvalid =
    !!df &&
    df.mode === "between" &&
    df.valueEnd != null &&
    df.value * UNIT_SECONDS[df.unit] >= df.valueEnd * UNIT_SECONDS[df.unitEnd ?? df.unit];

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <Switch
          checked={enabled}
          onCheckedChange={(on) => onChange(on ? DEFAULT_DURATION : undefined)}
          aria-label="Ativar filtro de tempo de mensagem"
        />
        <span>{enabled ? "Filtro ativo" : "Ativar filtro"}</span>
      </label>

      {enabled && df ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Indicador</span>
              <CustomSelect
                aria-label="Indicador de tempo"
                value={df.indicator}
                onChange={(v) => patch({ indicator: v as DurationIndicator })}
                options={INDICATOR_OPTIONS}
                triggerClassName="min-w-[180px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Condição</span>
              <Segmented<DurationMode>
                ariaLabel="Condição de tempo"
                value={df.mode}
                onChange={changeMode}
                options={MODE_OPTIONS}
              />
            </div>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {INDICATOR_RICH_DESC[df.indicator]}
          </p>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {df.mode === "between" ? "De" : "Valor"}
              </span>
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                aria-label={df.mode === "between" ? "Valor inicial" : "Valor"}
                value={valueStr}
                onChange={(e) => {
                  setValueStr(e.target.value);
                  commitValue(e.target.value, "value");
                }}
                className="w-24"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Unidade</span>
              <CustomSelect
                aria-label="Unidade"
                value={df.unit}
                onChange={(v) => patch({ unit: v as DurationUnit })}
                options={UNIT_OPTIONS}
                triggerClassName="min-w-[150px]"
              />
            </div>

            {df.mode === "between" ? (
              <>
                <span className="pb-2 text-sm text-muted-foreground">e</span>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Até</span>
                  <Input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    aria-label="Valor final"
                    value={valueEndStr}
                    onChange={(e) => {
                      setValueEndStr(e.target.value);
                      commitValue(e.target.value, "valueEnd");
                    }}
                    className="w-24"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Unidade</span>
                  <CustomSelect
                    aria-label="Unidade final"
                    value={df.unitEnd ?? df.unit}
                    onChange={(v) => patch({ unitEnd: v as DurationUnit })}
                    options={UNIT_OPTIONS}
                    triggerClassName="min-w-[150px]"
                  />
                </div>
              </>
            ) : null}
          </div>

          <p className="text-sm text-foreground">{durationSentence(df)}</p>

          {betweenInvalid ? (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              O valor final deve ser maior que o inicial.
            </p>
          ) : null}

          {hasResolvedConflict ? (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Você filtrou por Resolvida + este indicador — as condições se
              excluem e o resultado fica vazio. Para medir tempo em conversas
              resolvidas, use &quot;Parada há&quot;.
            </p>
          ) : isWaitingOrOpen ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {RESOLVED_WARN}
            </p>
          ) : null}

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {EXACT_TIME_NOTE}
          </p>

          <div className="flex justify-end border-t border-border/40 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(undefined)}
              className="cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Limpar filtro de tempo
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
