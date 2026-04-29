import { cookies } from "next/headers";

const COOKIE_NAME = "nexus_active_account";
const DEFAULT_ACCOUNT_ID = 9; // Matrix Fitness Group

/**
 * Lê o cookie `nexus_active_account` (gravado pelo account switcher) e
 * devolve o accountId numérico válido. Faz fallback para Matrix (9) se
 * o cookie estiver ausente ou inválido.
 *
 * Pages do app usam este helper como fonte de verdade do tenant ativo.
 * O cookie é setado pelo server action `switchAccount` em
 * `@/lib/actions/account-switch`.
 */
export async function getActiveAccountId(): Promise<number> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ACCOUNT_ID;
}
