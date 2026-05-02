"use server";

import { auth } from "@/auth";
import { getCurrentUser } from "@/lib/auth";
import { runNexAgent } from "@/lib/llm/agent/run-nex";
import type { ChatMessage } from "@/lib/llm/types";
import {
  getActiveAccountId,
  NoAccessibleAccountError,
} from "@/lib/reports/active-account";
import type { AuthUser } from "@/lib/auth-helpers";
import { getKbDocsForPrompt } from "@/lib/nex/kb";
import { composeSystemPrompt, type NexPromptConfig } from "@/lib/nex/prompt";

export type SendNexMessageResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/** Cap defensivo para o input do Playground (UI mostra contador X/1000). */
const PLAYGROUND_MAX_INPUT_LEN = 1000;

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

  const authUser = await getCurrentUser();
  if (!authUser) {
    return { ok: false, error: "Não autenticado" };
  }

  let accountId: number;
  try {
    accountId = await getActiveAccountId(authUser as AuthUser);
  } catch (err) {
    if (err instanceof NoAccessibleAccountError) {
      return { ok: false, error: "Sem acesso a nenhuma conta" };
    }
    throw err;
  }
  const userId = authUser.id;
  const platformRole = authUser.platformRole;

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

/**
 * Playground do Prompt — testa o system prompt composto a partir do FORM
 * atual (sem salvar no banco) contra a chave/modelo ativos.
 *
 * Não persiste mensagens. Não loga consumo (`isPlayground=true`).
 */
export async function testNexPromptAction(
  promptText: string,
  cfg: NexPromptConfig,
): Promise<SendNexMessageResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Não autenticado" };
  }

  const text = (promptText ?? "").trim();
  if (text.length === 0) {
    return { ok: false, error: "Mensagem vazia" };
  }
  if (text.length > PLAYGROUND_MAX_INPUT_LEN) {
    return {
      ok: false,
      error: `Mensagem > ${PLAYGROUND_MAX_INPUT_LEN} chars`,
    };
  }

  // Compõe o system prompt a partir da config recebida (estado do form).
  const kbDocs = cfg.kbEnabled ? await getKbDocsForPrompt() : [];
  const composed = composeSystemPrompt(cfg, kbDocs);

  const authUser = await getCurrentUser();
  if (!authUser) {
    return { ok: false, error: "Não autenticado" };
  }

  let accountId: number;
  try {
    accountId = await getActiveAccountId(authUser as AuthUser);
  } catch (err) {
    if (err instanceof NoAccessibleAccountError) {
      return { ok: false, error: "Sem acesso a nenhuma conta" };
    }
    throw err;
  }
  const userId = authUser.id;
  const platformRole = authUser.platformRole;

  const result = await runNexAgent({
    messages: [{ role: "user", content: text }],
    accountId,
    userId,
    platformRole,
    promptOverride: composed,
    isPlayground: true,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, message: result.message };
}
