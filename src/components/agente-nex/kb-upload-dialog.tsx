"use client";

/**
 * Dialog modal de upload de documento da Base de Conhecimento (KB) do Agente Nex.
 *
 * Aceita PDF (`application/pdf`) ou TXT (`text/plain`) com até 5 MB. Validações
 * client-side antes de enviar para `uploadKbDocumentAction`:
 *
 * - extensão / mime aceita
 * - tamanho ≤ 5 MB
 *
 * Em caso de sucesso, mostra toast, fecha o modal e dispara `router.refresh()`.
 * O server-action ainda revalida tudo (ver §upload-kb em nex-prompt.ts).
 *
 * Acessibilidade: aria-label no input file (escondido via classe), aria-live
 * para erros de validação, foco no input ao abrir.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadKbDocumentAction } from "@/lib/actions/nex-prompt";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_MIMES = new Set(["application/pdf", "text/plain"]);
const ACCEPTED_EXTENSIONS = [".pdf", ".txt"];

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

interface KbUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KbUploadDialog({ open, onOpenChange }: KbUploadDialogProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset interno sempre que o dialog abrir/fechar.
  useEffect(() => {
    if (!open) {
      setFile(null);
      setError(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [open]);

  function validate(f: File): string | null {
    const mime = f.type || "";
    const lowerName = f.name.toLowerCase();
    const validExt = ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!ACCEPTED_MIMES.has(mime) && !validExt) {
      return "Formato inválido. Apenas PDF ou TXT.";
    }
    if (f.size === 0) return "Arquivo vazio.";
    if (f.size > MAX_FILE_BYTES) {
      return `Arquivo excede 5 MB (${formatFileSize(f.size)}).`;
    }
    return null;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      setError(null);
      return;
    }
    const v = validate(f);
    if (v) {
      setError(v);
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  }

  function handleClearFile() {
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleSubmit() {
    if (!file) {
      setError("Selecione um arquivo.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", file.name);
    startTransition(async () => {
      const result = await uploadKbDocumentAction(fd);
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao enviar documento");
        return;
      }
      toast.success("Documento adicionado à base de conhecimento");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return; // não permitir fechar durante upload
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar documento</DialogTitle>
          <DialogDescription>
            Envie um arquivo PDF ou TXT (máx. 5 MB). O texto extraído será
            injetado no prompt do Agente Nex.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!file ? (
            <label
              htmlFor="kb-upload-input"
              className={cn(
                "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-center transition-colors",
                "hover:border-violet-400/60 hover:bg-violet-500/5",
                "focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/30",
                isPending && "pointer-events-none opacity-60",
              )}
            >
              <Upload
                className="h-7 w-7 text-muted-foreground group-hover:text-violet-500"
                aria-hidden="true"
              />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  Clique para selecionar um arquivo
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF ou TXT até 5 MB
                </p>
              </div>
              <input
                ref={inputRef}
                id="kb-upload-input"
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                className="sr-only"
                onChange={handleFileChange}
                disabled={isPending}
                aria-label="Selecionar arquivo PDF ou TXT (máx. 5 MB)"
              />
            </label>
          ) : (
            <div
              className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5"
              data-testid="kb-upload-preview"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium text-foreground"
                  title={file.name}
                >
                  {file.name}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatFileSize(file.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleClearFile}
                disabled={isPending}
                aria-label="Remover arquivo selecionado"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {error ? (
            <p
              role="alert"
              aria-live="polite"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="-mx-6 -mb-6 flex flex-col-reverse gap-2 rounded-b-2xl border-t border-border bg-secondary/50 p-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="border-border text-muted-foreground hover:bg-accent"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!file || isPending}
            aria-label="Salvar documento na base de conhecimento"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Enviando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Salvar
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
