"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface UsageTableFiltersProps {
  /** Lista de providers distintos no período. */
  providers: string[];
  /** Mapa provider → modelos disponíveis no período. */
  modelsByProvider: Record<string, string[]>;
  /** Provider ativo. `undefined` = "Todos os providers". */
  selectedProvider?: string;
  /** Modelo ativo. `undefined` = "Todos os modelos". */
  selectedModel?: string;
  onProviderChange: (provider: string | undefined) => void;
  onModelChange: (model: string | undefined) => void;
}

const ALL_VALUE = "__all__";

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  google: "Google",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
};

function providerLabel(p: string): string {
  return PROVIDER_LABEL[p] ?? p;
}

interface ModelOption {
  value: string;
  label: string;
  provider?: string;
}

/**
 * Filtros cascade para a tabela de uso de LLM.
 *
 * - 2 selects alinhados à direita.
 * - Provider: "Todos" (default) + lista vinda da prop `providers`.
 * - Model: "Todos" (default) + cascade pela seleção do provider; quando
 *   nenhum provider está ativo, mostra todos os modelos com sufixo
 *   `(provider)` para diferenciar nomes iguais entre providers.
 * - Mudar provider reseta o modelo (UX: evita estados inválidos).
 * - Botão "Limpar filtros" aparece apenas quando algum filtro está ativo.
 */
export function UsageTableFilters({
  providers,
  modelsByProvider,
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
}: UsageTableFiltersProps) {
  const hasActiveFilter =
    selectedProvider !== undefined || selectedModel !== undefined;

  // Lista de modelos (cascade ou flat com sufixo de provider)
  const modelOptions: ModelOption[] = useMemo(() => {
    if (selectedProvider) {
      const list = modelsByProvider[selectedProvider] ?? [];
      return list.map((m) => ({ value: m, label: m }));
    }
    const flat: ModelOption[] = [];
    for (const provider of providers) {
      const models = modelsByProvider[provider] ?? [];
      for (const m of models) {
        flat.push({ value: m, label: m, provider });
      }
    }
    return flat;
  }, [providers, modelsByProvider, selectedProvider]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {hasActiveFilter ? (
        <button
          type="button"
          onClick={() => {
            onProviderChange(undefined);
            onModelChange(undefined);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Limpar filtros"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Limpar filtros
        </button>
      ) : null}

      <ProviderSelect
        providers={providers}
        selectedProvider={selectedProvider}
        onChange={(next) => {
          onProviderChange(next);
          // Reset cascade: provider mudou → modelo deixa de fazer sentido.
          onModelChange(undefined);
        }}
      />

      <ModelSelect
        options={modelOptions}
        selectedModel={selectedModel}
        showProviderSuffix={!selectedProvider}
        onChange={onModelChange}
      />
    </div>
  );
}

interface ProviderSelectProps {
  providers: string[];
  selectedProvider?: string;
  onChange: (provider: string | undefined) => void;
}

function ProviderSelect({
  providers,
  selectedProvider,
  onChange,
}: ProviderSelectProps) {
  const [open, setOpen] = useState(false);
  const label =
    selectedProvider !== undefined
      ? providerLabel(selectedProvider)
      : "Todos os providers";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Filtrar por provider"
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex h-9 min-w-[180px] items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground cursor-pointer transition-colors hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">{label}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={4}
        className="min-w-[200px] w-auto p-0 overflow-hidden"
      >
        <ul role="listbox" aria-label="Providers" className="flex flex-col py-1">
          <SelectOption
            label="Todos os providers"
            selected={selectedProvider === undefined}
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
          />
          {providers.map((p) => (
            <SelectOption
              key={p}
              label={providerLabel(p)}
              selected={selectedProvider === p}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
            />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

interface ModelSelectProps {
  options: ModelOption[];
  selectedModel?: string;
  showProviderSuffix: boolean;
  onChange: (model: string | undefined) => void;
}

function ModelSelect({
  options,
  selectedModel,
  showProviderSuffix,
  onChange,
}: ModelSelectProps) {
  const [open, setOpen] = useState(false);
  const label = selectedModel ?? "Todos os modelos";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Filtrar por modelo"
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex h-9 min-w-[200px] items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground cursor-pointer transition-colors hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">{label}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={4}
        className="min-w-[240px] w-auto max-w-[min(calc(100vw-2rem),360px)] p-0 overflow-hidden"
      >
        <ul
          role="listbox"
          aria-label="Modelos"
          className="flex max-h-72 flex-col overflow-y-auto py-1"
        >
          <SelectOption
            label="Todos os modelos"
            selected={selectedModel === undefined}
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
          />
          {options.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              Sem modelos disponíveis
            </li>
          ) : (
            options.map((opt) => {
              const displayLabel =
                showProviderSuffix && opt.provider
                  ? `${opt.label} (${providerLabel(opt.provider)})`
                  : opt.label;
              return (
                <SelectOption
                  key={`${opt.provider ?? ""}::${opt.value}`}
                  label={displayLabel}
                  selected={selectedModel === opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                />
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

interface SelectOptionProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

function SelectOption({ label, selected, onClick }: SelectOptionProps) {
  return (
    <li role="presentation">
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onClick}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent cursor-pointer",
          selected && "bg-accent/50",
        )}
      >
        <span className="truncate">{label}</span>
        {selected ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        ) : null}
      </button>
    </li>
  );
}

// Sentinela exportada caso o consumer queira mapear de/para "all" no URL state.
export const USAGE_FILTER_ALL = ALL_VALUE;
