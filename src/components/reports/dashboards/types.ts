import type { PeriodKey } from "@/lib/reports/period";

/**
 * Props comuns aos contents reusáveis dos super-relatórios (B8).
 * Cada content é um Server Component async que recebe o contexto
 * mínimo (account + período) e busca os próprios dados.
 */
export interface DashboardContentProps {
  accountId: number;
  period: PeriodKey;
  customStart: string | null;
  customEnd: string | null;
}
