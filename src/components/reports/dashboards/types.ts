import type { PeriodKey } from "@/lib/reports/period";

/**
 * Props comuns aos contents reusáveis dos super-relatórios (B8).
 * Cada content é um Server Component async que recebe o contexto
 * mínimo (connection + account + período) e busca os próprios dados.
 *
 * `connectionId` é resolvido na page server via `getActiveConnectionId(user)`
 * e propagado para as queries (multi-tenant Realtime fase 1).
 */
export interface DashboardContentProps {
  connectionId: string;
  accountId: number;
  period: PeriodKey;
  customStart: string | null;
  customEnd: string | null;
}
