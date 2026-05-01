"use client";

/**
 * Form pra adicionar URL como documento de Base de Conhecimento (KB).
 *
 * Usado dentro do `KbUploadDialog` na aba "URL". Validação client-side
 * minimalista (nome 1-200 chars, URL parseável + protocolo HTTPS) — a
 * validação real (SSRF block, content-type, fetch timeout, html-to-text)
 * roda no server-action `addKbUrlAction`.
 *
 * Estados:
 * - error: mensagem inline (aria-live) pra erros client-side de input
 * - isPending: useTransition durante o action; bloqueia botão + inputs
 *
 * Em sucesso: toast.success + onSuccess() + router.refresh().
 * Em erro do action: toast.error com mensagem específica do server.
 *
 * Acessibilidade: labels visíveis, aria-invalid quando há erro, aria-live
 * polite na mensagem de erro, autoFocus no nome ao abrir.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addKbUrlAction } from "@/lib/actions/nex-prompt";

const MAX_NAME = 200;
const MAX_URL = 2048;

interface KbUrlFormProps {
  onSuccess: () => void;
  isDisabled?: boolean;
}

function validateClientSide(name: string, url: string): string | null {
  const trimmedName = name.trim();
  if (!trimmedName) return "Informe um nome para o conteúdo da URL.";
  if (trimmedName.length > MAX_NAME) {
    return `Nome muito longo (máx. ${MAX_NAME} caracteres).`;
  }
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return "Informe a URL.";
  if (trimmedUrl.length > MAX_URL) {
    return `URL muito longa (máx. ${MAX_URL} caracteres).`;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmedUrl);
  } catch {
    return "URL inválida — use HTTPS.";
  }
  if (parsed.protocol !== "https:") {
    return "URL inválida — use HTTPS.";
  }
  return null;
}

export function KbUrlForm({ onSuccess, isDisabled = false }: KbUrlFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const disabled = isDisabled || isPending;

  function handleSubmit() {
    const validation = validateClientSide(name, url);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    const payload = { name: name.trim(), url: url.trim() };
    startTransition(async () => {
      const result = await addKbUrlAction(payload);
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao adicionar URL");
        return;
      }
      toast.success("URL adicionada à base de conhecimento");
      setName("");
      setUrl("");
      onSuccess();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="kb-url-name">Nome</Label>
        <Input
          id="kb-url-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Política de treino do parceiro"
          maxLength={MAX_NAME}
          disabled={disabled}
          aria-invalid={!!error}
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="kb-url-input">URL</Label>
        <Input
          id="kb-url-input"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://exemplo.com/pagina"
          maxLength={MAX_URL}
          disabled={disabled}
          aria-invalid={!!error}
          inputMode="url"
        />
        <p className="text-xs text-muted-foreground">
          Apenas HTTPS. O conteúdo público da página será extraído como texto
          (máx. 5 MB).
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={disabled}
          aria-label="Adicionar URL à base de conhecimento"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Adicionando...
            </>
          ) : (
            <>
              <Globe className="h-4 w-4" aria-hidden="true" />
              Adicionar URL
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
