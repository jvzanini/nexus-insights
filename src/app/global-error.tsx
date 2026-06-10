"use client";

import { useEffect } from "react";

/**
 * Fallback de último recurso: captura erros que escapam até o root layout.
 * Substitui <html>/<body>, então é auto-contido (estilos inline, sem depender
 * do CSS/componentes do app, que podem não ter carregado). Mantém o visual
 * dark on-brand e um caminho de recuperação claro.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div
            style={{
              width: 64,
              height: 64,
              margin: "0 auto 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              backgroundColor: "rgba(239, 68, 68, 0.12)",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f87171"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
            Algo deu errado
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "#a1a1aa",
              margin: "0 0 24px",
            }}
          >
            Tivemos um problema inesperado. Costuma ser temporário — tente
            novamente.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              height: 44,
              padding: "0 20px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              color: "#ffffff",
              background: "linear-gradient(to right, #7c3aed, #9333ea)",
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
