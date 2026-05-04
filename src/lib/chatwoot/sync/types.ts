/**
 * Resultado de sincronizar 1 tabela.
 *
 * Por que separar `rowsAffected` (delta) de `nextCursor`? Quando sincronizamos
 * em batches de 5000, podemos terminar com cursor avançado mesmo se o batch
 * mais recente teve 0 rows efetivamente novos no nosso lado (ex: já estavam
 * lá via outro caminho).
 */
export interface TableSyncResult {
  /** Nome da tabela alvo no Chatwoot. */
  tableName: string;
  /** Quantas rows foram lidas do Chatwoot neste run. */
  rowsRead: number;
  /** Quantas rows foram efetivamente alteradas (insert + update) no nosso lado. */
  rowsAffected: number;
  /** Próximo valor de cursor (timestamp ou id). */
  nextCursor:
    | { kind: "timestamp"; value: Date }
    | { kind: "id"; value: bigint }
    | { kind: "none" };
  /** Duração em ms do sync desta tabela. */
  durationMs: number;
}

/**
 * Sumário de uma execução completa de delta-sync (1 connection × N tabelas × M accounts).
 */
export interface SyncRunSummary {
  connectionId: string;
  startedAt: Date;
  finishedAt: Date;
  totalDurationMs: number;
  perTable: TableSyncResult[];
  errors: Array<{ tableName: string; accountId: number; error: string }>;
  /** True se ≥1 row foi alterada → publicar facts:refreshed. */
  hadChanges: boolean;
}

/**
 * Estratégia de cursor por tabela.
 *
 * - "updated_at": tabelas que atualizam updated_at em UPDATE (conversations,
 *   messages, contacts, etc).
 * - "id": tabelas append-only sem updated_at (taggings).
 *
 * Determinada na implementação de cada table-sync, hardcoded.
 */
export type CursorStrategy = "updated_at" | "id";

/**
 * Argumentos passados a cada `TableSync.run`.
 */
export interface TableSyncArgs {
  connectionId: string;
  accountId: number;
  /** Limite de rows por batch (default 5000). Implementação pode ignorar. */
  batchLimit?: number;
}

/**
 * Interface que toda table-sync deve implementar.
 */
export interface TableSync {
  tableName: string;
  cursorStrategy: CursorStrategy;
  run: (args: TableSyncArgs) => Promise<TableSyncResult>;
}
