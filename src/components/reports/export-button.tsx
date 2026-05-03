"use client";

import { Download, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { exportConversasAction } from "@/lib/actions/reports/conversas-export";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import type { ConditionGroup } from "@/lib/utils/apply-conditions";
import type { DocumentTypeFilter } from "@/lib/reports/match-document-types";
import type { SortRule } from "@/components/reports/sorting-dialog";

interface ExportButtonProps {
  filters: ReportFilters;
  accountId: number;
  rowCount: number;
  /**
   * v0.32: indica se a busca client-side está ativa (apenas para o tooltip).
   * O comportamento mudou — desde v0.32 o export REPLICA a busca server-side
   * via `searchClient` prop, então o XLSX inclui a busca aplicada.
   */
  searchClientActive?: boolean;
  /**
   * v0.32 — busca client-side propagada pra action. Quando não-vazia, server
   * aplica `matchSearchClient` no resultado antes do XLSX.
   */
  searchClient?: string;
  /**
   * v0.32 — where-clause do filtro Avançado. Quando definido, server replica
   * `applyConditions` no resultado.
   */
  conditionGroup?: ConditionGroup;
  /**
   * v0.32 — filtro Documento (multi-select cpf/cnpj/none). Server aplica
   * `matchDocumentTypes` quando array não-vazio.
   */
  documentTypes?: DocumentTypeFilter[];
  /**
   * v0.32 — stack de ordenação client-side. Server replica via
   * `sortConversasByStack` antes de gerar o XLSX (DRY com a tabela).
   */
  sortStack?: SortRule[];
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
  searchClientActive,
  searchClient,
  conditionGroup,
  documentTypes,
  sortStack,
}: ExportButtonProps) {
  const [pending, startTransition] = useTransition();
  const [internalLoading, setInternalLoading] = useState(false);

  const loading = pending || internalLoading;
  const disabled = rowCount === 0 || loading;

  const handleClick = () => {
    setInternalLoading(true);
    startTransition(async () => {
      try {
        const result = await exportConversasAction({
          filters,
          accountId,
          searchClient: searchClient && searchClient.trim() ? searchClient : undefined,
          conditionGroup,
          documentTypes,
          sortStack,
        });
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
      title={
        searchClientActive
          ? "A exportação inclui a busca aplicada e os filtros."
          : undefined
      }
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
