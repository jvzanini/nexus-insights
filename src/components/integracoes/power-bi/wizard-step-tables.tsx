"use client";

/**
 * WizardStep2 — Seleção de tabelas.
 *
 * 3 grupos visuais:
 *  - Fatos diários (4 tabelas)
 *  - Fatos por hora (1 tabela)
 *  - Dimensões (5 tabelas)
 *
 * Cada item: checkbox + label (catálogo `entry.label`) + descrição inline
 * (entry.description). Botões superiores: "Selecionar tudo",
 * "Selecionar fatos diários", "Limpar".
 *
 * Quando uma tabela é desmarcada, removemos também as colunas dela do
 * `allowedColumns` (consistência entre steps 2 e 3).
 *
 * Validação visível inline quando `error` é fornecido (orchestrator
 * decide quando mostrar — ao tentar avançar).
 */

import { Check, Database, ChevronsRight, Eraser, Info } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { POWER_BI_CATALOG } from "@/lib/integrations/power-bi/catalog";
import { cn } from "@/lib/utils";

import type { WizardFormData } from "./wizard-types";

interface Props {
  data: WizardFormData;
  onChange: (next: Partial<WizardFormData>) => void;
  error?: string | null;
  disabled?: boolean;
}

const FACTS_DAILY = [
  "chatwoot_facts_daily_by_account",
  "chatwoot_facts_daily_by_inbox",
  "chatwoot_facts_daily_by_agent",
  "chatwoot_facts_daily_by_team",
] as const;

const FACTS_HOURLY = ["chatwoot_facts_hourly_by_account"] as const;

const DIMS = [
  "dim_accounts",
  "dim_inboxes",
  "dim_agents",
  "dim_teams",
  "dim_dates",
] as const;

const ALL_TABLES = [...FACTS_DAILY, ...FACTS_HOURLY, ...DIMS] as const;

export function WizardStepTables({
  data,
  onChange,
  error,
  disabled,
}: Props) {
  const selected = new Set(data.allowedTables);

  function toggle(table: string) {
    const next = new Set(selected);
    const nextCols = { ...data.allowedColumns };

    if (next.has(table)) {
      next.delete(table);
      // Limpa colunas da tabela removida.
      delete nextCols[table];
    } else {
      next.add(table);
      // Pré-preenche allowedColumns com `essentialColumns` (será revisado
      // no step 3, mas evita estado inválido se usuário pular).
      const entry = (
        POWER_BI_CATALOG.facts as Record<
          string,
          { essentialColumns: readonly string[] }
        >
      )[table] ??
        (
          POWER_BI_CATALOG.dims as Record<
            string,
            { essentialColumns: readonly string[] }
          >
        )[table];
      if (entry && !nextCols[table]) {
        nextCols[table] = [...entry.essentialColumns];
      }
    }

    onChange({
      allowedTables: Array.from(next),
      allowedColumns: nextCols,
    });
  }

  function selectAll() {
    const cols = { ...data.allowedColumns };
    for (const t of ALL_TABLES) {
      if (!cols[t]) {
        const entry = (
          POWER_BI_CATALOG.facts as Record<
            string,
            { essentialColumns: readonly string[] }
          >
        )[t] ??
          (
            POWER_BI_CATALOG.dims as Record<
              string,
              { essentialColumns: readonly string[] }
            >
          )[t];
        if (entry) cols[t] = [...entry.essentialColumns];
      }
    }
    onChange({
      allowedTables: [...ALL_TABLES],
      allowedColumns: cols,
    });
  }

  function selectFactsDaily() {
    const cols = { ...data.allowedColumns };
    for (const t of FACTS_DAILY) {
      if (!cols[t]) {
        const entry = (
          POWER_BI_CATALOG.facts as Record<
            string,
            { essentialColumns: readonly string[] }
          >
        )[t];
        if (entry) cols[t] = [...entry.essentialColumns];
      }
    }
    onChange({
      allowedTables: [...FACTS_DAILY],
      allowedColumns: cols,
    });
  }

  function clearAll() {
    onChange({ allowedTables: [], allowedColumns: {} });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Tabelas expostas
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Escolha quais tabelas o Power BI poderá consultar.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={selectAll}
            disabled={disabled}
          >
            <Check className="h-3 w-3" aria-hidden="true" />
            Selecionar tudo
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={selectFactsDaily}
            disabled={disabled}
          >
            <ChevronsRight className="h-3 w-3" aria-hidden="true" />
            Fatos diários
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={clearAll}
            disabled={disabled || selected.size === 0}
          >
            <Eraser className="h-3 w-3" aria-hidden="true" />
            Limpar
          </Button>
        </div>
      </div>

      <TableGroup
        title="Fatos diários"
        description="Volumes agregados por dia."
        tables={FACTS_DAILY}
        selected={selected}
        onToggle={toggle}
        disabled={disabled}
      />

      <TableGroup
        title="Fatos por hora"
        description="Granularidade horária — útil pra picos de atendimento."
        tables={FACTS_HOURLY}
        selected={selected}
        onToggle={toggle}
        disabled={disabled}
      />

      <TableGroup
        title="Dimensões"
        description="Snapshots auxiliares (contas, caixas, atendentes, equipes, calendário). Atualizados a cada 30 min."
        tables={DIMS}
        selected={selected}
        onToggle={toggle}
        disabled={disabled}
      />

      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
          error
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-border bg-muted/30 text-muted-foreground",
        )}
        role={error ? "alert" : "status"}
        aria-live="polite"
      >
        {error ? (
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <Database className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        <span>
          {error
            ? error
            : `${selected.size} tabela${selected.size === 1 ? "" : "s"} selecionada${
                selected.size === 1 ? "" : "s"
              } de ${ALL_TABLES.length}.`}
        </span>
      </div>
    </div>
  );
}

interface GroupProps {
  title: string;
  description: string;
  tables: readonly string[];
  selected: Set<string>;
  onToggle: (table: string) => void;
  disabled?: boolean;
}

function TableGroup({
  title,
  description,
  tables,
  selected,
  onToggle,
  disabled,
}: GroupProps) {
  return (
    <fieldset className="rounded-xl border border-border/60 bg-background/40 p-3">
      <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </legend>
      <p className="mb-2 text-[11px] text-muted-foreground">{description}</p>
      <div className="space-y-1.5">
        {tables.map((tableName) => {
          const entry =
            (
              POWER_BI_CATALOG.facts as Record<
                string,
                { label: string; description: string }
              >
            )[tableName] ??
            (
              POWER_BI_CATALOG.dims as Record<
                string,
                { label: string; description: string }
              >
            )[tableName];
          const isSelected = selected.has(tableName);
          return (
            <label
              key={tableName}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border border-transparent px-2.5 py-2 transition-colors",
                "hover:bg-muted/40",
                isSelected && "border-violet-500/30 bg-violet-500/5",
                disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
              )}
            >
              <Checkbox
                data-testid={`wizard-table-${tableName}`}
                checked={isSelected}
                onCheckedChange={() => !disabled && onToggle(tableName)}
                disabled={disabled}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {entry?.label ?? tableName}
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {entry?.description ?? ""}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                  {tableName}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
