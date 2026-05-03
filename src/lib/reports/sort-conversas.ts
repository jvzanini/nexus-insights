/**
 * Ordenação de ConversaRow por uma stack de SortRule (server-safe).
 *
 * Replica EXATAMENTE o `sortedRows` useMemo de `<ConversasTable>` (v0.32+),
 * permitindo que o pipeline server (export action) produza o mesmo resultado
 * que a tabela visível no client.
 *
 * Estável: rules empatadas preservam a ordem original (decorate-sort-undecorate
 * com índice).
 *
 * Pure server-safe: importa apenas `null-compare` e `format-document`, ambos
 * sem deps de browser/React.
 */
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import type { SortRule } from "@/components/reports/sorting-dialog";
import {
  nullableNumberCompare,
  nullableStringCompare,
  nullableDateCompare,
} from "@/lib/utils/null-compare";
import { detectDocument } from "@/lib/utils/format-document";

const COMPARE_BY_KEY: Record<
  string,
  (a: ConversaRow, b: ConversaRow) => number
> = {
  display_id: (a, b) => a.display_id - b.display_id,
  name: (a, b) => nullableStringCompare(a.contact.name, b.contact.name),
  document: (a, b) =>
    nullableStringCompare(
      detectDocument({
        identifier: a.contact.identifier,
        additional_attributes: a.contact.additional_attributes,
      })?.formatted ?? null,
      detectDocument({
        identifier: b.contact.identifier,
        additional_attributes: b.contact.additional_attributes,
      })?.formatted ?? null,
    ),
  inbox: (a, b) => nullableStringCompare(a.inbox.name, b.inbox.name),
  team: (a, b) => nullableStringCompare(a.team.name, b.team.name),
  assignee: (a, b) =>
    nullableStringCompare(a.assignee.name, b.assignee.name),
  status: (a, b) => a.status - b.status,
  priority: (a, b) => nullableNumberCompare(a.priority, b.priority),
  waiting_seconds: (a, b) =>
    nullableNumberCompare(a.waiting_seconds, b.waiting_seconds),
  open_seconds: (a, b) =>
    nullableNumberCompare(a.open_seconds, b.open_seconds),
  created_at: (a, b) => nullableDateCompare(a.created_at, b.created_at),
  last_activity_at: (a, b) =>
    nullableDateCompare(a.last_activity_at, b.last_activity_at),
};

export function sortConversasByStack(
  rows: ConversaRow[],
  stack: SortRule[],
): ConversaRow[] {
  if (stack.length === 0) return rows;
  const decorated = rows.map((row, idx) => ({ row, idx }));
  decorated.sort((A, B) => {
    for (const rule of stack) {
      const cmp = COMPARE_BY_KEY[rule.key];
      if (!cmp) continue;
      const factor = rule.direction === "asc" ? 1 : -1;
      const diff = cmp(A.row, B.row) * factor;
      if (diff !== 0) return diff;
    }
    return A.idx - B.idx; // estabilidade
  });
  return decorated.map((d) => d.row);
}
