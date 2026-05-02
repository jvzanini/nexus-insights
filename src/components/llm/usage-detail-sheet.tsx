"use client";

import { AlertTriangle, Clipboard } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetFooter,
  SheetHeader,
} from "@/components/ui/sheet";
import { formatDuration } from "@/lib/format/date";
import type { UsageDetailRow } from "@/lib/llm/queries/usage-stats";
import { cn } from "@/lib/utils";

/**
 * UsageDetailSheet — drill-down de uma chamada do LLM (T5k, plan v0.16.0).
 *
 * Comportamento:
 * - Drawer lateral direito (`w-[520px]`; `w-full` em < 640 px) com 5 seções:
 *   Identificação → Tokens → Duração → Custo → Erro (condicional).
 * - Whisper legado (`whisper-1`): tokens substituídos por "—" + nota explicativa
 *   ("cobrado por minuto, legado"), pois o billing não usa tokens. Para o
 *   default v0.20+ (`gpt-4o-mini-transcribe`), tokens reais são exibidos
 *   normalmente — sem nota especial.
 * - Cotação USD→BRL: exibe o valor armazenado na linha (`usdToBrlRate`); quando
 *   `null` (chamadas anteriores à v0.10), mostra mensagem informativa em vez do
 *   valor. `currentSpread` é informativo (spread atual aplicado nas próximas
 *   chamadas) e usado na "cotação base estimada" (rate / spread).
 * - Action "Copiar JSON" copia a row inteira em JSON formatado para clipboard.
 * - Footer com botão "Fechar" (também há `X` no header via `SheetHeader`).
 *
 * Props:
 * - `row` é `null` quando o sheet está fechado / sem seleção; o conteúdo não é
 *   renderizado nesse caso (evita NPE em getters).
 */

export interface UsageDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: UsageDetailRow | null;
  /** Spread atual de USD→BRL (informativo). Default 1 (sem spread). */
  currentSpread?: number;
}

const numberFmt = new Intl.NumberFormat("pt-BR");
const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
});
const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});
const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatDateBr(iso: string): string {
  try {
    return dateFmt.format(new Date(iso));
  } catch {
    return iso;
  }
}

function isWhisperModel(model: string): boolean {
  return /whisper/i.test(model);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {children}
      </dl>
    </section>
  );
}

function Field({
  label,
  value,
  mono = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-sm text-foreground",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function UsageDetailSheet({
  open,
  onOpenChange,
  row,
  currentSpread = 1,
}: UsageDetailSheetProps) {
  const handleCopy = useCallback(async () => {
    if (!row) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(row, null, 2));
      toast.success("JSON copiado para a área de transferência");
    } catch (err) {
      console.warn("[usage-detail-sheet] clipboard error:", err);
      toast.error("Não foi possível copiar o JSON");
    }
  }, [row]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} width={520}>
      {row ? (
        <>
          <SheetHeader onClose={handleClose}>Detalhes da chamada</SheetHeader>
          <SheetBody className="space-y-6 px-5 py-5">
            <IdentificationSection row={row} />
            <TokensSection row={row} />
            <DurationSection row={row} />
            <CostSection row={row} currentSpread={currentSpread} />
            {row.errorMessage ? (
              <ErrorSection message={row.errorMessage} />
            ) : null}
          </SheetBody>
          <SheetFooter className="justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
            >
              <Clipboard aria-hidden />
              Copiar JSON
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleClose}
            >
              Fechar
            </Button>
          </SheetFooter>
        </>
      ) : null}
    </Sheet>
  );
}

function IdentificationSection({ row }: { row: UsageDetailRow }) {
  return (
    <Section title="Identificação">
      <Field label="ID" value={row.id} mono className="sm:col-span-2" />
      <Field label="Data / hora (BRT)" value={formatDateBr(row.createdAt)} />
      <Field label="Provider" value={row.provider} />
      <Field label="Modelo" value={<span className="font-mono">{row.model}</span>} />
      <Field
        label="Usuário"
        value={
          row.userId ? (
            <span className="font-mono">{row.userId}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
      />
    </Section>
  );
}

function TokensSection({ row }: { row: UsageDetailRow }) {
  const isWhisper = isWhisperModel(row.model);
  const dash = <span className="text-muted-foreground">—</span>;
  return (
    <Section title="Tokens">
      <Field
        label="Entrada"
        value={isWhisper ? dash : numberFmt.format(row.tokensInput)}
        mono={!isWhisper}
      />
      <Field
        label="Saída"
        value={isWhisper ? dash : numberFmt.format(row.tokensOutput)}
        mono={!isWhisper}
      />
      <Field
        label="Prompt (chars)"
        value={
          row.promptChars == null ? dash : numberFmt.format(row.promptChars)
        }
        mono={row.promptChars != null}
      />
      <Field
        label="Resposta (chars)"
        value={
          row.responseChars == null
            ? dash
            : numberFmt.format(row.responseChars)
        }
        mono={row.responseChars != null}
      />
      {row.model === "whisper-1" ? (
        <p className="col-span-full text-xs italic text-muted-foreground">
          Whisper é cobrado por minuto. Tokens não se aplicam a chamadas de
          áudio (legado).
        </p>
      ) : null}
    </Section>
  );
}

function DurationSection({ row }: { row: UsageDetailRow }) {
  return (
    <Section title="Duração">
      <Field
        label="Tempo total"
        value={
          row.durationMs == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            formatDuration(row.durationMs)
          )
        }
        mono={row.durationMs != null}
      />
    </Section>
  );
}

function CostSection({
  row,
  currentSpread,
}: {
  row: UsageDetailRow;
  currentSpread: number;
}) {
  const hasRate = row.usdToBrlRate != null;
  const hasBrl = row.costBrl != null;
  const baseRate =
    hasRate && currentSpread > 0
      ? (row.usdToBrlRate as number) / currentSpread
      : null;

  return (
    <Section title="Custo">
      <Field
        label="Custo bruto (USD)"
        value={usdFmt.format(row.costUsd)}
        mono
      />
      <Field
        label="Cotação aplicada (USD→BRL)"
        value={
          hasRate ? (
            <span className="font-mono tabular-nums">
              {(row.usdToBrlRate as number).toFixed(4)}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Cotação não armazenada (chamada anterior à v0.10)
            </span>
          )
        }
      />
      <Field
        label="Spread cartão (atual)"
        value={
          <span className="font-mono tabular-nums">
            {currentSpread.toFixed(4)}
          </span>
        }
      />
      <Field
        label="Custo final (BRL)"
        value={
          hasBrl ? (
            brlFmt.format(row.costBrl as number)
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
        mono={hasBrl}
      />
      {baseRate != null ? (
        <Field
          label="Cotação base (estimada)"
          value={
            <span className="font-mono tabular-nums">
              {baseRate.toFixed(4)}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                (estimativa usando spread atual)
              </span>
            </span>
          }
          className="sm:col-span-2"
        />
      ) : null}
    </Section>
  );
}

function ErrorSection({ message }: { message: string }) {
  return (
    <section
      role="alert"
      className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive"
    >
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Erro
      </h3>
      <p className="break-words font-mono text-sm">{message}</p>
    </section>
  );
}
