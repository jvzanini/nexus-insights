"use client";

// Bloco fixo no topo do modal de Filtros (acima das abas Simples/Avançado).
// Propriedades GLOBAIS do estado — não pertencem a nenhuma aba e não são
// zeradas na troca de aba:
//   (1) Data: qual coluna o período observa (Criado em / Última atualização).
//   (2) Filtrar por tempo: Sem resposta há / Aberta há / Parada há, com modo
//       (no mínimo / no máximo / entre), valor livre e unidade.
// O filtro de tempo é aplicado client-side (matchDuration) sobre segundos
// exatos; a coluna arredonda só para leitura.

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, HelpCircle, Info, RotateCcw } from "lucide-react";

import { CustomSelect, type SelectOption } from "@/components/ui/custom-select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

const DATE_OPTIONS: { value: DateField; label: string }[] = [
  { value: "created", label: DATE_FIELD_LABELS.created },
  { value: "updated", label: DATE_FIELD_LABELS.updated },
];

const MODE_OPTIONS: { value: DurationMode; label: string }[] = [
  { value: "gte", label: MODE_LABELS.gte },
  { value: "lte", label: MODE_LABELS.lte },
  { value: "between", label: MODE_LABELS.between },
];

interface Props {
  dateField: DateField;
  durationFilter?: DurationFilter;
  period: PeriodKey;
  statuses: number[];
  onDateFieldChange: (v: DateField) => void;
  onDurationChange: (v: DurationFilter | undefined) => void;
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5",
        disabled && "opacity-50",
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
              "cursor-pointer disabled:cursor-not-allowed",
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

function HelpHint({ text, label }: { text: string; label: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 cursor-pointer"
          >
            <HelpCircle className="h-4 w-4" aria-hidden />
          </button>
        }
      />
      <PopoverContent
        align="start"
        sideOffset={4}
        className="max-w-xs p-3 text-xs leading-relaxed text-muted-foreground"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}

export function DurationDateFilter({
  dateField,
  durationFilter,
  period,
  statuses,
  onDateFieldChange,
  onDurationChange,
}: Props) {
  const dateDisabled = period === "todos";
  const enabled = !!durationFilter;
  const df = durationFilter;

  // Estado local dos inputs numéricos — permite digitar livremente (apagar,
  // valor parcial) sem revert imediato; commit ao estado quando válido (> 0).
  const [valueStr, setValueStr] = useState(String(df?.value ?? DEFAULT_DURATION.value));
  const [valueEndStr, setValueEndStr] = useState(String(df?.valueEnd ?? ""));

  useEffect(() => {
    setValueStr(String(df?.value ?? DEFAULT_DURATION.value));
    setValueEndStr(df?.valueEnd != null ? String(df.valueEnd) : "");
  }, [df?.value, df?.valueEnd, enabled]);

  function patch(next: Partial<DurationFilter>) {
    if (!df) return;
    onDurationChange({ ...df, ...next });
  }

  function toggle(on: boolean) {
    onDurationChange(on ? DEFAULT_DURATION : undefined);
  }

  function changeMode(mode: DurationMode) {
    if (!df) return;
    if (mode === "between") {
      const valueEnd = df.valueEnd ?? df.value * 2;
      onDurationChange({ ...df, mode, valueEnd, unitEnd: df.unitEnd ?? df.unit });
    } else {
      onDurationChange({ ...df, mode });
    }
  }

  function commitValue(raw: string, which: "value" | "valueEnd") {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    patch({ [which]: n });
  }

  const isWaitingOrOpen =
    !!df && (df.indicator === "waiting" || df.indicator === "open");
  const hasResolvedConflict =
    isWaitingOrOpen && statuses.includes(STATUS_RESOLVED_ID);

  // Validação de faixa (em segundos), para alerta inline.
  const betweenInvalid =
    !!df &&
    df.mode === "between" &&
    df.valueEnd != null &&
    df.value * UNIT_SECONDS[df.unit] >=
      df.valueEnd * UNIT_SECONDS[df.unitEnd ?? df.unit];

  return (
    <div className="mb-4 space-y-4 rounded-xl border border-border bg-muted/20 p-4">
      {/* Linha Data */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">Data</span>
          <HelpHint
            label="O que significa cada opção de data"
            text={`${DATE_FIELD_LABELS.created}: ${DATE_FIELD_HELP.created}\n\n${DATE_FIELD_LABELS.updated}: ${DATE_FIELD_HELP.updated}`}
          />
        </div>
        <Segmented<DateField>
          ariaLabel="Coluna de data observada pelo período"
          value={dateField}
          onChange={onDateFieldChange}
          options={DATE_OPTIONS}
          disabled={dateDisabled}
        />
        {dateDisabled ? (
          <span className="text-xs text-muted-foreground">
            A escolha de data só afeta Hoje/Semana/Mês/Personalizado.
          </span>
        ) : null}
      </div>

      <div className="h-px bg-border" />

      {/* Filtrar por tempo */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium text-foreground">
              Filtrar por tempo
            </span>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <span>{enabled ? "Ativo" : "Desativado"}</span>
            <Switch
              checked={enabled}
              onCheckedChange={toggle}
              aria-label="Ativar filtro por tempo"
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Há quanto tempo a conversa está sem resposta, aberta ou parada.
        </p>

        {enabled && df ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              {/* Indicador */}
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
              {/* Modo */}
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

            <div className="flex flex-wrap items-end gap-2">
              {/* Valor + unidade (início) */}
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
                  className="w-20"
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
                      className="w-20"
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

            {/* Frase-exemplo viva */}
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

            <button
              type="button"
              onClick={() => onDurationChange(undefined)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Limpar filtro de tempo
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default DurationDateFilter;
