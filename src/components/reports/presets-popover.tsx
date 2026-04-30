"use client";

// PresetsPopover — botão "Presets" do toolbar com:
//  - Lista compacta de presets salvos (click aplica e fecha)
//  - "Salvar atual" inline (input + Salvar/Cancelar com validação)
//  - "Gerenciar" abre o `<PresetsDialog>` (renomear/excluir)
//
// Persistência: localStorage via `useFilterPresets` (instância vive no
// `<ConversasPageClient>` e é cabeada via prop `presetsApi`).

import { useState } from "react";
import { Plus, Settings, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FilterPreset } from "@/lib/hooks/use-filter-presets";

interface Props {
  presets: FilterPreset[];
  isAtCap: boolean;
  onApply: (preset: FilterPreset) => void;
  onCreate: (name: string) => void;
  onOpenManager: () => void;
  validateName: (name: string) => string | null;
}

export function PresetsPopover({
  presets,
  isAtCap,
  onApply,
  onCreate,
  onOpenManager,
  validateName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setCreating(false);
    setName("");
    setErr(null);
  };

  const handleCreate = () => {
    const v = validateName(name);
    if (v) {
      setErr(v);
      return;
    }
    onCreate(name);
    reset();
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Filtros salvos${
              presets.length > 0 ? ` (${presets.length})` : ""
            }`}
            data-tour="presets"
            className={cn("relative h-10 px-4")}
          >
            <Star aria-hidden="true" />
            Presets
            {presets.length > 0 ? (
              <Badge
                variant="default"
                className="ml-1 h-5 min-w-5 px-1.5 tabular-nums"
              >
                {presets.length}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="start" sideOffset={8} className="w-80 p-0">
        <div className="border-b border-border/60 px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Meus presets
          </span>
        </div>
        <ul role="menu" className="max-h-72 overflow-y-auto py-1">
          {presets.length === 0 ? (
            <li className="px-3 py-3 text-xs text-muted-foreground">
              Você ainda não salvou nenhum preset.
            </li>
          ) : (
            presets.map((p) => (
              <li key={p.id} role="menuitem">
                <button
                  type="button"
                  onClick={() => {
                    onApply(p);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
                >
                  <Star
                    className="h-3.5 w-3.5 shrink-0 text-amber-400"
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm text-foreground">
                    {p.name}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-border/60 space-y-1 p-2">
          {creating ? (
            <div className="space-y-1.5">
              <Input
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.currentTarget.value);
                  setErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") reset();
                }}
                placeholder="Nome do preset"
                className="h-8 text-xs"
                aria-label="Nome do preset"
              />
              {err ? (
                <p role="alert" className="text-[11px] text-destructive">
                  {err}
                </p>
              ) : null}
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreate}
                  className="h-7 text-xs"
                >
                  Salvar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  className="h-7 text-xs"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isAtCap}
              onClick={() => setCreating(true)}
              className="h-8 w-full justify-start gap-2 text-xs"
              title={isAtCap ? "Limite de 50 presets atingido" : undefined}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Salvar atual
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={presets.length === 0}
            onClick={() => {
              onOpenManager();
              setOpen(false);
            }}
            className="h-8 w-full justify-start gap-2 text-xs"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            Gerenciar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default PresetsPopover;
