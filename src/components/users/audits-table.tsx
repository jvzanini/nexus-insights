"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAudits, type AuditLogRow } from "@/lib/actions/audit";
import type { AuditAction } from "@/generated/prisma/client";

const ACTION_LABELS: Record<AuditAction, string> = {
  login_succeeded: "Login realizado",
  login_failed: "Login falhou",
  password_reset_requested: "Reset de senha solicitado",
  password_reset_completed: "Senha redefinida",
  user_created: "Usuário criado",
  user_updated: "Usuário atualizado",
  user_deleted: "Usuário excluído",
  user_role_changed: "Nível de usuário alterado",
  user_access_granted: "Acesso concedido",
  user_access_revoked: "Acesso revogado",
  user_activated: "Usuário ativado",
  user_deactivated: "Usuário desativado",
  profile_updated: "Perfil atualizado",
  profile_password_changed: "Senha alterada",
  email_change_requested: "Troca de e-mail solicitada",
  email_change_completed: "E-mail alterado",
  account_switched: "Conta trocada",
  setting_updated: "Configuração alterada",
  opened_chatwoot_link: "Abriu conversa no Chatwoot",
  session_revoked: "Sessão revogada",
};

function getActionBadgeClasses(action: AuditAction): string {
  if (action.startsWith("login_")) {
    return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  }
  if (action.startsWith("password_") || action === "profile_password_changed") {
    return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  }
  if (action.startsWith("setting_")) {
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  }
  if (action === "opened_chatwoot_link") {
    return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  }
  if (action.startsWith("user_") || action.startsWith("profile_") || action.startsWith("email_") || action === "account_switched" || action === "session_revoked") {
    return "bg-violet-500/10 text-violet-400 border-violet-500/20";
  }
  return "bg-muted text-muted-foreground border-border";
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(date));
}

function truncate(value: string | null, max = 12): string {
  if (!value) return "-";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export function AuditsTable() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listAudits({ limit: 50 });
      if (cancelled) return;
      if (result.success && result.data) {
        setRows(result.data.rows);
        setNextCursor(result.data.nextCursor);
      }
      setInitialLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function loadMore() {
    if (!nextCursor) return;
    start(async () => {
      const result = await listAudits({ cursor: nextCursor, limit: 50 });
      if (result.success && result.data) {
        setRows((prev) => [...prev, ...result.data!.rows]);
        setNextCursor(result.data.nextCursor);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-muted/20 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs">Ação</TableHead>
              <TableHead className="text-xs">Usuário</TableHead>
              <TableHead className="text-xs">Alvo</TableHead>
              <TableHead className="text-xs">IP</TableHead>
              <TableHead className="text-xs">Quando</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Carregando eventos...
                  </span>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                  Nenhum evento de auditoria encontrado.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} className="border-border hover:bg-muted/30">
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${getActionBadgeClasses(r.action)}`}
                    >
                      {ACTION_LABELS[r.action] ?? r.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.userName ? (
                      <div className="flex flex-col">
                        <span className="font-medium">{r.userName}</span>
                        <span className="text-xs text-muted-foreground">{r.userEmail}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.targetType ? (
                      <span>
                        <span className="font-medium text-foreground">{r.targetType}</span>
                        {r.targetId ? (
                          <span className="ml-1 text-muted-foreground">{truncate(r.targetId)}</span>
                        ) : null}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {r.ipAddress ?? "-"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(r.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {nextCursor ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={pending}
            className="cursor-pointer"
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Carregando...
              </>
            ) : (
              "Carregar mais"
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
