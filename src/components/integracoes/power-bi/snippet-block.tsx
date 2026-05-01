"use client";

/**
 * SnippetBlock — bloco de código copiável reutilizável para a Connect page
 * do Power BI.
 *
 * Layout:
 *  - Label opcional acima (uppercase tracking-wide).
 *  - <pre> com font-mono, fundo violet 500/5, border violet 500/20, rounded-lg.
 *  - Botão "Copy" no canto superior direito (icon-only).
 *  - Multiline opcional (pre-wrap + max-h scroll); single-line truncate.
 *
 * Acessibilidade:
 *  - Botão tem aria-label "Copiar <label>" quando label existe, senão
 *    "Copiar valor".
 *  - Toast "Copiado!" verde via sonner.
 *  - Fallback a textarea + execCommand quando Clipboard API indisponível.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  value: string;
  multiline?: boolean;
  className?: string;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback abaixo
  }
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function SnippetBlock({ label, value, multiline = false, className }: Props) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  async function handleCopy() {
    const ok = await copyText(value);
    if (!ok) {
      toast.error("Falha ao copiar — tente manualmente.");
      return;
    }
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 1800);
    toast.success("Copiado!");
  }

  const ariaLabel = label ? `Copiar ${label}` : "Copiar valor";

  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-testid="snippet-block">
      {label ? (
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      ) : null}
      <div className="relative">
        <pre
          className={cn(
            "rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 pr-12 font-mono text-[12px] leading-relaxed text-foreground",
            multiline
              ? "max-h-72 overflow-auto whitespace-pre-wrap break-words"
              : "overflow-x-auto whitespace-nowrap",
          )}
          data-testid="snippet-block-content"
        >
          {value}
        </pre>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={handleCopy}
          aria-label={ariaLabel}
          title={ariaLabel}
          data-testid="snippet-block-copy"
          className="absolute right-1.5 top-1.5 h-7 w-7 cursor-pointer text-muted-foreground hover:bg-violet-500/15 hover:text-violet-600 dark:hover:text-violet-300"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  );
}
