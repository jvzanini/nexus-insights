"use client";

// Client Component dedicado a medir a altura real do PageHeader e expor como
// CSS var `--page-header-h` no <html>. Mantém o `<PageHeader>` em si como
// Server Component (necessário para que possa receber `icon: LucideIcon` —
// funções não podem atravessar a fronteira RSC → Client Component).
//
// Recebe `children` já renderizado pelo server e só ata um ref + ResizeObserver.

import { useLayoutEffect, useRef } from "react";

interface PageHeaderHeightProbeProps {
  children: React.ReactNode;
  className?: string;
}

export function PageHeaderHeightProbe({
  children,
  className,
}: PageHeaderHeightProbeProps) {
  const ref = useRef<HTMLDivElement>(null);

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
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
