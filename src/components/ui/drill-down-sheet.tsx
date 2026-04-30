"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { LucideIcon } from "lucide-react";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * DrillDownSheet — sheet lateral para drill-downs ricos a partir de KPIs.
 *
 * Comportamento:
 * - Desktop (>= md): slide-in lateral à direita; largura limitada por `size`.
 * - Mobile (< md): bottom-sheet com altura ~92vh (não full-screen para
 *   manter o contexto do dashboard atrás visível).
 * - Backdrop com blur sutil (cumpre `blur-purpose`); ESC e clique no backdrop
 *   fecham (`escape-routes`, `modal-escape`); body scroll lock automático
 *   via base-ui.
 * - Botão close 44x44pt (`touch-target-size`) sempre visível no header.
 * - Animações 200–280ms com ease-out na entrada (cumpre `duration-timing`,
 *   `modal-motion`); respeitam prefers-reduced-motion via classes utilitárias
 *   `tw-animate-css` já presentes no design system (motion-reduce).
 */

const SIZE_MAP = {
  md: "md:max-w-2xl",
  lg: "md:max-w-3xl",
  xl: "md:max-w-5xl",
} as const;

export interface DrillDownSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  children: React.ReactNode;
  size?: keyof typeof SIZE_MAP;
  /**
   * Conteúdo opcional renderizado no header à direita (ex.: filtros, badges).
   */
  headerExtra?: React.ReactNode;
  /**
   * Texto acessível para o botão close. Default: "Fechar".
   */
  closeLabel?: string;
}

export function DrillDownSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  icon: Icon,
  iconColor = "text-violet-400",
  iconBg = "bg-violet-500/10",
  children,
  size = "lg",
  headerExtra,
  closeLabel = "Fechar",
}: DrillDownSheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
            "duration-200 motion-reduce:duration-0",
            "data-open:animate-in data-open:fade-in-0",
            "data-closed:animate-out data-closed:fade-out-0",
          )}
        />
        <DialogPrimitive.Popup
          data-slot="drill-down-sheet"
          aria-describedby={undefined}
          className={cn(
            // Mobile: bottom sheet
            "fixed inset-x-0 bottom-0 z-50 flex h-[92dvh] w-full flex-col",
            "rounded-t-2xl border-t border-border bg-card text-foreground",
            "shadow-2xl shadow-black/40 outline-none",
            // Desktop: slide-in à direita
            "md:inset-y-0 md:right-0 md:left-auto md:h-full md:w-full",
            "md:rounded-none md:rounded-l-2xl md:border-t-0 md:border-l",
            SIZE_MAP[size],
            // Animações
            "duration-300 motion-reduce:duration-0",
            // Mobile: slide de baixo
            "data-open:animate-in data-open:slide-in-from-bottom",
            "data-closed:animate-out data-closed:slide-out-to-bottom",
            // Desktop: slide da direita
            "md:data-open:slide-in-from-right md:data-closed:slide-out-to-right",
            "md:data-open:slide-in-from-bottom-0 md:data-closed:slide-out-to-bottom-0",
          )}
        >
          {/* Drag handle visual em mobile */}
          <div
            aria-hidden
            className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/30 md:hidden"
          />

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
            data-slot="drill-down-sheet-body"
            className="flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-6"
          >
            {children}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Helper para renderizar seções dentro do drill-down com título + corpo.
 */
export function DrillDownSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-background/40 p-4 md:p-5",
        className,
      )}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-sm font-semibold text-foreground">
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}

/**
 * Skeleton padrão para conteúdo dentro do drill-down enquanto dados carregam.
 *
 * Cumpre `progressive-loading`: layout reservado, sem spinner solto.
 */
export function DrillDownSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="h-6 w-1/3 rounded bg-muted" />
      <div className="h-64 w-full rounded-xl border border-border bg-card" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="h-48 rounded-xl border border-border bg-card" />
        <div className="h-48 rounded-xl border border-border bg-card" />
      </div>
      <div className="h-40 w-full rounded-xl border border-border bg-card" />
    </div>
  );
}
