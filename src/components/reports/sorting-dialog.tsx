"use client";

// SortingDialog — painel de ordenação em cadeia (R3 da release Conversas Poderoso).
// Permite combinar múltiplos critérios (campo + asc/desc) com Apply explícito,
// reordenação ↑↓ e remoção individual.

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";

export interface SortRuleOption {
  key: string;
  label: string;
}

export interface SortRule {
  key: string;
  direction: "asc" | "desc";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applied: SortRule[];
  options: SortRuleOption[];
  onApply: (next: SortRule[]) => void;
  onClear: () => void;
}

export function SortingDialog({
  open,
  onOpenChange,
  applied,
  options,
  onApply,
  onClear,
}: Props) {
  const [draft, setDraft] = useState<SortRule[]>(applied);

  // Reseta o draft cada vez que o modal reabre, sincronizando com applied.
  useEffect(() => {
    if (open) setDraft(applied);
  }, [open, applied]);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const usedKeys = new Set(draft.map((d) => d.key));
  const available = options.filter((o) => !usedKeys.has(o.key));

  const move = (idx: number, delta: -1 | 1) => {
    const next = [...draft];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    setDraft(next);
  };

  const removeRule = (idx: number) => {
    setDraft((p) => p.filter((_, i) => i !== idx));
  };

  const addRule = () => {
    if (!available[0]) return;
    setDraft((p) => [...p, { key: available[0]!.key, direction: "asc" }]);
  };

  const setKey = (idx: number, key: string) => {
    setDraft((p) =>
      p.map((rule, i) => (i === idx ? { ...rule, key } : rule)),
    );
  };

  const toggleDir = (idx: number) => {
    setDraft((p) =>
      p.map((rule, i) =>
        i === idx
          ? { ...rule, direction: rule.direction === "asc" ? "desc" : "asc" }
          : rule,
      ),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        <DialogTitle>Ordenação</DialogTitle>
        <DialogDescription className="sr-only">
          Combine múltiplos critérios de ordenação aplicados em sequência.
        </DialogDescription>

        <div className="space-y-3 py-4">
          {draft.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum critério aplicado. Adicione um critério para ordenar a
              tabela.
            </p>
          ) : null}

          <ul className="space-y-2">
            {draft.map((rule, idx) => {
              const fieldOptions = options.map((o) => ({
                value: o.key,
                label: o.label,
              }));
              return (
                <li
                  key={`${rule.key}-${idx}`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary tabular-nums">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <CustomSelect
                      value={rule.key}
                      onChange={(k) => setKey(idx, k)}
                      options={fieldOptions}
                      triggerClassName="h-9 text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    variant={rule.direction === "asc" ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleDir(idx)}
                    aria-label={`Direção ${
                      rule.direction === "asc" ? "ascendente" : "descendente"
                    }`}
                  >
                    {rule.direction === "asc" ? (
                      <ArrowUp aria-hidden />
                    ) : (
                      <ArrowDown aria-hidden />
                    )}
                  </Button>
                  <div className="inline-flex flex-col">
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      aria-label="Mover para cima"
                      className="rounded-md px-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={idx === draft.length - 1}
                      aria-label="Mover para baixo"
                      className="rounded-md px-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRule(idx)}
                    aria-label="Remover critério"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRule}
            disabled={available.length === 0}
          >
            <Plus aria-hidden />
            Adicionar critério
          </Button>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onClear();
              onOpenChange(false);
            }}
            disabled={applied.length === 0 && draft.length === 0}
          >
            Limpar
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onApply(draft);
                onOpenChange(false);
              }}
              disabled={!isDirty}
            >
              <ArrowUpDown aria-hidden />
              Aplicar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SortingDialog;
