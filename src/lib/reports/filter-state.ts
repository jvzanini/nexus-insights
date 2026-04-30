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

export interface FilterState {
  period: PeriodKey;
  customRange?: { start: string; end: string }; // ISO yyyy-mm-dd
  inboxIds: number[];
  teamIds: number[];
  assigneeIds: number[];
  statuses: number[];
  priorities: number[];
  labelIds: number[];
  search?: string;
  /** Modo simples (padrão) usa multi-selects nativos; advanced usa where-clause builder. */
  mode: FilterMode;
  /** Só usado quando `mode === "advanced"`. Serializado em base64url no param `cg`. */
  conditionGroup?: ConditionGroup;
}

export const EMPTY_FILTER_STATE: FilterState = {
  period: "hoje",
  inboxIds: [],
  teamIds: [],
  assigneeIds: [],
  statuses: [],
  priorities: [],
  labelIds: [],
  mode: "simple",
};

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

  const modeRaw = params.get("mode");
  const mode: FilterMode = modeRaw === "advanced" ? "advanced" : "simple";

  const cg = params.get("cg");
  const conditionGroup = cg ? (decodeConditionGroup(cg) ?? undefined) : undefined;

  return {
    period: validPeriod,
    customRange,
    inboxIds: parseIds(params.get("inbox")),
    teamIds: parseIds(params.get("team")),
    assigneeIds: parseIds(params.get("assignee")),
    statuses: parseIds(params.get("status")),
    priorities: parseIds(params.get("priority")),
    labelIds: parseIds(params.get("label")),
    search: params.get("q") ?? undefined,
    mode,
    conditionGroup,
  };
}

export function diffFilterStates(a: FilterState, b: FilterState): number {
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
  if ((a.search ?? "") !== (b.search ?? "")) diff++;
  if (a.mode !== b.mode) diff++;
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
