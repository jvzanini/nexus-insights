"use client";

// ConversaDrillDown — painel inline minimalista que expande ao clicar na linha.
// Mostra APENAS WhatsApp formatado completo + atributos chave:valor sem
// reticências + botão "Abrir no Chatwoot". Dados que já estão na linha
// (Nome, Status, Atendente, Estado, Departamento, Prioridade, Tempos) NÃO
// são repetidos — drill-down só serve pra exibir o que não couber na grade.

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { OpenInChatwoot } from "@/components/reports/open-in-chatwoot";
import { formatPhone } from "@/lib/utils/format-phone";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

const ATTRS_PER_PAGE = 24;

interface Props {
  row: ConversaRow;
  accountId: number;
}

export function ConversaDrillDown({ row, accountId }: Props) {
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
      className="space-y-3 bg-muted/30 p-4 text-[13px]"
    >
      {/* WhatsApp completo (estava com reticências antes). */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          WhatsApp
        </span>
        <span className="font-mono text-[14px] tabular-nums text-foreground">
          {phone ?? "—"}
        </span>
      </div>

      {/* Atributos: cada um em chip chave:valor sem truncar. */}
      <div>
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Atributos
          </span>
          <span className="text-[11px] text-muted-foreground/70 tabular-nums">
            ({entries.length})
          </span>
        </div>
        {visible.length === 0 ? (
          <span className="text-muted-foreground">— sem atributos</span>
        ) : (
          <ul className="grid gap-1.5 md:grid-cols-2 lg:grid-cols-3">
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
                  className="flex flex-wrap items-baseline gap-x-2 break-all rounded-md border border-border/30 bg-card px-2 py-1"
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
            className="mt-2 h-8 text-[12px]"
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
            className="mt-2 h-8 text-[12px]"
          >
            Recolher
          </Button>
        ) : null}
      </div>

      {/* Ação rápida. */}
      <div className="flex justify-end pt-1">
        <OpenInChatwoot accountId={accountId} displayId={row.display_id} />
      </div>
    </div>
  );
}

export default ConversaDrillDown;
