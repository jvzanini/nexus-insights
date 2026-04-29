import { MailWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OpenInChatwoot } from "@/components/reports/open-in-chatwoot";
import { formatPhone } from "@/lib/utils/format-phone";
import { formatDuration } from "@/lib/utils/format-time";
import type { MensagemNaoRespondidaRow } from "@/lib/chatwoot/queries/mensagens-nao-respondidas";

interface Props {
  rows: MensagemNaoRespondidaRow[];
  accountId: number;
}

function getPhone(p: string | null): string {
  if (!p) return "—";
  const f = formatPhone(p);
  return f || "—";
}

function getSnippet(s: string | null): string {
  if (!s) return "—";
  const cleaned = s.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : "—";
}

/**
 * Tom de "aguardando há" baseado no waiting_seconds:
 *  - >= 1 dia       → vermelho
 *  - >= 4 horas     → âmbar
 *  - resto          → muted
 */
function waitingTone(seconds: number): string {
  if (seconds >= 86400) return "text-red-500";
  if (seconds >= 14400) return "text-amber-500";
  return "text-foreground/80";
}

export function MensagensNaoRespondidasTable({ rows, accountId }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/20 p-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
          <MailWarning className="h-5 w-5 text-emerald-500" />
        </div>
        <h3 className="text-sm font-medium text-foreground">
          Nenhuma mensagem aguardando resposta
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Tudo respondido nos critérios atuais.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Desktop / large */}
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
                Estado
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                Departamento
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                Atendente
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">
                Aguardando há
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
            {rows.map((row) => {
              const phone = getPhone(row.contact_phone);
              const snippet = getSnippet(row.snippet);
              const tone = waitingTone(row.waiting_seconds);
              return (
                <TableRow key={row.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    #{row.display_id}
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-[200px] truncate text-sm font-medium text-foreground"
                      title={row.contact_name ?? "—"}
                    >
                      {row.contact_name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {phone}
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-[140px] truncate text-xs text-muted-foreground"
                      title={row.inbox_name ?? "—"}
                    >
                      {row.inbox_name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-[140px] truncate text-xs text-muted-foreground"
                      title={row.team_name ?? "—"}
                    >
                      {row.team_name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-[140px] truncate text-xs text-muted-foreground"
                      title={row.assignee_name ?? "—"}
                    >
                      {row.assignee_name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "whitespace-nowrap text-xs font-semibold tabular-nums",
                        tone,
                      )}
                    >
                      {formatDuration(row.waiting_seconds)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-[260px] truncate text-xs text-foreground/80"
                      title={snippet}
                    >
                      {snippet}
                    </span>
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

      {/* Mobile / tablet: cards */}
      <ul className="lg:hidden divide-y divide-border">
        {rows.map((row) => {
          const phone = getPhone(row.contact_phone);
          const snippet = getSnippet(row.snippet);
          const tone = waitingTone(row.waiting_seconds);
          return (
            <li key={row.id} className="p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    #{row.display_id}
                  </span>
                  <h3 className="mt-1 truncate text-sm font-semibold text-foreground">
                    {row.contact_name ?? "—"}
                  </h3>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                    tone,
                  )}
                >
                  {formatDuration(row.waiting_seconds)}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                <Field label="WhatsApp" value={phone} mono />
                <Field label="Estado" value={row.inbox_name ?? "—"} />
                <Field label="Departamento" value={row.team_name ?? "—"} />
                <Field label="Atendente" value={row.assignee_name ?? "—"} />
              </dl>

              <p
                className="mt-3 line-clamp-2 text-xs text-foreground/70"
                title={snippet}
              >
                {snippet}
              </p>

              <div className="mt-3 flex justify-end">
                <OpenInChatwoot
                  accountId={accountId}
                  displayId={row.display_id}
                />
              </div>
            </li>
          );
        })}
      </ul>
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
