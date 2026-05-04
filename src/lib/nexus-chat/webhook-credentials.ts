import { randomBytes } from "crypto";
import { encrypt } from "@/lib/encryption";

/**
 * Credenciais geradas para o webhook do Nexus Chat de uma `nexus_chat_connection`.
 *
 *  - **token**: parte pública do path da URL `/api/webhooks/nexus-chat/{token}`.
 *    Não é segredo (vai em texto na rede), mas tem 32 bytes random (256 bits)
 *    — não-enumerável e não-adivinhável.
 *  - **secretPlain**: chave HMAC compartilhada com o painel admin do Chatwoot.
 *    Mostrada UMA VEZ ao super_admin no Dialog (precisa ser copiada/colada lá
 *    no painel do Nexus Chat). Persistida apenas cifrada (`secretEnc`).
 *  - **secretEnc**: ciphertext AES-256-GCM via `src/lib/encryption.ts`. É o
 *    que vai pra coluna `webhook_secret_enc` em `nexus_chat_connections`.
 */
export interface WebhookCredentials {
  token: string;
  secretPlain: string;
  secretEnc: string;
}

/**
 * Gera credenciais novas (token + secret) para o webhook. Usado por:
 *   - `createNexusChatConnection` — toda conexão nova nasce com webhook.
 *   - `regenerateConnectionWebhookSecret` — rotação manual do secret.
 *   - `seed.ts` (backfill) — popula connections legadas (Fase 1) que ainda
 *     não tinham webhook.
 *
 * **`secretPlain` é retornado apenas neste momento**. Não fica persistido
 * em nenhum lugar não-cifrado. O caller (Server Action) é responsável por
 * propagar o `secretPlain` para a UI ao usuário em uma única exibição.
 */
export function generateWebhookCredentials(): WebhookCredentials {
  const token = randomBytes(32).toString("hex");
  const secretPlain = randomBytes(32).toString("hex");
  const secretEnc = encrypt(secretPlain);
  return { token, secretPlain, secretEnc };
}
