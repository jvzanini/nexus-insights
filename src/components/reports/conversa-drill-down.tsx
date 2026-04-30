"use client";

// ConversaDrillDown — painel inline de detalhes que aparece ao expandir uma
// linha da tabela de conversas (Task 10 da release Conversas Poderoso).
//
// Mostra contato, tempos, etiquetas e atributos customizados completos sem
// truncar — colunas equivalentes na tabela passam a ficar invisíveis por
// default (continuam disponíveis via ColumnsToggle).

import { useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LabelsChips } from "@/components/reports/labels-chips";
import { OpenInChatwoot } from "@/components/reports/open-in-chatwoot";
import { formatPhone } from "@/lib/utils/format-phone";
import { detectDocument } from "@/lib/utils/format-document";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const MAX_VISIBLE_ATTRS = 30;

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "—";
  }
}

interface Props {
  row: ConversaRow;
  accountId: number;
}

export function ConversaDrillDown({ row, accountId }: Props) {
  const phone = row.contact.phone_number
    ? formatPhone(row.contact.phone_number) || row.contact.phone_number
    : "—";
  const doc = detectDocument({
    identifier: row.contact.identifier,
    additional_attributes: row.contact.additional_attributes,
  });
  const docDisplay = doc?.formatted ?? "—";

  const attrs = row.custom_attributes ?? {};
  const entries = Object.entries(attrs).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, MAX_VISIBLE_ATTRS);
  const hidden = entries.length - visible.length;

  return (
    <div
      role="region"
      aria-label={`Detalhes da conversa ${row.display_id}`}
      className="space-y-4 rounded-lg bg-muted/30 p-4 text-[13px]"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Contato
          </h4>
          <dl className="space-y-1">
            <DLRow label="Nome" value={row.contact.name ?? "—"} />
            <DLRow label="WhatsApp" value={phone} mono />
            <DLRow label="Documento" value={docDisplay} mono />
          </dl>
        </div>

        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tempos
          </h4>
          <dl className="space-y-1">
            <DLRow label="Criada em" value={formatDateTime(row.created_at)} />
            <DLRow
              label="Última atividade"
              value={formatDateTime(row.last_activity_at)}
            />
          </dl>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Etiquetas
        </h4>
        {row.labels.length > 0 ? (
          <LabelsChips labels={row.labels} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Atributos ({entries.length})
        </h4>
        {visible.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <ul className="grid gap-1 md:grid-cols-2">
            {visible.map(([k, v]) => {
              const raw =
                typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean"
                  ? String(v)
                  : JSON.stringify(v);
              return (
                <li
                  key={k}
                  className="flex items-baseline gap-2 break-all rounded-md border border-border/30 bg-card px-2 py-1"
                >
                  <span className="text-[11px] font-medium text-muted-foreground/80">
                    {k}:
                  </span>
                  <span className="text-[13px] text-foreground/90">{raw}</span>
                </li>
              );
            })}
          </ul>
        )}
        {hidden > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(true)}
            className="mt-2"
          >
            Ver mais ({hidden})
          </Button>
        ) : null}
      </div>

      <div className="flex justify-end border-t border-border pt-3">
        <OpenInChatwoot accountId={accountId} displayId={row.display_id} />
      </div>
    </div>
  );
}

function DLRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-32 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "text-[13px] text-foreground/90",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export default ConversaDrillDown;
