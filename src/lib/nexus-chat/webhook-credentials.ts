import { randomBytes } from "crypto";

/**
 * Token único do webhook do Nexus Chat para uma `nexus_chat_connection`.
 *
 * É a única autenticação do endpoint `/api/webhooks/nexus-chat/{token}`:
 * 32 bytes random hex (256 bits de entropia, não-enumerável). Account
 * Webhooks no Chatwoot self-hosted **não suportam HMAC** (apenas API
 * Channel + Agent Bot webhooks têm HMAC desde Chatwoot v4.13.0). Logo o
 * token na URL é a autenticação principal — atacante precisaria adivinhar
 * 256 bits, e tráfego é HTTPS-only.
 *
 * Caso futuro: se migrarmos para API Channel webhook ou se Account
 * Webhooks ganharem HMAC, o schema `nexus_chat_connections.webhook_secret_enc`
 * já existe na tabela (Fase 2 inicial) e pode ser populado retroativamente.
 */
export function generateWebhookToken(): string {
  return randomBytes(32).toString("hex");
}
