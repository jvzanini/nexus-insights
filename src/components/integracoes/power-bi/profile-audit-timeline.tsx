"use client";

/**
 * ProfileAuditTimeline — timeline vertical com os últimos 50 eventos do
 * perfil. Cada item tem um chip colorido por tipo de evento, nome do user
 * (ou "Sistema"), timestamp pt-BR e details JSON colapsível.
 *
 * Mapping de cores por evento:
 *  - profile_created     → violet
 *  - profile_updated     → violet
 *  - whitelist_changed   → violet
 *  - password_revealed   → amber
 *  - password_rotated    → blue
 *  - profile_disabled    → zinc
 *  - profile_reactivated → emerald
 *  - profile_deleted     → red
 *  - provisioning_failed → red
 *  - default             → zinc
 *
 * Empty state: ilustração textual quando 0 eventos.
 *
 * NOTE: Server action `getProfileByIdAction` já vem com `auditEvents.user`?
 * Não: o select do prisma só pega userId. Pra mostrar o nome do user, o
 * Server Component pai (page.tsx) faz join lateral e nos passa um map
 * `userById` opcional.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AuditEvent {
  id: string;
  event: string;
  userId: string | null;
  details: unknown;
  createdAt: Date;
}

interface UserShape {
  id: string;
  name: string;
  email: string;
}

interface Props {
  events: AuditEvent[];
  /** Map userId → user pra exibir o nome. Quando ausente, mostra "Sistema". */
  userById?: Record<string, UserShape>;
}

interface ChipConfig {
  label: string;
  classes: string;
}

const CHIP_CONFIG: Record<string, ChipConfig> = {
  profile_created: {
    label: "Criado",
    classes:
      "bg-violet-500/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  },
  profile_updated: {
    label: "Atualizado",
    classes:
      "bg-violet-500/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  },
  whitelist_changed: {
    label: "Whitelist alterada",
    classes:
      "bg-violet-500/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  },
  password_revealed: {
    label: "Senha revelada",
    classes:
      "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  },
  password_rotated: {
    label: "Senha rotacionada",
    classes:
      "bg-blue-500/15 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  },
  profile_disabled: {
    label: "Desativado",
    classes:
      "bg-zinc-500/15 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300",
  },
  profile_reactivated: {
    label: "Reativado",
    classes:
      "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  },
  profile_deleted: {
    label: "Deletado",
    classes:
      "bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  },
  provisioning_failed: {
    label: "Provisionamento falhou",
    classes:
      "bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  },
};

function chipFor(event: string): ChipConfig {
  return (
    CHIP_CONFIG[event] ?? {
      label: event,
      classes:
        "bg-zinc-500/15 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-300",
    }
  );
}

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTimestamp(value: Date): string {
  const datePart = dateTimeFormatter.formatToParts(value);
  const ymd = datePart
    .filter((p) =>
      ["day", "month", "year"].includes(p.type),
    )
    .map((p) => p.value)
    .join("");
  void ymd; // not used; kept for clarity
  // Format: "01/05/2026 às 19:24"
  const formatted = dateTimeFormatter.format(value);
  // Intl outputs "01/05/2026, 19:24" by default; replace comma with " às".
  return formatted.replace(/,\s*/, " às ");
}

function hasMeaningfulDetails(details: unknown): boolean {
  if (details === null || details === undefined) return false;
  if (typeof details !== "object") return true;
  if (Array.isArray(details)) return details.length > 0;
  return Object.keys(details as object).length > 0;
}

export function ProfileAuditTimeline({ events, userById }: Props) {
  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      ),
    [events],
  );

  return (
    <Card data-testid="profile-audit-timeline">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b pb-4">
        <div className="flex flex-col gap-1">
          <CardTitle>Atividade</CardTitle>
          <p className="text-xs text-muted-foreground">
            Últimos {sorted.length} eventos registrados no audit log.
          </p>
        </div>
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-300"
        >
          <History className="h-4 w-4" />
        </span>
      </CardHeader>

      <CardContent>
        {sorted.length === 0 ? (
          <p
            className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground"
            data-testid="audit-empty-state"
          >
            Sem atividade registrada.
          </p>
        ) : (
          <ol className="relative space-y-3" data-testid="audit-events-list">
            {sorted.map((event) => (
              <TimelineItem
                key={event.id}
                event={event}
                user={
                  event.userId && userById ? userById[event.userId] : undefined
                }
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

interface ItemProps {
  event: AuditEvent;
  user?: UserShape;
}

function TimelineItem({ event, user }: ItemProps) {
  const [expanded, setExpanded] = useState(false);
  const chip = chipFor(event.event);
  const hasDetails = hasMeaningfulDetails(event.details);

  const userLabel = user?.name ?? (event.userId ? "Usuário" : "Sistema");

  return (
    <li
      className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3"
      data-testid={`audit-item-${event.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              chip.classes,
            )}
            data-testid={`audit-chip-${event.event}`}
          >
            {chip.label}
          </span>
          <span className="text-sm text-foreground">
            <span className="font-medium">{userLabel}</span>
            <span className="ml-2 text-xs text-muted-foreground tabular-nums">
              {formatTimestamp(event.createdAt)}
            </span>
          </span>
        </div>

        <div className="mt-1.5">
          {hasDetails ? (
            <details
              open={expanded}
              onToggle={(e) =>
                setExpanded((e.currentTarget as HTMLDetailsElement).open)
              }
              className="text-xs"
            >
              <summary className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                {expanded ? (
                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                )}
                {expanded ? "Ocultar detalhes" : "Ver detalhes"}
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-border bg-background p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap break-all">
                {JSON.stringify(event.details, null, 2)}
              </pre>
            </details>
          ) : (
            <p className="text-xs text-muted-foreground/70 italic">
              sem detalhes
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
