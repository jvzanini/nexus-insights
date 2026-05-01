/**
 * IntegrationsHubCard — card do hub `/integracoes`.
 *
 * Server Component. Renderiza um card por integração do registry:
 * - Disponível: link clicável → href, ícone violet, badge "Disponível",
 *   contador de perfis ativos (quando aplicável) e CTA "Configurar".
 * - Em breve: card opaco (opacity-60), sem link, badge cinza "Em breve".
 *
 * Padrão visual: rounded-2xl + border border-border + bg-muted/30,
 * hover bg-muted/50 + border-violet-500/40, transição 200ms. Foco
 * acessível por anel violet em focus-visible.
 */

import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  PieChart,
  Sheet,
  Webhook,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  IntegrationDescriptor,
  IntegrationLucideIcon,
} from "@/lib/integrations/registry";

const ICON_MAP: Record<
  IntegrationLucideIcon,
  React.ComponentType<{ className?: string }>
> = {
  BarChart3,
  TrendingUp,
  PieChart,
  Sheet,
  Webhook,
};

export interface IntegrationsHubCardProps {
  descriptor: IntegrationDescriptor;
  activeProfilesCount?: number;
}

export function IntegrationsHubCard({
  descriptor,
  activeProfilesCount,
}: IntegrationsHubCardProps) {
  const Icon = ICON_MAP[descriptor.icon];
  const isAvailable = descriptor.status === "available";

  const cardContent = (
    <Card
      className={cn(
        "rounded-2xl border border-border bg-muted/30 p-6 transition-all duration-200",
        isAvailable &&
          "hover:bg-muted/50 hover:border-violet-500/40 cursor-pointer",
        !isAvailable && "opacity-60",
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            isAvailable ? "bg-violet-500/15" : "bg-muted",
          )}
        >
          <Icon
            className={cn(
              "h-6 w-6",
              isAvailable
                ? "text-violet-600 dark:text-violet-300"
                : "text-muted-foreground",
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-foreground truncate">
              {descriptor.label}
            </h3>
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0",
                isAvailable
                  ? "bg-violet-500/15 text-violet-600 dark:text-violet-300"
                  : "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
              )}
            >
              {isAvailable ? "Disponível" : "Em breve"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {descriptor.vendor}
          </p>
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {descriptor.description}
          </p>
          {isAvailable && typeof activeProfilesCount === "number" ? (
            <p className="text-xs text-foreground mt-3">
              <span className="font-medium">{activeProfilesCount}</span>{" "}
              <span className="text-muted-foreground">
                {activeProfilesCount === 1 ? "perfil ativo" : "perfis ativos"}
              </span>
            </p>
          ) : null}
        </div>
      </div>
      {isAvailable ? (
        <div className="mt-4 flex items-center justify-end gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-300">
          Configurar
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      ) : null}
    </Card>
  );

  if (isAvailable && descriptor.href) {
    return (
      <Link
        href={descriptor.href}
        className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
      >
        {cardContent}
      </Link>
    );
  }
  return cardContent;
}
