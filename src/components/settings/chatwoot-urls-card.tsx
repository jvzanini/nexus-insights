"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  setChatwootAccountUrlAction,
  type ChatwootAccountUrl,
} from "@/lib/actions/settings";
import type { KnownAccount } from "@/lib/chatwoot/accounts";

interface ChatwootUrlsCardProps {
  accounts: KnownAccount[];
  initial: ChatwootAccountUrl[];
}

interface RowInitial {
  publicUrl: string;
  label: string | null;
}

const SAVED_FLASH_MS = 2000;

export function ChatwootUrlsCard({ accounts, initial }: ChatwootUrlsCardProps) {
  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Link2 className="h-4 w-4 text-violet-500" />
          URLs Públicas Chatwoot
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Mapeie cada Account ID do Chatwoot à sua URL pública. O Agente Nex usa
          essas URLs para gerar deep-links nas respostas (ex.: abrir uma
          conversa direto no Chatwoot).
        </p>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {accounts.map(({ accountId }) => {
              const found = initial.find((u) => u.accountId === accountId);
              const rowInitial: RowInitial = {
                publicUrl: found?.publicUrl ?? "",
                label: found?.label ?? null,
              };
              return (
                <ChatwootUrlRow
                  key={accountId}
                  accountId={accountId}
                  initial={rowInitial}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-6 text-center">
      <p className="text-sm text-muted-foreground">
        Nenhuma conta Chatwoot detectada ainda. Aguarde a sincronização rodar ou
        verifique se a integração está ativa.
      </p>
    </div>
  );
}

interface ChatwootUrlRowProps {
  accountId: number;
  initial: RowInitial;
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function normalizeLabel(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ChatwootUrlRow({ accountId, initial }: ChatwootUrlRowProps) {
  const router = useRouter();
  const [publicUrl, setPublicUrl] = useState<string>(initial.publicUrl);
  const [labelValue, setLabelValue] = useState<string>(initial.label ?? "");
  const [isPending, startTransition] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);

  const normalizedUrl = normalizeUrl(publicUrl);
  const normalizedLabel = normalizeLabel(labelValue);

  const initialNormalizedUrl = normalizeUrl(initial.publicUrl);
  const initialNormalizedLabel = initial.label ?? null;

  const dirty =
    normalizedUrl !== initialNormalizedUrl ||
    normalizedLabel !== initialNormalizedLabel;

  function validate(): string | null {
    if (normalizedUrl.length === 0) {
      // Vazio é válido — significa "limpar/DELETE".
      return null;
    }
    let parsed: URL;
    try {
      parsed = new URL(normalizedUrl);
    } catch {
      return "URL inválida — use HTTPS.";
    }
    if (parsed.protocol !== "https:") {
      return "URL inválida — use HTTPS.";
    }
    if (normalizedUrl.length > 512) {
      return "URL muito longa (máx. 512 caracteres).";
    }
    return null;
  }

  function handleSave() {
    if (isPending || !dirty) return;
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    startTransition(async () => {
      const res = await setChatwootAccountUrlAction({
        accountId,
        publicUrl: normalizedUrl,
        label: normalizedLabel,
      });
      if (res.ok) {
        // Atualiza estado local pra refletir "salvo" (limpa dirty).
        setPublicUrl(normalizedUrl);
        setLabelValue(normalizedLabel ?? "");
        toast.success(
          normalizedUrl.length === 0
            ? "URL removida"
            : "URL salva",
        );
        setSavedFlash(true);
        window.setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
        router.refresh();
      } else {
        toast.error(res.error ?? "Falha ao salvar URL");
      }
    });
  }

  const displayName = normalizedLabel ?? `Conta ${accountId}`;

  return (
    <div
      data-testid={`chatwoot-url-row-${accountId}`}
      className="rounded-xl border border-border bg-background/40 p-3"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400">
          #{accountId}
        </span>
        <span className="truncate text-sm font-medium text-foreground">
          {displayName}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_auto]">
        <div className="space-y-1.5">
          <Label
            htmlFor={`chatwoot-url-input-${accountId}`}
            className="text-xs text-muted-foreground"
          >
            URL pública
          </Label>
          <Input
            id={`chatwoot-url-input-${accountId}`}
            data-testid={`chatwoot-url-input-${accountId}`}
            type="url"
            inputMode="url"
            placeholder="https://chat.exemplo.com"
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
            disabled={isPending}
            className="min-h-9"
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor={`chatwoot-url-label-${accountId}`}
            className="text-xs text-muted-foreground"
          >
            Apelido (opcional)
          </Label>
          <Input
            id={`chatwoot-url-label-${accountId}`}
            data-testid={`chatwoot-url-label-${accountId}`}
            type="text"
            placeholder="Ex.: Matriz, Filial Norte"
            maxLength={100}
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            disabled={isPending}
            className="min-h-9"
          />
        </div>

        <div className="flex items-end">
          <Button
            type="button"
            data-testid={`chatwoot-url-save-${accountId}`}
            onClick={handleSave}
            disabled={!dirty || isPending}
            className={cn(
              "min-h-9 cursor-pointer transition-all",
              savedFlash && "bg-emerald-600 hover:bg-emerald-600/90",
            )}
            aria-label={`Salvar URL da conta ${accountId}`}
          >
            {isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : savedFlash ? (
              <Check className="mr-1.5 h-4 w-4" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            {savedFlash ? "Salvo" : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
