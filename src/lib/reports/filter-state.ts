// Estado puro dos filtros avançados (AdvancedFilters).
// Mantém serialização/deserialização via URLSearchParams desacopladas
// do componente, permitindo testes unitários e uso em Server Components.
//
// O único PeriodKey aceito aqui é o canônico de `@/lib/datetime-core`
// (hoje | semana_atual | mes_atual | custom). Chaves legadas são
// rejeitadas e caem no default "hoje".

import type { PeriodKey } from "@/lib/datetime-core";
import type { ConditionGroup } from "@/lib/utils/apply-conditions";
import {
  encodeConditionGroup,
  decodeConditionGroup,
} from "./condition-group-codec";

export type FilterMode = "simple" | "advanced";

/** Tipo de documento detectado em uma conversa. */
export type DocumentTypeFilter = "cpf" | "cnpj" | "none";

export interface FilterState {
  period: PeriodKey;
  customRange?: { start: string; end: string }; // ISO yyyy-mm-dd
  inboxIds: number[];
  teamIds: number[];
  assigneeIds: number[];
  statuses: number[];
  priorities: number[];
  labelIds: number[];
  /** Filtro por tipo de documento (CPF/CNPJ/Sem). Multi-select OR. Default []. */
  documentTypes: DocumentTypeFilter[];
  search?: string;
  /** Modo simples (padrão) usa multi-selects nativos; advanced usa where-clause builder. */
  mode: FilterMode;
  /** Só usado quando `mode === "advanced"`. Serializado em base64url no param `cg`. */
  conditionGroup?: ConditionGroup;
  /** Página atual (1-based). Default 1 (não persiste em URL quando = 1). */
  page?: number;
}

export const EMPTY_FILTER_STATE: FilterState = {
  period: "hoje",
  inboxIds: [],
  teamIds: [],
  assigneeIds: [],
  statuses: [],
  priorities: [],
  labelIds: [],
  documentTypes: [],
  mode: "simple",
};

const DOC_TYPE_VALUES: readonly DocumentTypeFilter[] = ["cpf", "cnpj", "none"];

function isDocumentTypeFilter(v: string): v is DocumentTypeFilter {
  return (DOC_TYPE_VALUES as readonly string[]).includes(v);
}

export function serializeFilterState(state: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  p.set("period", state.period);
  if (state.period === "custom" && state.customRange) {
    p.set("custom_start", state.customRange.start);
    p.set("custom_end", state.customRange.end);
  }
  if (state.inboxIds.length) p.set("inbox", state.inboxIds.join(","));
  if (state.teamIds.length) p.set("team", state.teamIds.join(","));
  if (state.assigneeIds.length) p.set("assignee", state.assigneeIds.join(","));
  if (state.statuses.length) p.set("status", state.statuses.join(","));
  if (state.priorities.length) p.set("priority", state.priorities.join(","));
  if (state.labelIds.length) p.set("label", state.labelIds.join(","));
  if (state.documentTypes && state.documentTypes.length) {
    p.set("docTypes", state.documentTypes.join(","));
  }
  if (state.search?.trim()) p.set("q", state.search.trim());
  if (state.mode === "advanced") {
    p.set("mode", "advanced");
    if (state.conditionGroup) {
      const encoded = encodeConditionGroup(state.conditionGroup);
      // Se exceder o cap de 4kB, conditionGroup é omitido da URL.
      // Caller deve persistir em localStorage.
      if (encoded) p.set("cg", encoded);
    }
  }
  if (state.page && state.page > 1) p.set("page", String(state.page));
  return p;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function deserializeFilterState(params: URLSearchParams): FilterState {
  const periodRaw = params.get("period") ?? "hoje";
  const validPeriod: PeriodKey =
    periodRaw === "hoje" ||
    periodRaw === "semana_atual" ||
    periodRaw === "mes_atual" ||
    periodRaw === "todos" ||
    periodRaw === "custom"
      ? (periodRaw as PeriodKey)
      : "hoje";

  let customRange: FilterState["customRange"] | undefined;
  if (validPeriod === "custom") {
    const s = params.get("custom_start");
    const e = params.get("custom_end");
    if (s && e && ISO_DATE.test(s) && ISO_DATE.test(e)) {
      customRange = { start: s, end: e };
    }
  }

  const parseIds = (raw: string | null): number[] =>
    raw
      ? raw
          .split(",")
          .map((v) => Number.parseInt(v, 10))
          .filter(Number.isFinite)
      : [];

  const docTypesRaw = params.get("docTypes");
  const documentTypes: DocumentTypeFilter[] = docTypesRaw
    ? docTypesRaw
        .split(",")
        .map((t) => t.trim())
        .filter(isDocumentTypeFilter)
    : [];

  const modeRaw = params.get("mode");
  const mode: FilterMode = modeRaw === "advanced" ? "advanced" : "simple";

  const cg = params.get("cg");
  const conditionGroup = cg ? (decodeConditionGroup(cg) ?? undefined) : undefined;

  const pageRaw = params.get("page");
  const pageNum = pageRaw ? Number(pageRaw) : NaN;
  const page = Number.isFinite(pageNum) && pageNum > 1
    ? Math.floor(pageNum)
    : undefined;

  return {
    period: validPeriod,
    customRange,
    inboxIds: parseIds(params.get("inbox")),
    teamIds: parseIds(params.get("team")),
    assigneeIds: parseIds(params.get("assignee")),
    statuses: parseIds(params.get("status")),
    priorities: parseIds(params.get("priority")),
    labelIds: parseIds(params.get("label")),
    documentTypes,
    search: params.get("q") ?? undefined,
    mode,
    conditionGroup,
    page,
  };
}

export interface DiffOptions {
  /** Se true, não conta diff de `mode`. Útil para esconder contador "Aplicar (N)" fantasma quando troca de tab. */
  ignoreMode?: boolean;
  /** Se true, não conta diff de `search`. Útil quando search é client-side e não muda o pendingDiff. */
  ignoreSearch?: boolean;
}

export function diffFilterStates(
  a: FilterState,
  b: FilterState,
  opts: DiffOptions = {},
): number {
  let diff = 0;
  if (a.period !== b.period) diff++;
  if (
    JSON.stringify(a.customRange ?? null) !==
    JSON.stringify(b.customRange ?? null)
  )
    diff++;
  if (a.inboxIds.join(",") !== b.inboxIds.join(",")) diff++;
  if (a.teamIds.join(",") !== b.teamIds.join(",")) diff++;
  if (a.assigneeIds.join(",") !== b.assigneeIds.join(",")) diff++;
  if (a.statuses.join(",") !== b.statuses.join(",")) diff++;
  if (a.priorities.join(",") !== b.priorities.join(",")) diff++;
  if (a.labelIds.join(",") !== b.labelIds.join(",")) diff++;
  if ((a.documentTypes ?? []).join(",") !== (b.documentTypes ?? []).join(",")) diff++;
  if (!opts.ignoreSearch && (a.search ?? "") !== (b.search ?? "")) diff++;
  if (!opts.ignoreMode && a.mode !== b.mode) diff++;
  if (
    JSON.stringify(a.conditionGroup ?? null) !==
    JSON.stringify(b.conditionGroup ?? null)
  )
    diff++;
  return diff;
}

export function isFilterStateEqual(a: FilterState, b: FilterState): boolean {
  return diffFilterStates(a, b) === 0;
}
