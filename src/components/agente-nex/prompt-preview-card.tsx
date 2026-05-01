"use client";

/**
 * PromptPreviewCard — preview client-side do system prompt do Agente Nex.
 *
 * Card com:
 * - Título "Prompt completo do Agente Nex" + subtítulo (atualização em tempo real).
 * - Botões "Copiar" (clipboard + toast) e "Maximizar" (abre Sheet lateral).
 * - Toggle "Mostrar identidade fixa" (collapsible default closed) revelando
 *   `IDENTITY_BASE` em destaque (border + bg violeta sutil).
 * - `<pre>` em ScrollArea (max-h-[400px]) com o prompt completo composto.
 *
 * Importa do núcleo puro `@/lib/nex/prompt-compose` (NÃO de `prompt.ts`,
 * que é server-only com import de `pg`) — `composeSystemPrompt` é
 * isomórfico e roda no client sem custo.
 */

import { useMemo, useState } from "react";
import {
  BookText,
  ChevronRight,
  Copy,
  Maximize2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetBody, SheetHeader } from "@/components/ui/sheet";
import {
  IDENTITY_BASE,
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
}

export function PromptPreviewCard({
  config,
  kbDocs,
  accountUrls,
}: PromptPreviewCardProps) {
  const [maximized, setMaximized] = useState<boolean>(false);
  const [showIdentity, setShowIdentity] = useState<boolean>(false);

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
          <div className="flex shrink-0 items-center gap-2">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMaximized(true)}
              className="cursor-pointer"
              aria-label="Maximizar prompt em painel lateral"
            >
              <Maximize2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Maximizar
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <button
            type="button"
            onClick={() => setShowIdentity((v) => !v)}
            aria-expanded={showIdentity}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                showIdentity && "rotate-90",
              )}
              aria-hidden="true"
            />
            {showIdentity ? "Ocultar" : "Mostrar"} identidade fixa
          </button>

          {showIdentity ? (
            <pre
              data-testid="identity-base"
              className="max-h-[200px] overflow-auto rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground/90 dark:bg-violet-500/10"
            >
              {IDENTITY_BASE}
            </pre>
          ) : null}

          <ScrollArea className="max-h-[400px] rounded-lg border border-border bg-muted/40">
            <pre
              data-testid="prompt-preview"
              className="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground"
            >
              {prompt}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>

      <Sheet open={maximized} onOpenChange={setMaximized} width={640}>
        <SheetHeader onClose={() => setMaximized(false)}>
          Prompt completo
        </SheetHeader>
        <SheetBody className="flex min-h-0 flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Texto completo que será injetado como system prompt na próxima
            conversa.
          </p>
          <ScrollArea className="flex-1 rounded-lg border border-border bg-muted/40">
            <pre className="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground">
              {prompt}
            </pre>
          </ScrollArea>
        </SheetBody>
      </Sheet>
    </>
  );
}
