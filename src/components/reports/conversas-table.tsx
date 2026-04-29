"use client";

import { useState, useTransition } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/reports/status-badge";
import { OpenInChatwoot } from "@/components/reports/open-in-chatwoot";
import { formatPhone } from "@/lib/utils/format-phone";
import { formatCpf } from "@/lib/utils/format-cpf";
import {
  fetchConversas,
  type FetchConversasInput,
} from "@/lib/actions/reports/conversas";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

interface ConversasTableProps {
  initialRows: ConversaRow[];
  initialCursor: string | null;
  accountId: number;
  filters: FetchConversasInput["filters"];
}

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const deltaMs = Date.now() - ts;
  const seconds = Math.round(deltaMs / 1000);
  if (seconds < 60) return "agora mesmo";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(-days, "day");
  const months = Math.round(days / 30);
  if (months < 12) return rtf.format(-months, "month");
  const years = Math.round(days / 365);
  return rtf.format(-years, "year");
}

export function ConversasTable({
  initialRows,
  initialCursor,
  accountId,
  filters,
}: ConversasTableProps) {
  const [rows, setRows] = useState<ConversaRow[]>(initialRows);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const loadMore = () => {
    if (!cursor || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await fetchConversas({
        filters,
        cursor,
        accountId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setRows((prev) => [...prev, ...result.rows]);
      setCursor(result.nextCursor);
    });
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/20 p-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40">
          <Inbox className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-medium text-foreground">
          Nenhuma conversa encontrada
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Ajuste os filtros para ver mais resultados.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-16 text-xs uppercase tracking-wide text-muted-foreground">
              #
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
              Contato
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
              Estado
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
              Departamento
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
              Atendente
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
              Status
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
              Última mensagem
            </TableHead>
            <TableHead className="w-24 text-right text-xs uppercase tracking-wide text-muted-foreground">
              Ações
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="hover:bg-muted/30">
              <TableCell className="font-mono text-xs text-muted-foreground">
                #{row.display_id}
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5 max-w-[220px]">
                  <span className="truncate text-sm font-medium text-foreground">
                    {row.contact.name ?? "—"}
                  </span>
                  {row.contact.phone_number ? (
                    <span className="text-xs text-muted-foreground">
                      {formatPhone(row.contact.phone_number)}
                    </span>
                  ) : null}
                  {row.contact.cpf ? (
                    <span className="text-xs text-muted-foreground">
                      CPF: {formatCpf(row.contact.cpf)}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {row.inbox.name ?? "—"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {row.team.name ?? "—"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {row.assignee.name ?? "—"}
              </TableCell>
              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5 max-w-xs">
                  <span className="truncate text-xs text-foreground/80">
                    {row.last_message?.trim() || "—"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelativeTime(row.last_activity_at)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <OpenInChatwoot
                  accountId={accountId}
                  displayId={row.display_id}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {(cursor || error) && (
        <div
          className={cn(
            "border-t border-border p-3 flex items-center justify-center gap-3",
            "bg-muted/10",
          )}
        >
          {error ? (
            <span className="text-xs text-red-400">{error}</span>
          ) : null}
          {cursor ? (
            <Button
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Carregando...
                </>
              ) : (
                "Carregar mais"
              )}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
