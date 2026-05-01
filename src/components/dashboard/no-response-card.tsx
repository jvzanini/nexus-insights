"use client";

import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OpenInChatwoot } from "@/components/reports/open-in-chatwoot";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/utils/format-time";
import type { DashboardNoResponse } from "@/lib/chatwoot/queries/dashboard-data";

const formatWaiting = formatDuration;

export interface NoResponseCardProps {
  data: DashboardNoResponse;
  accountId: number;
  onSeeAll: () => void;
}

/**
 * Card hero "Conversas sem resposta" — operacional.
 *
 * Definição (status=0 + última msg do contato + criadas no período) já vem do
 * `dashboard-data.ts`. Aqui apenas apresentamos o resumo + preview + CTA.
 */
export function NoResponseCard({
  data,
  accountId,
  onSeeAll,
}: NoResponseCardProps) {
  const hasItems = data.total > 0;
  const oldestLabel = formatWaiting(data.oldestSeconds);

  return (
    <Card
      className={cn(
        "h-full bg-card border rounded-xl",
        hasItems
          ? "border-amber-500/40 shadow-[0_0_24px_rgba(245,158,11,0.08)]"
          : "border-border",
      )}
      data-tour="dashboard-no-response"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg",
              hasItems ? "bg-amber-500/10" : "bg-emerald-500/10",
            )}
            aria-hidden="true"
          >
            {hasItems ? (
              <AlertCircle className="h-4 w-4 text-amber-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            )}
          </span>
          <span className="flex flex-col">
            <span className="leading-none">Conversas sem resposta</span>
            <span className="mt-1 text-xs font-normal text-muted-foreground">
              Aguardando resposta agora — no período selecionado
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasItems ? (
          <>
            <div className="flex items-baseline gap-2">
              <motion.span
                key={data.total}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="text-3xl font-bold tabular-nums text-foreground"
              >
                {data.total.toLocaleString("pt-BR")}
              </motion.span>
              <span className="text-xs text-muted-foreground">
                aguardando resposta
              </span>
            </div>
            {data.oldestSeconds > 0 ? (
              <p className="mt-1 text-xs text-amber-400">
                Mais antiga há{" "}
                <span className="font-semibold">{oldestLabel}</span>
              </p>
            ) : null}
            <ul className="mt-4 divide-y divide-border/60">
              {data.preview.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.contactName ?? "(sem nome)"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.inboxName ?? "—"}
                      {item.assigneeName
                        ? ` · ${item.assigneeName}`
                        : " · sem atendente"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-amber-400">
                    {formatWaiting(item.waitingSeconds)}
                  </span>
                  <OpenInChatwoot
                    accountId={accountId}
                    displayId={item.displayId}
                  />
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              onClick={onSeeAll}
              className="mt-4 w-full cursor-pointer group"
            >
              Ver todas ({data.total.toLocaleString("pt-BR")})
              <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" aria-hidden />
            <p className="text-sm font-medium text-foreground">
              Tudo respondido.
            </p>
            <p className="text-xs text-muted-foreground">
              Nenhuma conversa aguardando resposta no período.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
