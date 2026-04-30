"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { LucideIcon } from "lucide-react";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * DrillDownDialog — modal central para drill-downs ricos a partir de KPIs.
 *
 * v0.10: substitui `DrillDownSheet` lateral no dashboard por um Dialog
 * centralizado de até 1280px (xl) e 90dvh. Em mobile (< md) ocupa toda a
 * tela top-down (sem drag-handle, é Dialog não Sheet).
 *
 * Comportamento:
 * - Backdrop com blur sutil + escurecimento (cumpre `blur-purpose`).
 * - ESC e clique no backdrop fecham (`escape-routes`, `modal-escape`).
 * - Body scroll lock automático via base-ui.
 * - Botão close 44x44pt (`touch-target-size`) sempre visível no header.
 * - Animação 200–260ms zoom-fade na entrada (cumpre `duration-timing`,
 *   `modal-motion`); respeita prefers-reduced-motion via classes
 *   `tw-animate-css` já presentes no design system (motion-reduce).
 */

const SIZE_MAP = {
  md: "md:max-w-3xl",
  lg: "md:max-w-5xl",
  xl: "md:max-w-6xl",
} as const;

export interface DrillDownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  children: React.ReactNode;
  size?: keyof typeof SIZE_MAP;
  /** Conteúdo opcional renderizado no header à direita. */
  headerExtra?: React.ReactNode;
  /** Texto acessível para o botão close. Default: "Fechar". */
  closeLabel?: string;
}

export function DrillDownDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  icon: Icon,
  iconColor = "text-violet-400",
  iconBg = "bg-violet-500/10",
  children,
  size = "xl",
  headerExtra,
  closeLabel = "Fechar",
}: DrillDownDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm",
            "duration-200 motion-reduce:duration-0",
            "data-open:animate-in data-open:fade-in-0",
            "data-closed:animate-out data-closed:fade-out-0",
          )}
        />
        <DialogPrimitive.Popup
          data-slot="drill-down-dialog"
          aria-describedby={undefined}
          className={cn(
            // Mobile: full-screen top-down
            "fixed inset-x-0 top-0 z-50 flex h-[100dvh] w-full flex-col",
            "bg-card text-foreground outline-none",
            // Desktop: centralizado com max-width
            "md:left-1/2 md:top-1/2 md:inset-x-auto md:h-auto md:max-h-[90dvh]",
            "md:-translate-x-1/2 md:-translate-y-1/2 md:w-[calc(100vw-2rem)]",
            "md:rounded-2xl md:border md:border-border md:shadow-2xl md:shadow-black/40",
            SIZE_MAP[size],
            // Animações
            "duration-260 motion-reduce:duration-0",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 md:px-6 md:py-5">
            <div className="flex min-w-0 items-start gap-3">
              {Icon ? (
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    iconBg,
                  )}
                >
                  <Icon className={cn("h-5 w-5", iconColor)} aria-hidden />
                </div>
              ) : null}
              <div className="min-w-0">
                <DialogPrimitive.Title className="truncate font-heading text-base font-semibold leading-snug text-foreground md:text-lg">
                  {title}
                </DialogPrimitive.Title>
                {subtitle ? (
                  <DialogPrimitive.Description className="mt-0.5 line-clamp-2 text-xs text-muted-foreground md:text-sm">
                    {subtitle}
                  </DialogPrimitive.Description>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {headerExtra}
              <DialogPrimitive.Close
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 cursor-pointer rounded-full text-muted-foreground transition-all hover:text-foreground"
                  />
                }
                aria-label={closeLabel}
              >
                <XIcon className="h-5 w-5" aria-hidden />
                <span className="sr-only">{closeLabel}</span>
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Body scrollable */}
          <div
            data-slot="drill-down-dialog-body"
            className="flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-6"
          >
            {children}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// Reutilizamos as helpers do DrillDownSheet (mesma estrutura interna).
export {
  DrillDownSection,
  DrillDownSkeleton,
} from "@/components/ui/drill-down-sheet";
