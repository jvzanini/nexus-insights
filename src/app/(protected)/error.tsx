"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary do grupo (protected). Antes não existia NENHUM error.tsx no
 * projeto — qualquer throw num Server Component durante navegação RSC caía no
 * overlay cru do Next ("This page couldn't load"). Aqui o usuário vê uma tela
 * on-brand com caminho de recuperação claro (retry sem recarregar a página).
 */
export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[protected/error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
        <AlertCircle className="h-8 w-8 text-red-400" />
      </div>
      <h1 className="mb-2 text-xl font-semibold text-foreground">
        Não foi possível carregar esta página
      </h1>
      <p className="mb-6 max-w-md text-sm leading-relaxed text-muted-foreground">
        Tivemos um problema momentâneo ao buscar os dados. Costuma ser
        temporário — tente novamente.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={() => reset()}
          className="h-11 cursor-pointer rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 text-sm font-semibold text-white transition-all duration-300 hover:from-violet-500 hover:to-purple-500 hover:shadow-[0_0_24px_rgba(124,58,237,0.35)]"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
        <a
          href="/dashboard"
          className="inline-flex h-11 cursor-pointer items-center rounded-xl border border-border px-5 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted/50"
        >
          Ir para o início
        </a>
      </div>
    </div>
  );
}
