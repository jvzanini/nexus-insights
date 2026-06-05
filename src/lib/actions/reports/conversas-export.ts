"use server";

import { getCurrentUser } from "@/lib/auth";
import { isReportVisibleForUser } from "@/lib/reports/visibility";
import { conversasList } from "@/lib/chatwoot/queries/conversas-list";
import { buildConversasXlsxBuffer } from "@/lib/reports/conversas-xlsx";
import { getAccessibleTeamIds } from "@/lib/tenant";
import { getActiveConnectionId } from "@/lib/reports/active-connection";
import { matchSearchClient } from "@/lib/reports/match-search-client";
import { applyConditions } from "@/lib/utils/apply-conditions";
import { matchDocumentTypes } from "@/lib/reports/match-document-types";
import { matchLocation } from "@/lib/reports/match-location";
import { sortConversasByStack } from "@/lib/reports/sort-conversas";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import type { AuthUser } from "@/lib/auth-helpers";
import type { ConditionGroup } from "@/lib/utils/apply-conditions";
import type { DocumentTypeFilter } from "@/lib/reports/match-document-types";
import type { SortRule } from "@/components/reports/sorting-dialog";

const DEFAULT_ACCOUNT_ID = 9; // Matrix Fitness Group (single-tenant atualmente).
const MAX_EXPORT_ROWS = 50_000;

export interface ExportConversasInput {
  filters: ReportFilters;
  accountId?: number;
  /**
   * v0.32 — busca client-side aplicada na barra "Buscar". Server replica via
   * `matchSearchClient` para que o XLSX bata com a tabela visível.
   */
  searchClient?: string;
  /**
   * v0.32 — where-clause builder do filtro Avançado (ConditionGroup v2 com
   * connector per-par). Server replica via `applyConditions`.
   */
  conditionGroup?: ConditionGroup;
  /**
   * v0.32 — filtro Documento (multi-select "Com CPF" / "Com CNPJ" / "Sem
   * documento"). Server replica via `matchDocumentTypes`.
   */
  documentTypes?: DocumentTypeFilter[];
  /**
   * País(es) do contato (valores canônicos string, ex.: "Brasil"). Server
   * replica o filtro client-side via `matchLocation`.
   */
  countries?: string[];
  /**
   * Estado(s)/cidade(s) do contato (valores canônicos string, ex.:
   * "MG-Minas Gerais"). Server replica o filtro via `matchLocation`.
   */
  estados?: string[];
  /**
   * v0.32 — ordenação client-side (stack de SortRules). Server replica via
   * `sortConversasByStack` (DRY com a tabela).
   */
  sortStack?: SortRule[];
}

export interface ExportConversasResult {
  base64?: string;
  filename?: string;
  truncated?: boolean;
  droppedAttrCount?: number;
  error?: string;
}

function periodTag(filters: ReportFilters): string {
  const start = filters.period?.start ? new Date(filters.period.start) : null;
  const end = filters.period?.end ? new Date(filters.period.end) : null;
  if (!start || !end) return "todos";
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `${fmt(start)}_${fmt(end)}`;
}

function timestampTag(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}`;
}

/**
 * Server Action: gera XLSX de conversas em base64.
 *
 * Aplica scope multi-tenant via getCurrentUser + getAccessibleTeamIds, valida
 * visibilidade do relatório, busca até MAX_EXPORT_ROWS via conversasList e
 * delega geração do XLSX para buildConversasXlsxBuffer.
 *
 * Retorna `{ base64, filename, truncated, droppedAttrCount }` em caso de
 * sucesso ou `{ error }` em caso de falha.
 *
 * NOTE: registro em audit_logs ainda não é feito porque o enum AuditAction
 * (prisma/schema.prisma) não possui valor "report_exported"; tocar no schema
 * está reservado para outro agente. Adicionar a action e wire-up de logAudit
 * em release subsequente.
 */
export async function exportConversasAction(
  args: ExportConversasInput,
): Promise<ExportConversasResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Não autenticado" };

  const visible = await isReportVisibleForUser("conversas", user.platformRole);
  if (!visible) return { error: "Relatório indisponível" };

  const accountId = args.accountId ?? DEFAULT_ACCOUNT_ID;

  const teamScope = await getAccessibleTeamIds(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      isOwner: user.isOwner,
      mustChangePassword: user.mustChangePassword,
      avatarUrl: user.avatarUrl,
      theme: user.theme,
      accountIds: user.accountIds,
      teamIds: user.teamIds,
    } satisfies AuthUser,
    accountId,
  );

  const scopedFilters: ReportFilters = { ...args.filters };
  if (teamScope !== "all") {
    if (teamScope.length === 0) {
      return { error: "Sem conversas para exportar" };
    }
    if (scopedFilters.teamIds && scopedFilters.teamIds.length > 0) {
      scopedFilters.teamIds = scopedFilters.teamIds.filter((id) =>
        teamScope.includes(id),
      );
      if (scopedFilters.teamIds.length === 0) {
        return { error: "Sem conversas para exportar" };
      }
    } else {
      scopedFilters.teamIds = teamScope;
    }
  }

  try {
    const connectionId = await getActiveConnectionId({
      id: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      isOwner: user.isOwner,
      mustChangePassword: user.mustChangePassword,
      avatarUrl: user.avatarUrl,
      theme: user.theme,
      accountIds: user.accountIds,
      teamIds: user.teamIds,
    } satisfies AuthUser);

    const result = await conversasList({
      connectionId,
      accountId,
      filters: scopedFilters,
      cursor: null,
      limit: MAX_EXPORT_ROWS,
    });

    let rows = result.data.rows;
    if (rows.length === 0) {
      return { error: "Sem conversas para exportar" };
    }

    // v0.32 — replica pipeline client-side para que o XLSX exportado bata
    // exatamente com a tabela visível. Ordem espelha `<ConversasTable>`:
    //   matchSearchClient → applyConditions → matchDocumentTypes → sortConversasByStack
    if (args.searchClient && args.searchClient.trim()) {
      rows = matchSearchClient(rows, args.searchClient);
    }
    if (args.conditionGroup && args.conditionGroup.items?.length) {
      rows = applyConditions(rows, args.conditionGroup);
    }
    if (args.documentTypes && args.documentTypes.length > 0) {
      rows = matchDocumentTypes(rows, args.documentTypes);
    }
    if (args.countries?.length || args.estados?.length) {
      rows = matchLocation(rows, args.countries ?? [], args.estados ?? []);
    }
    if (args.sortStack && args.sortStack.length > 0) {
      rows = sortConversasByStack(rows, args.sortStack);
    }

    if (rows.length === 0) {
      return { error: "Sem conversas para exportar" };
    }

    const truncated = Boolean(result.data.nextCursor);

    const { buffer, droppedAttrCount } = await buildConversasXlsxBuffer({ rows });

    const filename = `conversas_${accountId}_${periodTag(scopedFilters)}_${timestampTag()}.xlsx`;
    const base64 = buffer.toString("base64");

    return { base64, filename, truncated, droppedAttrCount };
  } catch (err) {
    console.error("[exportConversasAction]", err);
    return { error: "Erro ao gerar planilha" };
  }
}
