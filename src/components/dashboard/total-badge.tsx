"use client";

interface TotalBadgeProps {
  n: number;
}

/**
 * Pill violeta com número formatado em pt-BR.
 *
 * Substitui o texto cosmético "(N)" usado em headers de cards/drill-downs por
 * um badge consistente com o padrão visual do dashboard de consumo do Agente
 * Nex.
 *
 * Cor com 4.5:1 de contraste (violet-300 sobre violet-500/10) e tabular-nums
 * para alinhar números entre badges adjacentes.
 */
export function TotalBadge({ n }: TotalBadgeProps) {
  return (
    <span className="ml-2 inline-flex items-center rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-violet-300">
      {n.toLocaleString("pt-BR")}
    </span>
  );
}
