"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Database,
  Edit2,
  Loader2,
  PauseCircle,
  Plus,
  TestTube,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  softDeleteNexusChatConnection,
  testNexusChatConnection,
} from "@/lib/actions/nexus-chat/connections";
import { cn } from "@/lib/utils";
import { ConnectionFormDialog } from "./connection-form-dialog";

export type ConnectionStatus = "active" | "paused" | "error";

export interface ConnectionListItem {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  sslMode: string;
  applicationName: string;
  status: ConnectionStatus | string;
  lastTestAt: string | null;
  lastTestError: string | null;
  bindingsCount: number;
  /**
   * Intervalo em segundos entre cada polling delta nesta conexão.
   * Default schema = 30s, mínimo permitido = 20s.
   */
  pollingIntervalSeconds: number;
  /**
   * Timestamp do último polling delta executado com sucesso (ISO 8601).
   * `null` quando nunca rodou ainda.
   */
  lastSyncAt: string | null;
}

interface Props {
  connections: ConnectionListItem[];
}

const STATUS_META: Record<
  ConnectionStatus,
  {
    label: string;
    icon: typeof CheckCircle2;
    badgeClass: string;
  }
> = {
  active: {
    label: "Ativa",
    icon: CheckCircle2,
    badgeClass:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  },
  paused: {
    label: "Pausada",
    icon: PauseCircle,
    badgeClass:
      "bg-amber-500/10 text-amber-600 dark:text-amber-300 ring-amber-500/20",
  },
  error: {
    label: "Erro",
    icon: XCircle,
    badgeClass:
      "bg-rose-500/10 text-rose-600 dark:text-rose-300 ring-rose-500/20",
  },
};

/**
 * Mascara o hostname mostrando 3 primeiros + 4 últimos chars com bullets
 * no meio. Mantém porta visível separada.
 *
 * Exemplos:
 *   "db.example.com"   → "db.•••••.com"
 *   "127.0.0.1"        → "127•••0.1"
 *   "h"                → "h"
 *   "shorthost"        → "sho••host"  (3 + 4 = 7 chars de 9, ok)
 */
export function maskHost(host: string): string {
  if (!host) return "";
  if (host.length <= 7) return host;
  const head = host.slice(0, 3);
  const tail = host.slice(-4);
  return `${head}•••••${tail}`;
}

function formatLastTest(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
  } catch {
    return "—";
  }
}

function statusMeta(status: string) {
  return STATUS_META[status as ConnectionStatus] ?? STATUS_META.active;
}

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; connection: ConnectionListItem };

export function ConnectionList({ connections }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConnectionListItem | null>(
    null,
  );
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });

  function handleTest(c: ConnectionListItem) {
    setTestingId(c.id);
    startTransition(async () => {
      const result = await testNexusChatConnection(c.id);
      setTestingId(null);
      if (result.success && result.data) {
        toast.success(`Conectado em ${result.data.durationMs} ms.`);
      } else {
        toast.error(result.error ?? "Falha no teste de conexão.");
      }
      router.refresh();
    });
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      const result = await softDeleteNexusChatConnection(id);
      setDeleteTarget(null);
      if (!result.success) {
        toast.error(result.error ?? "Falha ao apagar conexão.");
        return;
      }
      toast.success("Conexão removida.");
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-muted/30 p-2">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 sm:items-center">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <Database
              className="h-[18px] w-[18px] text-violet-500"
              aria-hidden
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <h2 className="font-heading text-base font-medium text-foreground">
              Conexões cadastradas
            </h2>
            <p className="text-xs text-muted-foreground">
              Bancos Postgres do Nexus Chat. Cada conexão pode hospedar várias
              empresas (accounts).
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => setDialog({ mode: "create" })}
          className="cursor-pointer"
        >
          <Plus className="mr-1 h-4 w-4" aria-hidden />
          Nova conexão
        </Button>
      </div>

      {connections.length === 0 ? (
        <div className="m-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/40 px-6 py-12 text-center">
          <Database
            className="h-7 w-7 text-muted-foreground"
            aria-hidden
          />
          <p className="text-sm font-medium text-foreground">
            Nenhuma conexão cadastrada ainda
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            Adicione um banco Postgres do Nexus Chat para começar a importar
            relatórios. As credenciais são cifradas em repouso (AES-256-GCM).
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => setDialog({ mode: "create" })}
            className="mt-2 cursor-pointer"
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Nova conexão
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-background/40">
          <ul className="divide-y divide-border">
            {connections.map((c) => {
              const meta = statusMeta(c.status);
              const StatusIcon = meta.icon;
              const isTesting = pending && testingId === c.id;
              return (
                <li
                  key={c.id}
                  className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:gap-4"
                >
                  {/* Coluna identidade: nome + host masked + banco */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {c.name}
                      </p>
                      <span
                        data-testid={`conn-status-${c.id}`}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                          meta.badgeClass,
                        )}
                      >
                        <StatusIcon className="h-3 w-3" aria-hidden />
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span
                        data-testid={`conn-host-${c.id}`}
                        className="font-mono tabular-nums"
                      >
                        {maskHost(c.host)}:{c.port}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="font-mono">{c.database}</span>
                      <span aria-hidden>·</span>
                      <span>
                        Última verificação:{" "}
                        <span className="tabular-nums">
                          {formatLastTest(c.lastTestAt)}
                        </span>
                      </span>
                    </div>
                    {c.lastTestError ? (
                      <p className="mt-1 line-clamp-2 break-words text-[11px] text-rose-500">
                        {c.lastTestError}
                      </p>
                    ) : null}
                  </div>

                  {/* Coluna empresas: count + link pra page dedicada */}
                  <div className="flex items-center gap-2 lg:shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums ring-1 ring-inset ring-border">
                      {c.bindingsCount}{" "}
                      {c.bindingsCount === 1 ? "empresa" : "empresas"}
                    </span>
                    <Link
                      href={`/bancos-de-dados/${c.id}`}
                      className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border bg-background/50 px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Users className="h-3 w-3" aria-hidden />
                      Abrir detalhes
                    </Link>
                  </div>

                  {/* Coluna ações */}
                  <div className="flex items-center gap-1 lg:shrink-0">
                    <button
                      type="button"
                      onClick={() => handleTest(c)}
                      disabled={isTesting}
                      aria-label="Testar conexão"
                      title="Testar conexão"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-violet-500/10 hover:text-violet-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isTesting ? (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <TestTube className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialog({ mode: "edit", connection: c })}
                      aria-label="Editar conexão"
                      title="Editar conexão"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Edit2 className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(c)}
                      aria-label="Apagar conexão"
                      title="Apagar conexão"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {dialog.mode !== "closed" ? (
        <ConnectionFormDialog
          mode={dialog.mode}
          open
          onOpenChange={(open) => {
            if (!open) setDialog({ mode: "closed" });
          }}
          connection={dialog.mode === "edit" ? dialog.connection : null}
        />
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar conexão?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  Apagar a conexão <strong>{deleteTarget.name}</strong>? Essa
                  ação é reversível (soft delete). Não é possível apagar
                  conexões com empresas ativas — desative os bindings antes.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="conn-delete-confirm"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={pending}
              className="cursor-pointer"
            >
              {pending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

