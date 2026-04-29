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
import { PriorityBadge } from "@/components/reports/priority-badge";
import { LabelsChips } from "@/components/reports/labels-chips";
import { OpenInChatwoot } from "@/components/reports/open-in-chatwoot";
import { formatPhone } from "@/lib/utils/format-phone";
import { detectDocument } from "@/lib/utils/format-document";
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

function getDocumentDisplay(contact: ConversaRow["contact"]): string {
  const doc = detectDocument({
    identifier: contact.identifier,
    additional_attributes: contact.additional_attributes,
  });
  return doc?.formatted ?? "—";
}

function getPhoneDisplay(phone: string | null): string {
  if (!phone) return "—";
  const formatted = formatPhone(phone);
  return formatted || "—";
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
      {/* Desktop / large: tabela com 11 colunas. */}
      <div className="hidden lg:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-16 text-xs uppercase tracking-wide text-muted-foreground">
                #
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                Nome
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                WhatsApp
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                Documento
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
                Prioridade
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                Labels
              </TableHead>
              <TableHead className="w-24 text-right text-xs uppercase tracking-wide text-muted-foreground">
                Ações
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const phone = getPhoneDisplay(row.contact.phone_number);
              const doc = getDocumentDisplay(row.contact);
              const inboxName = row.inbox.name ?? "—";
              const teamName = row.team.name ?? "—";
              const assigneeName = row.assignee.name ?? "—";
              const contactName = row.contact.name ?? "—";
              return (
                <TableRow key={row.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    #{row.display_id}
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-[200px] truncate text-sm font-medium text-foreground"
                      title={contactName}
                    >
                      {contactName}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {phone}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {doc}
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-[140px] truncate text-xs text-muted-foreground"
                      title={inboxName}
                    >
                      {inboxName}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-[140px] truncate text-xs text-muted-foreground"
                      title={teamName}
                    >
                      {teamName}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-[140px] truncate text-xs text-muted-foreground"
                      title={assigneeName}
                    >
                      {assigneeName}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={row.priority} />
                  </TableCell>
                  <TableCell>
                    <LabelsChips labels={row.labels} />
                  </TableCell>
                  <TableCell className="text-right">
                    <OpenInChatwoot
                      accountId={accountId}
                      displayId={row.display_id}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile / tablet: lista de cards. */}
      <ul className="lg:hidden divide-y divide-border">
        {rows.map((row) => {
          const phone = getPhoneDisplay(row.contact.phone_number);
          const doc = getDocumentDisplay(row.contact);
          const inboxName = row.inbox.name ?? "—";
          const teamName = row.team.name ?? "—";
          const assigneeName = row.assignee.name ?? "—";
          const contactName = row.contact.name ?? "—";
          return (
            <li key={row.id} className="p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      #{row.display_id}
                    </span>
                  </div>
                  <h3 className="mt-1 truncate text-sm font-semibold text-foreground">
                    {contactName}
                  </h3>
                </div>
                <StatusBadge status={row.status} />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                <Field label="WhatsApp" value={phone} mono />
                <Field label="Documento" value={doc} mono />
                <Field label="Estado" value={inboxName} />
                <Field label="Departamento" value={teamName} />
                <Field label="Atendente" value={assigneeName} />
                <div className="flex flex-col gap-0.5">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Prioridade
                  </dt>
                  <dd>
                    <PriorityBadge priority={row.priority} />
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex items-center justify-between gap-3">
                <LabelsChips labels={row.labels} />
                <OpenInChatwoot
                  accountId={accountId}
                  displayId={row.display_id}
                />
              </div>
            </li>
          );
        })}
      </ul>

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

interface FieldProps {
  label: string;
  value: string;
  mono?: boolean;
}

function Field({ label, value, mono }: FieldProps) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "truncate text-xs text-foreground/90",
          mono && "font-mono",
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
