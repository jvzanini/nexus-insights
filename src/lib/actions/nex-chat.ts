"use server";

import { auth } from "@/auth";
import { runNexAgent } from "@/lib/llm/agent/run-nex";
import type { ChatMessage } from "@/lib/llm/types";
import { getActiveAccountId } from "@/lib/reports/active-account";

export type SendNexMessageResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Envia o histórico de mensagens (apenas user/assistant — sem system) ao
 * Agente Nex e devolve a próxima resposta.
 *
 * O histórico recebido pode conter mensagens com `toolCalls`/`role: "tool"`
 * apenas se a UI quiser preservar esse contexto entre turnos. Em geral, basta
 * enviar `user` + `assistant` finais.
 */
export async function sendNexMessage(
  messages: ChatMessage[],
): Promise<SendNexMessageResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Não autenticado" };
  }

  // Filtra system messages para não duplicar — o orquestrador injeta o seu próprio.
  const filtered = (messages ?? []).filter((m) => m.role !== "system");

  if (filtered.length === 0) {
    return { ok: false, error: "Nenhuma mensagem para enviar" };
  }

  const accountId = await getActiveAccountId();
  const userId = (session.user as { id?: string }).id;
  const platformRole = (session.user as { platformRole?: string }).platformRole;

  const result = await runNexAgent({
    messages: filtered,
    accountId,
    userId,
    platformRole,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, message: result.message };
}
