"use client";

/**
 * Card 3 — "Base de conhecimento" do Agente Nex (super_admin only).
 *
 * Mostra:
 *
 * - Total de caracteres consumido vs cap de 30.000 (com barra de progresso).
 * - Warning amarelo quando total > 25.000 e ≤ 30.000.
 * - Warning vermelho quando total > 30.000 (chars excedentes serão truncados
 *   na composição do system prompt — ver `composeSystemPrompt`).
 * - Lista de documentos com nome, tamanho do arquivo, contagem de chars e
 *   ação Excluir (com confirm() nativo, padrão da app — ver llm-config-form).
 * - Empty state amigável.
 * - Botão "Adicionar documento" → abre `<KbUploadDialog>`.
 *
 * Após upload/delete bem-sucedido, o componente chamador (page Server) faz
 * `router.refresh()` e recebe `initial` atualizado via prop.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deleteKbDocumentAction } from "@/lib/actions/nex-prompt";
import type { KbSummary } from "@/lib/nex/kb";
import { cn } from "@/lib/utils";

import { KbUploadDialog, formatFileSize } from "./kb-upload-dialog";

const KB_TOTAL_CAP = 30_000;
const KB_WARN_THRESHOLD = 25_000;

interface KbSectionProps {
  initial: KbSummary[];
}

export function KbSection({ initial }: KbSectionProps) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const totalChars = useMemo(
    () => initial.reduce((sum, d) => sum + (d.charCount ?? 0), 0),
    [initial],
  );
  const cappedTotal = Math.min(totalChars, KB_TOTAL_CAP);
  const overflowChars = Math.max(0, totalChars - KB_TOTAL_CAP);
  const progressPct = Math.min(
    100,
    Math.round((cappedTotal / KB_TOTAL_CAP) * 100),
  );
  const isOverLimit = totalChars > KB_TOTAL_CAP;
  const isNearLimit = !isOverLimit && totalChars > KB_WARN_THRESHOLD;

  function handleDelete(doc: KbSummary) {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Excluir "${doc.name}" da base de conhecimento? Esta ação não pode ser desfeita.`,
      );
      if (!ok) return;
    }
    setDeletingId(doc.id);
    startTransition(async () => {
      const result = await deleteKbDocumentAction(doc.id);
      setDeletingId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao excluir documento");
        return;
      }
      toast.success("Documento removido");
      router.refresh();
    });
  }

  const progressBarColor = isOverLimit
    ? "bg-destructive"
    : isNearLimit
      ? "bg-amber-500"
      : "bg-violet-500";

  return (
    <div className="space-y-4">
      {/* Header com total e progresso */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Total injetado no prompt
          </p>
          <p
            className="text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            <span
              className={cn(
                "font-semibold",
                isOverLimit
                  ? "text-destructive"
                  : isNearLimit
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-foreground",
              )}
            >
              {cappedTotal.toLocaleString("pt-BR")}
            </span>
            <span className="mx-1 text-muted-foreground/60">/</span>
            <span>{KB_TOTAL_CAP.toLocaleString("pt-BR")}</span>
            <span className="ml-1 text-muted-foreground/80">chars</span>
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Uso da base de conhecimento: ${progressPct}% de 30.000 caracteres`}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              progressBarColor,
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {isOverLimit ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <p className="leading-snug">
              <span className="font-semibold">
                {overflowChars.toLocaleString("pt-BR")} chars
              </span>{" "}
              excedendo o limite serão truncados na composição do prompt.
            </p>
          </div>
        ) : isNearLimit ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <p className="leading-snug">
              Próximo do limite (30.000 chars). Considere remover documentos
              antigos antes de adicionar novos.
            </p>
          </div>
        ) : null}
      </div>

      {/* Lista de documentos */}
      {initial.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
          <FileText
            className="h-7 w-7 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-foreground">
            Nenhum documento adicionado ainda.
          </p>
          <p className="text-xs text-muted-foreground">
            Envie um PDF ou TXT para enriquecer o contexto do Agente Nex.
          </p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Documentos da base de conhecimento">
          {initial.map((doc) => {
            const isDeleting = deletingId === doc.id;
            return (
              <li
                key={doc.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 transition-opacity",
                  isDeleting && "opacity-60",
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium text-foreground"
                    title={doc.name}
                  >
                    {doc.name}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    <span>{formatFileSize(doc.fileSize)}</span>
                    <span className="mx-1.5 text-muted-foreground/60">•</span>
                    <span>
                      {doc.charCount.toLocaleString("pt-BR")} chars
                    </span>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(doc)}
                  disabled={isDeleting}
                  aria-label={`Excluir documento ${doc.name}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Adicionar documento */}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => setUploadOpen(true)}
          className="border-border"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Adicionar documento
        </Button>
      </div>

      <KbUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
