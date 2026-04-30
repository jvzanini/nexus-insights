"use client";

// PageHeader — cabeçalho padrão das páginas (ícone roxo + título + subtítulo +
// ações). Mede a própria altura via useLayoutEffect e expõe `--page-header-h`
// no <html>. Tabelas com scroll interno (ex.: /relatorios/conversas) usam essa
// var no calc da altura máxima do container.

import { useLayoutEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: PageHeaderProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Mede altura no client e exporta como CSS var. useLayoutEffect garante
  // valor síncrono antes do paint — evita "flash" de container scroll com
  // tamanho errado.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (h: number) => {
      document.documentElement.style.setProperty(
        "--page-header-h",
        `${Math.ceil(h)}px`,
      );
    };
    set(el.getBoundingClientRect().height);
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (h > 0) set(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="mb-6 flex items-start justify-between gap-4"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/10">
          <Icon className="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
