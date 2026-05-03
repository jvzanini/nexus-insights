"use client";

/**
 * PromptPreviewCard — preview client-side do system prompt do Agente Nex.
 *
 * v0.28.0:
 * - Removido collapse — `<pre>` SEMPRE visível.
 * - Botão Editar (super_admin only) abre Dialog max-edit com IdentityBaseEditor
 *   (substitui PromptConfigForm — Personalidade/Tom/Guardrails seguem na seção
 *   Comportamento abaixo, fora do Dialog).
 * - Removido botão Maximizar.
 */

import { useMemo, useState } from "react";
import { BookText, Copy, Pencil } from "lucide-react";
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
import { IdentityBaseEditor } from "@/components/agente-nex/identity-base-editor";
import {
  composeSystemPrompt,
  type AccountUrlSnippet,
  type KbDocSnippet,
  type NexPromptConfig,
} from "@/lib/nex/prompt-compose";

interface PromptPreviewCardProps {
  config: NexPromptConfig;
  kbDocs: KbDocSnippet[];
  accountUrls: AccountUrlSnippet[];
  isSuperAdmin: boolean;
  /** Texto atual do IDENTITY_BASE — DB se customizado, hardcoded default senão. */
  currentIdentityBase: string;
  /** True quando há texto customizado no DB. */
  isIdentityBaseCustom: boolean;
}

export function PromptPreviewCard({
  config,
  kbDocs,
  accountUrls,
  isSuperAdmin,
  currentIdentityBase,
  isIdentityBaseCustom,
}: PromptPreviewCardProps) {
  const [editOpen, setEditOpen] = useState<boolean>(false);

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
              <BookText className="h-4 w-4 shrink-0 text-violet-500" aria-hidden="true" />
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
          {!isSuperAdmin ? (
            <p className="text-xs italic text-muted-foreground">
              Apenas super_admins podem editar.
            </p>
          ) : null}

          <ScrollArea className="max-h-[400px] w-full overflow-x-hidden rounded-lg border border-border bg-muted/40">
            <pre
              data-testid="prompt-preview"
              className="min-w-0 cursor-text p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground"
            >
              {prompt}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-[min(900px,95vw)] flex-col gap-3 p-6 sm:max-w-[min(900px,95vw)]">
          <DialogHeader>
            <DialogTitle>Editar prompt do Agente Nex</DialogTitle>
            <DialogDescription>
              Edite o texto-base do agente. Personalidade, Tom, Guardrails e Modo manual continuam na seção Comportamento abaixo.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1 w-full pr-2">
            <IdentityBaseEditor
              current={currentIdentityBase}
              isCustom={isIdentityBaseCustom}
              onSaved={() => setEditOpen(false)}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
