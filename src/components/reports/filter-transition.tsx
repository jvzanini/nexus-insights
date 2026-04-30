"use client";

import {
  createContext,
  useContext,
  useTransition,
  type ReactNode,
} from "react";

interface FilterTransitionContextValue {
  isPending: boolean;
  startTransition: ReturnType<typeof useTransition>[1];
}

const FilterTransitionContext = createContext<FilterTransitionContextValue | null>(
  null,
);

interface FilterTransitionProviderProps {
  children: ReactNode;
}

/**
 * Provider que compartilha o `useTransition` entre os filtros (que disparam
 * `router.push`) e o conteúdo (tabelas/charts) que precisa exibir overlay
 * de loading enquanto a página é re-renderizada no servidor.
 */
export function FilterTransitionProvider({
  children,
}: FilterTransitionProviderProps) {
  const [isPending, startTransition] = useTransition();
  return (
    <FilterTransitionContext.Provider value={{ isPending, startTransition }}>
      {children}
    </FilterTransitionContext.Provider>
  );
}

/**
 * Hook para componentes (filtros) dispararem transitions compartilhadas.
 * Fora do provider, faz fallback para um `useTransition` local — assim
 * componentes podem ser usados em páginas que não optaram pelo provider.
 */
export function useFilterTransition(): FilterTransitionContextValue {
  const ctx = useContext(FilterTransitionContext);
  // Hook chamado SEMPRE — ordem estável mesmo quando o provider existe.
  const [localPending, localStart] = useTransition();
  if (ctx) return ctx;
  return { isPending: localPending, startTransition: localStart };
}
