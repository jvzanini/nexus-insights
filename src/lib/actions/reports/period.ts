"use server";

import { auth } from "@/auth";
import { getChatwootPool } from "@/lib/chatwoot/pool";

/**
 * Retorna a data mais antiga em `conversations` para a `account_id` informada,
 * em formato ISO. Usado para limitar o `disabled={{ before }}` do calendário
 * de range customizado, sem hard-cap arbitrário.
 *
 * Fallback (sem sessão / erro / sem dados): 30 dias atrás.
 */
export async function getMinReportDate(accountId: number): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    return new Date(Date.now() - 30 * 86_400_000).toISOString();
  }

  try {
    const pool = getChatwootPool();
    const r = await pool.query<{ min_date: Date | null }>(
      "SELECT MIN(created_at) as min_date FROM conversations WHERE account_id = $1",
      [accountId],
    );
    const minDate = r.rows[0]?.min_date;
    if (!minDate) {
      return new Date(Date.now() - 30 * 86_400_000).toISOString();
    }
    return new Date(minDate).toISOString();
  } catch (err) {
    console.error("[getMinReportDate]", err);
    return new Date(Date.now() - 30 * 86_400_000).toISOString();
  }
}
