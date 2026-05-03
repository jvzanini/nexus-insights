"use client";

/**
 * PromptPreviewCard — preview client-side do system prompt do Agente Nex.
 *
 * Card com:
 * - Título "Prompt completo do Agente Nex" + subtítulo (atualização em tempo real).
 * - Banner italic deixando claro que o preview é somente leitura, com microcopy
 *   role-aware ("super_admin pode editar" vs "apenas super_admins podem editar").
 * - Header com 2 botões: Copiar (todos) + Editar (super_admin only).
 *   Editar abre Dialog max-edit (max-w-[1000px], max-h-[90vh]) com
 *   `<PromptConfigForm>` dentro.
 * - Toggle "Ver prompt completo (somente leitura)" (default fechado) que revela
 *   o `<pre>` em ScrollArea com o prompt composto. Sem `aria-readonly`
 *   (atributo inválido em HTML — apenas inputs/textarea aceitam).
 *
 * Importa de `@/lib/nex/prompt-compose` (núcleo puro / isomórfico, sem `pg`).
 */

import { useMemo, useState } from "react";
import { BookText, ChevronRight, Copy, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PromptConfigForm } from "@/components/agente-nex/prompt-config-form";
import {
  composeSystemPrompt,
  type AccountUrlSnippet,
  type KbDocSnippet,
  type NexPromptConfig,
} from "@/lib/nex/prompt-compose";
import { cn } from "@/lib/utils";

interface PromptPreviewCardProps {
  config: NexPromptConfig;
  kbDocs: KbDocSnippet[];
  accountUrls: AccountUrlSnippet[];
  isSuperAdmin: boolean;
}

export function PromptPreviewCard({
  config,
  kbDocs,
  accountUrls,
  isSuperAdmin,
}: PromptPreviewCardProps) {
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [showFull, setShowFull] = useState<boolean>(false);

  const prompt = useMemo(
    () => composeSystemPrompt(config, kbDocs, accountUrls),
    [config, kbDocs, accountUrls],
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Prompt copiado!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  return (
    <>
      <Card className="ring-foreground/10">
        <CardHeader className="grid-cols-[1fr_auto] items-start gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2">
              <BookText
                className="h-4 w-4 shrink-0 text-violet-500"
                aria-hidden="true"
              />
              Prompt completo do Agente Nex
            </CardTitle>
            <CardDescription className="text-xs">
              Atualizado em tempo real conforme você edita.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="cursor-pointer"
            >
              <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Copiar
            </Button>
            {isSuperAdmin ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => setEditOpen(true)}
                className="cursor-pointer"
              >
                <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Editar
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-xs italic text-muted-foreground">
            Preview somente leitura.{" "}
            {isSuperAdmin
              ? "Use Editar para ajustar Personalidade · Tom · Guardrails · Modo manual."
              : "Apenas super_admins podem editar."}
          </p>

          <button
            type="button"
            onClick={() => setShowFull((v) => !v)}
            aria-expanded={showFull}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                showFull && "rotate-90",
              )}
              aria-hidden="true"
            />
            {showFull
              ? "Ocultar prompt completo"
              : "Ver prompt completo (somente leitura)"}
          </button>

          {showFull ? (
            <ScrollArea className="max-h-[400px] w-full overflow-x-hidden rounded-lg border border-border bg-muted/40">
              <pre
                data-testid="prompt-preview"
                className="min-w-0 cursor-text p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground"
              >
                {prompt}
              </pre>
            </ScrollArea>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-[min(1000px,95vw)] flex-col gap-3 p-6 sm:max-w-[min(1000px,95vw)]">
          <DialogHeader>
            <DialogTitle>Editar prompt do Agente Nex</DialogTitle>
            <DialogDescription>
              Personalidade, Tom, Guardrails e Modo prompt manual. Salvar
              atualiza imediatamente.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 w-full flex-1 pr-2">
            <PromptConfigForm
              initial={config}
              onSaved={() => setEditOpen(false)}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
