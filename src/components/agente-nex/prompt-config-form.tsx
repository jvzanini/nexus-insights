"use client";

/**
 * Card "Comportamento" do Agente Nex (super_admin only).
 *
 * Campos:
 * - Personalidade (textarea, ≤ 500 chars).
 * - Tom (textarea, ≤ 500 chars).
 * - Guardrails (lista de até 20 itens × 300 chars).
 * - Toggle "Modo prompt manual" → revela textarea mono (≤ 50.000 chars)
 *   com warning explicativo e bloqueia Personalidade/Tom/Guardrails.
 *
 * Mudanças (T6c plan v0.16.0):
 * - "Modo override avançado" → "Modo prompt manual" + tooltip explicativo.
 * - Ativar OFF→ON dispara AlertDialog de confirmação (Cancelar/Ativar).
 * - Quando ON: badge "MODO MANUAL ATIVO" + texto auxiliar laranja em
 *   Personalidade/Tom/Guardrails ("Desativado pelo Modo manual ativo.
 *   Desligue acima para editar.").
 * - Salvar bloqueado se override ON + texto vazio (toast explicativo).
 *
 * Ações:
 * - "Pré-visualizar prompt completo" (chama previewSystemPromptAction → modal).
 * - "Salvar" (chama saveNexPromptConfigAction → toast + router.refresh()).
 *
 * Validações client (não bloqueiam server — server revalida):
 * - Add guardrail bloqueado se já houver 20.
 * - Contadores dinâmicos com cor de alerta perto do cap.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Eye,
  HelpCircle,
  Loader2,
  Plus,
  Save,
  Shield,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  previewSystemPromptAction,
  saveNexPromptConfigAction,
} from "@/lib/actions/nex-prompt";
import type { NexPromptConfig } from "@/lib/nex/prompt";
import { cn } from "@/lib/utils";

const MAX_PERSONALITY = 500;
const MAX_TONE = 500;
const MAX_GUARDRAIL = 300;
const MAX_GUARDRAILS = 20;
const MAX_OVERRIDE = 50_000;

const MANUAL_DISABLED_HELP =
  "Desativado pelo Modo manual ativo. Desligue acima para editar.";
const MANUAL_WARNING_TEXT =
  "O Modo manual desativa identidade fixa, personalidade, tom, guardrails, base de conhecimento e URLs públicas configuradas em /configuracoes. Continuar?";

interface PromptConfigFormProps {
  initial: NexPromptConfig;
  onSaved?: () => void;
}

function counterClass(current: number, max: number): string {
  const ratio = current / max;
  if (current > max) return "text-destructive";
  if (ratio >= 0.9) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export function PromptConfigForm({ initial, onSaved }: PromptConfigFormProps) {
  const router = useRouter();

  const [personality, setPersonality] = useState<string>(initial.personality);
  const [tone, setTone] = useState<string>(initial.tone);
  const [guardrails, setGuardrails] = useState<string[]>(
    initial.guardrails.length > 0 ? initial.guardrails : [],
  );
  const [overrideOn, setOverrideOn] = useState<boolean>(
    !!initial.advancedOverride && initial.advancedOverride.trim().length > 0,
  );
  const [override, setOverride] = useState<string>(initial.advancedOverride ?? "");

  const [isSaving, startSave] = useTransition();
  const [isPreviewLoading, startPreview] = useTransition();
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewText, setPreviewText] = useState<string>("");

  // AlertDialog de confirmação ao ativar Modo prompt manual.
  const [confirmActivateOpen, setConfirmActivateOpen] = useState<boolean>(false);

  const guardrailsCount = guardrails.length;
  const canAddGuardrail = guardrailsCount < MAX_GUARDRAILS;

  // Snapshot do form pra enviar ao server.
  const currentConfig: NexPromptConfig = useMemo(
    () => ({
      identityBase: initial.identityBase,
      personality,
      tone,
      guardrails: guardrails.map((g) => g.trim()).filter((g) => g.length > 0),
      advancedOverride: overrideOn ? override : null,
      audioInputEnabled: initial.audioInputEnabled,
      kbEnabled: initial.kbEnabled,
      terminology: initial.terminology ?? {},
      suggestionsEnabled: initial.suggestionsEnabled ?? false,
    }),
    [
      personality,
      tone,
      guardrails,
      overrideOn,
      override,
      initial.identityBase,
      initial.audioInputEnabled,
      initial.kbEnabled,
      initial.terminology,
      initial.suggestionsEnabled,
    ],
  );

  function handleAddGuardrail() {
    if (!canAddGuardrail) {
      toast.error(`Limite de ${MAX_GUARDRAILS} guardrails atingido`);
      return;
    }
    setGuardrails((prev) => [...prev, ""]);
  }

  function handleGuardrailChange(idx: number, next: string) {
    setGuardrails((prev) => {
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
  }

  function handleRemoveGuardrail(idx: number) {
    setGuardrails((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleOverrideToggle(checked: boolean) {
    if (checked) {
      // Ativar requer confirmação explícita.
      setConfirmActivateOpen(true);
      return;
    }
    setOverrideOn(false);
  }

  function handleConfirmActivate() {
    setOverrideOn(true);
    setConfirmActivateOpen(false);
  }

  function handleCancelActivate() {
    setConfirmActivateOpen(false);
  }

  function handlePreview() {
    startPreview(async () => {
      const result = await previewSystemPromptAction(currentConfig);
      if (!result.ok || !result.data) {
        toast.error(result.error ?? "Erro ao gerar pré-visualização");
        return;
      }
      setPreviewText(result.data.composedPrompt);
      setPreviewOpen(true);
    });
  }

  function handleSave() {
    // Bloqueio: override on + texto vazio (depois do trim).
    if (overrideOn && override.trim().length === 0) {
      toast.error("Modo manual ativo precisa de texto não-vazio.");
      return;
    }
    startSave(async () => {
      const result = await saveNexPromptConfigAction(currentConfig);
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao salvar configuração");
        return;
      }
      toast.success("Configuração do Agente Nex salva");
      router.refresh();
      onSaved?.();
    });
  }

  const busy = isSaving || isPreviewLoading;
  const fieldsDisabled = overrideOn || busy;

  return (
    <div className="space-y-6">
      {/* Badge MODO MANUAL ATIVO no topo do card de Comportamento */}
      {overrideOn ? (
        <div
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          MODO MANUAL ATIVO
        </div>
      ) : null}

      {/* Personalidade */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="nex-personality" className="gap-2">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            Personalidade
          </Label>
          <span
            className={cn(
              "text-xs tabular-nums",
              counterClass(personality.length, MAX_PERSONALITY),
            )}
          >
            {personality.length}/{MAX_PERSONALITY}
          </span>
        </div>
        <Textarea
          id="nex-personality"
          value={personality}
          onChange={(e) => setPersonality(e.currentTarget.value)}
          maxLength={MAX_PERSONALITY}
          rows={3}
          placeholder="Ex.: Direto, prático, prefere bullets curtos. Evita rodeios."
          disabled={fieldsDisabled}
          aria-describedby="nex-personality-help"
        />
        <p id="nex-personality-help" className="text-xs text-muted-foreground">
          Como o agente se comporta — voz, foco, atitude geral.
        </p>
        {overrideOn ? (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {MANUAL_DISABLED_HELP}
          </p>
        ) : null}
      </div>

      {/* Tom */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="nex-tone" className="gap-2">
            <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
            Tom
          </Label>
          <span
            className={cn(
              "text-xs tabular-nums",
              counterClass(tone.length, MAX_TONE),
            )}
          >
            {tone.length}/{MAX_TONE}
          </span>
        </div>
        <Textarea
          id="nex-tone"
          value={tone}
          onChange={(e) => setTone(e.currentTarget.value)}
          maxLength={MAX_TONE}
          rows={3}
          placeholder="Ex.: Profissional, mas amigável. Em pt-BR. Use 'você'."
          disabled={fieldsDisabled}
          aria-describedby="nex-tone-help"
        />
        <p id="nex-tone-help" className="text-xs text-muted-foreground">
          Estilo de escrita — formalidade, calor humano, vocabulário.
        </p>
        {overrideOn ? (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {MANUAL_DISABLED_HELP}
          </p>
        ) : null}
      </div>

      {/* Guardrails */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="gap-2">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            Guardrails ({guardrailsCount}/{MAX_GUARDRAILS})
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Regras que o agente nunca deve violar (ex.: &quot;Nunca exponha dados
          de outro tenant&quot;, &quot;Não simule ações destrutivas&quot;).
        </p>

        {guardrailsCount === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background/40 px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhum guardrail definido. Clique em &quot;Adicionar regra&quot; para
            começar.
          </div>
        ) : (
          <ul className="space-y-2">
            {guardrails.map((g, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <div className="flex flex-1 flex-col gap-1">
                  <Input
                    aria-label={`Guardrail ${idx + 1}`}
                    value={g}
                    onChange={(e) =>
                      handleGuardrailChange(idx, e.currentTarget.value)
                    }
                    maxLength={MAX_GUARDRAIL}
                    placeholder={`Regra ${idx + 1}`}
                    disabled={fieldsDisabled}
                    className="min-h-[40px]"
                  />
                  <span
                    className={cn(
                      "self-end text-[10px] tabular-nums",
                      counterClass(g.length, MAX_GUARDRAIL),
                    )}
                  >
                    {g.length}/{MAX_GUARDRAIL}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRemoveGuardrail(idx)}
                  disabled={fieldsDisabled}
                  aria-label={`Remover guardrail ${idx + 1}`}
                  className="mt-1 cursor-pointer text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddGuardrail}
          disabled={!canAddGuardrail || fieldsDisabled}
          className="cursor-pointer"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Adicionar regra
        </Button>
        {overrideOn ? (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {MANUAL_DISABLED_HELP}
          </p>
        ) : null}
      </div>

      {/* Modo prompt manual */}
      <div className="space-y-3 rounded-xl border border-border bg-background/40 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-foreground">
                Modo prompt manual
              </p>
              <span
                role="img"
                aria-label="Ajuda sobre Modo prompt manual"
                title="Substitui completamente o prompt composto (identidade fixa, personalidade, tom, guardrails, KB e URLs públicas) por um texto bruto. Use apenas se você sabe exatamente o que está fazendo."
                className="inline-flex h-4 w-4 cursor-help items-center justify-center text-muted-foreground"
              >
                <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Substitui o prompt composto por um texto bruto. Use apenas se você
              sabe exatamente o que está fazendo.
            </p>
          </div>
          <span className="relative inline-flex h-11 w-11 items-center justify-center shrink-0">
            <Switch
              checked={overrideOn}
              onCheckedChange={handleOverrideToggle}
              disabled={busy}
              aria-label={
                overrideOn
                  ? "Desativar Modo prompt manual"
                  : "Ativar Modo prompt manual"
              }
            />
          </span>
        </div>

        {overrideOn ? (
          <div className="space-y-2">
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <p className="leading-snug">{MANUAL_WARNING_TEXT}</p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="nex-override" className="text-xs">
                Prompt completo (manual)
              </Label>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  counterClass(override.length, MAX_OVERRIDE),
                )}
              >
                {override.length.toLocaleString("pt-BR")}/
                {MAX_OVERRIDE.toLocaleString("pt-BR")}
              </span>
            </div>
            <Textarea
              id="nex-override"
              value={override}
              onChange={(e) => setOverride(e.currentTarget.value)}
              maxLength={MAX_OVERRIDE}
              rows={12}
              placeholder="prompt completo — substitui Personalidade, Tom, Guardrails e KB"
              disabled={busy}
              className="font-mono text-xs"
            />
          </div>
        ) : null}
      </div>

      {/* Ações */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={handlePreview}
          disabled={busy}
          className="min-h-[44px] cursor-pointer"
        >
          {isPreviewLoading ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Eye className="mr-1.5 h-4 w-4" />
          )}
          Pré-visualizar prompt completo
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="min-h-[44px] cursor-pointer"
        >
          {isSaving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Salvar
        </Button>
      </div>

      {/* AlertDialog de confirmação para ativar Modo prompt manual */}
      <AlertDialog
        open={confirmActivateOpen}
        onOpenChange={(open) => {
          if (!open) handleCancelActivate();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle
                className="h-5 w-5 text-amber-500"
                aria-hidden="true"
              />
              Ativar Modo prompt manual?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {MANUAL_WARNING_TEXT}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={handleCancelActivate}
              className="cursor-pointer"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={handleConfirmActivate}
              className="cursor-pointer bg-amber-600 text-white hover:bg-amber-700"
            >
              Ativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de pré-visualização */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Prompt completo</DialogTitle>
            <DialogDescription>
              Texto que o Agente Nex receberá como system prompt na próxima
              conversa.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] rounded-lg border border-border bg-muted/40">
            <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-foreground">
              {previewText}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
