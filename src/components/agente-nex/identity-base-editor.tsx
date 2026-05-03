"use client";

/**
 * IdentityBaseEditor — editor do prompt-base do Agente Nex (super_admin only).
 *
 * Textarea grande com o texto-base atual (custom do DB OU IDENTITY_BASE hardcoded
 * default). Botões "Restaurar padrão" (só aparece se isCustom) e "Salvar"
 * (disabled quando !dirty || overLimit).
 *
 * Server Actions: saveIdentityBaseAction(text) e resetIdentityBaseAction()
 * (ambos super_admin-gated). Após sucesso: router.refresh() + onSaved().
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  saveIdentityBaseAction,
  resetIdentityBaseAction,
} from "@/lib/actions/nex-prompt";
import { cn } from "@/lib/utils";

const MAX_LEN = 5_000;

interface IdentityBaseEditorProps {
  /** Texto atual do prompt-base (DB se customizado, IDENTITY_BASE hardcoded senão). */
  current: string;
  /** True quando há texto customizado no DB. */
  isCustom: boolean;
  /** Callback após save bem-sucedido — usado pelo Dialog pra fechar. */
  onSaved: () => void;
}

function counterClass(len: number, max: number): string {
  const ratio = len / max;
  if (len > max) return "text-destructive";
  if (ratio >= 0.9) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export function IdentityBaseEditor({
  current,
  isCustom,
  onSaved,
}: IdentityBaseEditorProps) {
  const router = useRouter();
  const [text, setText] = useState<string>(current);
  const [isSaving, startSave] = useTransition();
  const [isResetting, startReset] = useTransition();

  const dirty = text !== current;

  function handleSave() {
    if (text.trim().length === 0) {
      toast.error("Texto não pode ficar vazio");
      return;
    }
    startSave(async () => {
      const result = await saveIdentityBaseAction(text);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Prompt do agente atualizado");
      router.refresh();
      onSaved();
    });
  }

  function handleReset() {
    if (isCustom || dirty) {
      const ok =
        typeof window !== "undefined"
          ? window.confirm(
              "Restaurar o prompt para o texto padrão do Agente Nex? O texto customizado será descartado.",
            )
          : true;
      if (!ok) return;
    }
    startReset(async () => {
      const result = await resetIdentityBaseAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Prompt restaurado para o padrão");
      router.refresh();
      onSaved();
    });
  }

  const busy = isSaving || isResetting;
  const overLimit = text.length > MAX_LEN;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="identity-base-textarea" className="text-sm">
          Prompt do agente {isCustom ? "(customizado)" : "(padrão)"}
        </Label>
        <span
          className={cn("text-xs tabular-nums", counterClass(text.length, MAX_LEN))}
        >
          {text.length}/{MAX_LEN}
        </span>
      </div>
      <Textarea
        id="identity-base-textarea"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        rows={18}
        disabled={busy}
        maxLength={MAX_LEN + 100}
        className="font-mono text-xs leading-relaxed max-h-[60vh]"
        aria-label="Prompt completo do Agente Nex"
        aria-describedby="identity-base-help"
      />
      <p id="identity-base-help" className="text-xs text-muted-foreground">
        Texto-base do Agente Nex — define identidade, postura e regras de operação.
        <strong className="font-semibold"> Personalidade, Tom, Guardrails e Modo manual</strong> continuam sendo editados na seção <strong>Comportamento</strong> abaixo (são camadas adicionais aplicadas DEPOIS deste prompt-base).
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {isCustom ? (
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={busy}
            className="cursor-pointer min-h-[44px]"
          >
            {isResetting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-4 w-4" />
            )}
            Restaurar padrão
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={handleSave}
          disabled={busy || overLimit || !dirty}
          className="cursor-pointer min-h-[44px]"
        >
          {isSaving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Salvar
        </Button>
      </div>
    </div>
  );
}
