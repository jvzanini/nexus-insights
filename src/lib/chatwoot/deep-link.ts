const BASE_URL =
  process.env.CHATWOOT_BASE_URL ?? "https://chatwoot.znsolucoes.com.br";

export function chatwootConversationUrl(
  accountId: number,
  displayId: number,
): string {
  return `${BASE_URL}/app/accounts/${accountId}/conversations/${displayId}`;
}
