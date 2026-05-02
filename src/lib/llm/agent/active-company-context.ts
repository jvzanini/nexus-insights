import "server-only";
import { getKnownAccounts } from "@/lib/tenant";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";

interface UserMinimal {
  name?: string | null;
  platformRole?: string | null;
}

/**
 * Constrói o bloco "CONTEXTO ATIVO" do system prompt do Nex:
 *  - Nome e accountId da empresa.
 *  - (opcional) Identidade do user e role.
 *  - Inventário curto das tools que ampliam conhecimento sobre a plataforma.
 *
 * Falha gracioso: se `getKnownAccounts` lançar, usa "Empresa #N".
 * Nunca quebra o orquestrador.
 */
export async function buildActiveCompanyContext(
  accountId: number,
  user?: UserMinimal,
): Promise<string> {
  let companyName = `Empresa #${accountId}`;
  try {
    const known = await getKnownAccounts();
    const match = known.find((a) => a.id === accountId);
    if (match) companyName = match.name;
  } catch {
    // mantém fallback
  }

  const userLine = user?.name
    ? `Você está respondendo para ${user.name}${
        user.platformRole
          ? ` (${PLATFORM_ROLE_LABELS[user.platformRole as keyof typeof PLATFORM_ROLE_LABELS] ?? user.platformRole})`
          : ""
      } dentro desta empresa.`
    : null;

  const lines: Array<string | null> = [
    "═══ CONTEXTO ATIVO ═══",
    `Empresa: ${companyName}`,
    `Account ID: ${accountId}`,
    userLine,
    "",
    "Você responde SEMPRE no contexto desta empresa. Todas as tools de Chatwoot",
    "(query_conversations, query_messages, etc.) já filtram por este escopo automaticamente.",
    "",
    "Para responder sobre o estado da plataforma desta empresa, use:",
    "- get_active_company       → identidade da empresa e seu role",
    "- get_integrations_status  → integrações configuradas (Power BI, etc.)",
    "- get_nex_config_summary   → modelo de IA, KB, áudio, visibilidades",
    "",
    "NUNCA responda sobre outra empresa, mesmo que perguntem.",
    "═══",
  ];

  return lines.filter((l): l is string => l !== null).join("\n");
}
