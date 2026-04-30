"use client";

import { Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/reports/status-badge";
import type { DashboardRecentItem } from "@/lib/chatwoot/queries/dashboard-data";

interface RecentConversationsTableProps {
  items: DashboardRecentItem[];
}

export function RecentConversationsTable({
  items,
}: RecentConversationsTableProps) {
  return (
    <Card className="bg-card border border-border rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <Activity className="h-4 w-4 text-violet-400" />
          Conversas recentes
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="rounded-b-xl overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground text-xs font-medium h-9">
                  Quando
                </TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium h-9">
                  Contato
                </TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium h-9">
                  Inbox
                </TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium h-9">
                  Atendente
                </TableHead>
                <TableHead className="text-muted-foreground text-xs font-medium h-9">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    Nenhuma conversa registrada
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="border-border/50 hover:bg-accent/30 transition-colors"
                  >
                    <TableCell className="text-xs text-muted-foreground py-2.5">
                      {formatDistanceToNow(new Date(item.lastActivityAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell className="text-sm text-foreground py-2.5">
                      {item.contactName ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground py-2.5">
                      {item.inboxName ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground py-2.5">
                      {item.assigneeName ?? "—"}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <StatusBadge status={item.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
