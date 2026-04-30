"use client";

// PresetsDialog — gerenciamento completo dos presets em modal:
// renomear inline, excluir com confirmação, aplicar (1 click). Usa o
// primitive `<Dialog>` (base-ui) com focus trap e ESC nativos.

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FilterPreset } from "@/lib/hooks/use-filter-presets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: FilterPreset[];
  onRename: (id: string, name: string) => boolean;
  onRemove: (id: string) => void;
  onApply: (preset: FilterPreset) => void;
  validateName: (name: string, ignoreId?: string) => string | null;
}

export function PresetsDialog({
  open,
  onOpenChange,
  presets,
  onRename,
  onRemove,
  onApply,
  validateName,
}: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const startRename = (p: FilterPreset) => {
    setRenaming(p.id);
    setName(p.name);
    setErr(null);
  };

  const cancelRename = () => {
    setRenaming(null);
    setErr(null);
    setName("");
  };

  const finishRename = () => {
    if (!renaming) return;
    const v = validateName(name, renaming);
    if (v) {
      setErr(v);
      return;
    }
    if (onRename(renaming, name)) {
      cancelRename();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] sm:max-w-[560px]">
        <DialogTitle>Filtros salvos</DialogTitle>
        <DialogDescription className="sr-only">
          Gerencie seus presets de filtros: renomear, excluir e aplicar.
        </DialogDescription>

        {presets.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhum preset salvo. Use &quot;Salvar atual&quot; no menu de
            Presets para começar.
          </div>
        ) : (
          <ul className="space-y-2 py-1">
            {presets.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-border bg-card p-3"
              >
                {renaming === p.id ? (
                  <div className="space-y-2">
                    <Input
                      autoFocus
                      value={name}
                      onChange={(e) => {
                        setName(e.currentTarget.value);
                        setErr(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") finishRename();
                        if (e.key === "Escape") cancelRename();
                      }}
                      className="h-9"
                      aria-label="Novo nome do preset"
                    />
                    {err ? (
                      <p role="alert" className="text-xs text-destructive">
                        {err}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={finishRename}>
                        Salvar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={cancelRename}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : confirmRemove === p.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">
                      Excluir <strong>{p.name}</strong>?
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        onRemove(p.id);
                        setConfirmRemove(null);
                      }}
                    >
                      Excluir
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemove(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 text-sm font-medium text-foreground">
                      {p.name}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onApply(p)}
                    >
                      Aplicar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => startRename(p)}
                      aria-label={`Renomear ${p.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemove(p.id)}
                      aria-label={`Excluir ${p.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PresetsDialog;
