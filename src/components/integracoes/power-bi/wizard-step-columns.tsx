"use client";

/**
 * WizardStep3 — Seleção de colunas.
 *
 * Para cada tabela selecionada no step 2, exibe um `CollapsibleSection`
 * (default expandido na primeira tabela) com:
 *  - Lista de checkboxes (`allColumns` do catálogo).
 *  - Colunas PK forçadas: pré-marcadas, disabled, badge "PK".
 *  - Pré-marcadas com `essentialColumns` na primeira renderização (já
 *    feita no step 2 ao toggle).
 *
 * Validação: ≥ 1 coluna por tabela. PK garante isso de fato — então
 * a regra raramente bloqueia. Mas se usuário desmarcar todas as
 * non-PK e a tabela não tem PK (caso teórico), o orchestrator alerta.
 */

import { useMemo } from "react";
import { KeyRound, Eye } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  POWER_BI_CATALOG,
  getCatalogEntry,
} from "@/lib/integrations/power-bi/catalog";
import { cn } from "@/lib/utils";

import type { WizardFormData } from "./wizard-types";

interface Props {
  data: WizardFormData;
  onChange: (next: Partial<WizardFormData>) => void;
  error?: string | null;
  disabled?: boolean;
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

export function WizardStepColumns({
  data,
  onChange,
  error,
  disabled,
}: Props) {
  const tables = data.allowedTables;

  // Garante que todas as tabelas selecionadas têm entry no allowedColumns
  // com pelo menos PK forçada (defesa em profundidade — step 2 já preenche).
  const sanitized = useMemo(() => {
    const next = { ...data.allowedColumns };
    let changed = false;
    for (const t of tables) {
      const entry = getCatalogEntry(t);
      if (!entry) continue;
      const current = next[t] ?? [...entry.essentialColumns];
      const withPk = uniq([...current, ...entry.pkColumns]);
      if (withPk.length !== current.length || withPk.some((c, i) => c !== current[i])) {
        next[t] = withPk;
        changed = true;
      }
    }
    return { next, changed };
  }, [tables, data.allowedColumns]);

  // Sem useEffect — apenas reportamos no próximo render se necessário.
  // O caller (orchestrator) já normaliza ao submit; aqui só visual.

  function toggleColumn(table: string, column: string) {
    if (disabled) return;
    const entry = getCatalogEntry(table);
    if (!entry) return;
    if (entry.pkColumns.includes(column)) return; // PK não pode desmarcar
    const current = data.allowedColumns[table] ?? [];
    const next = current.includes(column)
      ? current.filter((c) => c !== column)
      : [...current, column];
    onChange({
      allowedColumns: { ...data.allowedColumns, [table]: uniq(next) },
    });
  }

  function selectAllInTable(table: string) {
    const entry = getCatalogEntry(table);
    if (!entry) return;
    onChange({
      allowedColumns: {
        ...data.allowedColumns,
        [table]: [...entry.allColumns],
      },
    });
  }

  function selectEssential(table: string) {
    const entry = getCatalogEntry(table);
    if (!entry) return;
    onChange({
      allowedColumns: {
        ...data.allowedColumns,
        [table]: uniq([...entry.essentialColumns, ...entry.pkColumns]),
      },
    });
  }

  if (tables.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
        Volte ao passo anterior e selecione ao menos uma tabela.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Colunas expostas
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Por tabela: marque as colunas que o Power BI poderá ler. Colunas PK
          são obrigatórias para join e ficam fixas.
        </p>
      </div>

      {tables.map((tableName, idx) => {
        const entry = getCatalogEntry(tableName);
        if (!entry) return null;
        const colsForTable = sanitized.next[tableName] ?? [];
        const selectedSet = new Set(colsForTable);
        const allCols = entry.allColumns;
        const total = allCols.length;
        const count = selectedSet.size;
        const tableLabel =
          (POWER_BI_CATALOG.facts as Record<string, { label: string }>)[tableName]
            ?.label ??
          (POWER_BI_CATALOG.dims as Record<string, { label: string }>)[tableName]
            ?.label ??
          tableName;

        return (
          <CollapsibleSection
            key={tableName}
            title={`${tableLabel} — ${tableName}`}
            count={count}
            defaultOpen={idx === 0}
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {count} de {total} selecionadas
                </p>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => selectEssential(tableName)}
                    disabled={disabled}
                  >
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    Essenciais
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => selectAllInTable(tableName)}
                    disabled={disabled}
                  >
                    Todas
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {allCols.map((col) => {
                  const isPk = entry.pkColumns.includes(col);
                  const isChecked = isPk || selectedSet.has(col);
                  return (
                    <label
                      key={col}
                      data-testid={`wizard-col-${tableName}-${col}`}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                        "hover:bg-muted/40",
                        isChecked && "bg-muted/30",
                        isPk && "cursor-default",
                        disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        disabled={isPk || disabled}
                        onCheckedChange={() => toggleColumn(tableName, col)}
                      />
                      <span className="font-mono text-[12px] truncate flex-1">
                        {col}
                      </span>
                      {isPk ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-300"
                          title="Chave primária — obrigatória"
                        >
                          <KeyRound
                            className="h-2.5 w-2.5"
                            aria-hidden="true"
                          />
                          PK
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </div>
          </CollapsibleSection>
        );
      })}

      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
