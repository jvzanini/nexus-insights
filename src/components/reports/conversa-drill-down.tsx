"use client";

// ConversaDrillDown — painel inline com 3 seções (WhatsApp / Etiquetas /
// Atributos). Cada seção é uma linha com rótulo à esquerda (min-w 100px
// alinhando colunas) e conteúdo flex-wrap à direita. Sem espaço fantasma.
// Botão "Abrir no Chatwoot" migrou para a coluna #ID.

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LabelsChips } from "@/components/reports/labels-chips";
import { formatPhone } from "@/lib/utils/format-phone";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const ATTRS_PER_PAGE = 24;

interface Props {
  row: ConversaRow;
  /** Mantido na interface por retro-compat com chamadas existentes; não usado. */
  accountId?: number;
}

export function ConversaDrillDown({ row }: Props) {
  const phone = row.contact.phone_number
    ? formatPhone(row.contact.phone_number) || row.contact.phone_number
    : null;

  const attrs = row.custom_attributes ?? {};
  const entries = Object.entries(attrs).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, ATTRS_PER_PAGE);
  const hidden = Math.max(entries.length - visible.length, 0);

  return (
    <div
      role="region"
      aria-label={`Detalhes da conversa ${row.display_id}`}
      className="space-y-2 bg-muted/30 px-4 py-3 text-[13px]"
    >
      {/* WhatsApp */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="min-w-[100px] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          WhatsApp
        </span>
        <span className="font-mono text-[14px] tabular-nums text-foreground">
          {phone ?? "—"}
        </span>
      </div>

      {/* Etiquetas */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-[100px] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Etiquetas
        </span>
        {row.labels && row.labels.length > 0 ? (
          <LabelsChips labels={row.labels} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {/* Atributos */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-[100px] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Atributos{" "}
          <span className="text-muted-foreground/70 tabular-nums">
            ({entries.length})
          </span>
        </span>
        {entries.length === 0 ? (
          <span className="text-muted-foreground">— sem atributos</span>
        ) : (
          <div className="inline-flex flex-wrap items-center gap-1.5">
            {visible.map(([k, v]) => {
              const raw =
                typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean"
                  ? String(v)
                  : JSON.stringify(v);
              return (
                <span
                  key={k}
                  className="inline-flex items-baseline gap-x-1 break-all rounded-md border border-border/30 bg-card px-2 py-0.5"
                >
                  <span className="text-[11px] font-medium text-muted-foreground/80">
                    {k}:
                  </span>
                  <span className="text-[12px] text-foreground/90">{raw}</span>
                </span>
              );
            })}
            {hidden > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(true)}
                className="h-7 text-[11px]"
              >
                Ver mais ({hidden})
              </Button>
            ) : null}
            {showAll && entries.length > ATTRS_PER_PAGE ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(false)}
                className="h-7 text-[11px]"
              >
                Recolher
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default ConversaDrillDown;
