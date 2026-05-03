"use client";

import { Download, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { exportConversasAction } from "@/lib/actions/reports/conversas-export";
import type { ReportFilters } from "@/lib/chatwoot/filters";

interface ExportButtonProps {
  filters: ReportFilters;
  accountId: number;
  rowCount: number;
}

/**
 * Decodifica base64 → Blob XLSX e dispara o download via <a download>.
 * O `setTimeout` evita revogar a object URL antes do browser persistir o arquivo.
 */
function downloadBlob(base64: string, filename: string) {
  const byteCharacters = atob(base64);
  const bytes = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    bytes[i] = byteCharacters.charCodeAt(i);
  }
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Botão de exportação XLSX para a tabela de conversas.
 * Dispara a Server Action `exportConversasAction`, baixa o blob no browser
 * e exibe toast de sucesso/warning/erro conforme o resultado.
 */
export function ExportButton({
  filters,
  accountId,
  rowCount,
}: ExportButtonProps) {
  const [pending, startTransition] = useTransition();
  const [internalLoading, setInternalLoading] = useState(false);

  const loading = pending || internalLoading;
  const disabled = rowCount === 0 || loading;

  const handleClick = () => {
    setInternalLoading(true);
    startTransition(async () => {
      try {
        const result = await exportConversasAction({ filters, accountId });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        if (result.base64 && result.filename) {
          downloadBlob(result.base64, result.filename);
          if (result.truncated) {
            toast.warning(
              "Mostrando primeiras 50.000 — refine os filtros para exportar tudo.",
            );
          } else {
            toast.success("Planilha gerada");
          }
        }
      } catch (err) {
        console.error("[ExportButton]", err);
        toast.error("Erro inesperado ao gerar planilha");
      } finally {
        setInternalLoading(false);
      }
    });
  };

  return (
    <Button
      data-tour="export"
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      aria-label="Exportar conversas para planilha XLSX"
      aria-busy={loading}
      className="relative h-10 cursor-pointer px-4 disabled:cursor-not-allowed"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Gerando…
        </>
      ) : (
        <>
          <Download className="h-4 w-4" aria-hidden="true" />
          Exportar
        </>
      )}
    </Button>
  );
}

export default ExportButton;
