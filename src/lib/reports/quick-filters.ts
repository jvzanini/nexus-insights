// Atalhos rápidos do toolbar de Conversas. Cada atalho representa um
// "modo operacional" do dia a dia (sem resposta, não atribuídas, minhas)
// que se traduz em um ConditionGroup AND combinado com os filtros do modo
// Avançado. Não persistido — é estado transiente da sessão.

import type {
  Condition,
  ConditionGroup,
  ConditionGroupItem,
} from "@/lib/utils/apply-conditions";

export type QuickFilterKey = "no_response" | "unassigned" | "mine";

export interface QuickFilterDef {
  key: QuickFilterKey;
  label: string;
  description: string;
}

export const QUICK_FILTER_DEFS: QuickFilterDef[] = [
  {
    key: "no_response",
    label: "Sem resposta",
    description: "Conversas com pendência de resposta agora",
  },
  {
    key: "unassigned",
    label: "Não atribuídas",
    description: "Sem atendente designado",
  },
  {
    key: "mine",
    label: "Minhas",
    description: "Atribuídas ao seu usuário",
  },
];

/**
 * Constrói um ConditionGroup AND a partir dos atalhos ativos. Retorna
 * `null` quando nenhum atalho está ativo. O atalho "mine" é silenciosamente
 * ignorado se `currentChatwootUserId` for `null` (sem mapping User→Chatwoot).
 */
export function quickFiltersToConditionGroup(
  active: Set<QuickFilterKey>,
  currentChatwootUserId: number | null,
): ConditionGroup | null {
  const conditions: Condition[] = [];

  if (active.has("no_response")) {
    conditions.push({
      field: "waiting_seconds",
      operator: "gt",
      value: 0,
    });
  }
  if (active.has("unassigned")) {
    conditions.push({
      field: "assignee.id",
      operator: "eq",
      value: null,
    });
  }
  if (active.has("mine") && currentChatwootUserId != null) {
    conditions.push({
      field: "assignee.id",
      operator: "eq",
      value: currentChatwootUserId,
    });
  }

  if (conditions.length === 0) return null;
  // Schema v2 (v0.32+): items com connector AND per-par. Item 0 sem connector.
  const items: ConditionGroupItem[] = conditions.map((c, idx) => ({
    connector: idx === 0 ? undefined : "AND",
    node: c,
  }));
  return { items };
}

/**
 * Compõe múltiplos ConditionGroups com AND. Necessário pra combinar atalhos
 * com o conditionGroup do modo Avançado sem misturar combinator OR interno.
 *
 * - Argumentos `null`/`undefined` ou vazios são descartados.
 * - 1 grupo válido → retornado como está.
 * - 2+ grupos → embrulhados em `{ items: [{node:g1}, {connector:'AND',node:g2}, ...] }`.
 *
 * Schema v2 (v0.32+).
 */
export function mergeConditionGroups(
  ...groups: (ConditionGroup | null | undefined)[]
): ConditionGroup | null {
  const valid = groups.filter(
    (g): g is ConditionGroup => !!g && (g.items?.length ?? 0) > 0,
  );
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0]!;
  const items: ConditionGroupItem[] = valid.map((g, idx) => ({
    connector: idx === 0 ? undefined : "AND",
    node: g,
  }));
  return { items };
}
