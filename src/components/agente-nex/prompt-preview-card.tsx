"use client";

/**
 * PromptPreviewCard — preview client-side do system prompt do Agente Nex.
 *
 * Card com:
 * - Título "Prompt completo do Agente Nex" + subtítulo (atualização em tempo real).
 * - Banner italic deixando claro que o preview é somente leitura.
 * - Botões "Copiar" (clipboard + toast), "Maximizar" (Dialog centralizado) e
 *   "Editar" (smooth-scroll para `#prompt-edit-form`).
 * - Toggle "Ver identidade fixa do agente (somente leitura)" (collapsible
 *   default closed) com parágrafo explicativo + `IDENTITY_BASE` em destaque.
 * - `<pre>` em ScrollArea (max-h-[400px]) com o prompt completo composto.
 *   `overflow-x-hidden` na ScrollArea + `min-w-0` no `<pre>` previnem o
 *   overflow horizontal das tags pré-formatadas (ex.: `<Idioma>`).
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
  Pencil,
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
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  function handleEditScroll() {
    document
      .getElementById("prompt-edit-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleEditFromMaximized() {
    setMaximized(false);
    setTimeout(() => {
      document
        .getElementById("prompt-edit-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMaximized(true)}
              className="cursor-pointer"
              aria-label="Maximizar prompt em painel centralizado"
            >
              <Maximize2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Maximizar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleEditScroll}
              className="cursor-pointer"
              aria-label="Ir para os campos de edição"
            >
              <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Editar
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <p className="text-xs italic text-muted-foreground">
            Preview somente leitura. Para editar, use os campos abaixo
            (Personalidade · Tom · Guardrails · Modo manual).
          </p>

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
            {showIdentity
              ? "Ocultar identidade fixa"
              : "Ver identidade fixa do agente (somente leitura)"}
          </button>

          {showIdentity ? (
            <>
              <p className="text-xs text-muted-foreground">
                Texto-base imutável que blinda a identidade do Agente Nex.
                Personalidade e Tom (campos abaixo) são camadas adicionais que
                VOCÊ controla.
              </p>
              <pre
                data-testid="identity-base"
                className="max-h-[200px] min-w-0 overflow-auto rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground/90 dark:bg-violet-500/10"
              >
                {IDENTITY_BASE}
              </pre>
            </>
          ) : null}

          <ScrollArea className="max-h-[400px] w-full overflow-x-hidden rounded-lg border border-border bg-muted/40">
            <pre
              data-testid="prompt-preview"
              aria-readonly="true"
              className="min-w-0 cursor-text p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground"
            >
              {prompt}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={maximized} onOpenChange={setMaximized}>
        <DialogContent className="flex max-h-[85vh] max-w-[min(900px,92vw)] flex-col gap-3 p-6 sm:max-w-[min(900px,92vw)]">
          <div className="flex items-start justify-between gap-2 pr-9">
            <DialogTitle>Prompt completo do Agente Nex</DialogTitle>
            <div className="flex flex-wrap items-center gap-2">
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
                variant="default"
                size="sm"
                onClick={handleEditFromMaximized}
                className="cursor-pointer"
              >
                <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Editar prompt
              </Button>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1 w-full overflow-x-hidden rounded-lg border border-border bg-muted/40">
            <pre className="min-w-0 cursor-text p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground">
              {prompt}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
