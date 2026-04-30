import "server-only";

/**
 * Orquestrador do Agente Nex.
 *
 * Loop padrão de tool calling:
 *  1. Chama o provedor com o histórico + tool definitions.
 *  2. Se o modelo respondeu com `toolCalls`, executa cada uma e adiciona
 *     `role: "tool"` ao histórico, então repete.
 *  3. Se o modelo respondeu sem tool calls, retorna a mensagem final.
 *
 * Limite de iterações (5) impede runaway. Custo/tempo são acumulados e
 * registrados via `logUsage`.
 */

import { getActiveLlmClient } from "../get-client";
import { NEX_TOOLS } from "../tools/definitions";
import { executeTool } from "../tools/executor";
import type { ChatMessage, ChatUsage, ProviderClient } from "../types";

import { logUsage } from "./usage-logger";

const SYSTEM_PROMPT = `Você é o Agente Nex, assistente da plataforma Nexus Insights que analisa dados de atendimento do Chatwoot.

CAPACIDADES:
- Consultar conversas, mensagens, contatos e atendentes via tools.
- Agregar e cruzar dados (contagens, médias, top N).
- Responder em português brasileiro de forma direta e útil.

DIRETRIZES:
- Sempre use tools para obter dados — nunca invente números.
- Se o período for ambíguo, pergunte (ex.: "Você quer dados de hoje ou de outro período?").
- Apresente números formatados em pt-BR (ex.: 1.234, 12,5%).
- Para listas longas, mostre os 5-10 primeiros e ofereça expandir.
- Se a tool retornar erro, explique brevemente e sugira reformular.
- Use markdown para listas, **negrito** para destacar, tabelas quando útil.

TIMEZONE PADRÃO: America/Sao_Paulo (BRT). "Hoje" = das 00:00 às 23:59:59 BRT.`;

const MAX_ITERATIONS = 5;

export interface RunNexInput {
  messages: ChatMessage[];
  accountId: number;
  userId?: string;
  /** Injeção opcional para testes — quando ausente, usa `getActiveLlmClient()`. */
  clientOverride?: ProviderClient | null;
}

export type RunNexResult =
  | { ok: true; message: string; usage: ChatUsage }
  | { ok: false; error: string };

export async function runNexAgent(args: RunNexInput): Promise<RunNexResult> {
  const client =
    args.clientOverride !== undefined
      ? args.clientOverride
      : await getActiveLlmClient();

  if (!client) {
    return {
      ok: false,
      error:
        "Nenhum provedor de IA configurado. Vá em Configurações → Agente Nex.",
    };
  }

  const conversation: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...args.messages,
  ];

  const totalUsage: ChatUsage = {
    tokensInput: 0,
    tokensOutput: 0,
    costUsd: 0,
  };
  const start = Date.now();

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await client.chat({
      messages: conversation,
      tools: NEX_TOOLS,
    });

    totalUsage.tokensInput += result.usage.tokensInput;
    totalUsage.tokensOutput += result.usage.tokensOutput;
    totalUsage.costUsd += result.usage.costUsd;

    if (!result.toolCalls?.length) {
      // Resposta final — registra uso e retorna.
      void logUsage({
        provider: client.provider,
        model: client.model,
        tokensInput: totalUsage.tokensInput,
        tokensOutput: totalUsage.tokensOutput,
        costUsd: totalUsage.costUsd,
        promptChars: JSON.stringify(args.messages).length,
        responseChars: result.message.length,
        userId: args.userId,
        durationMs: Date.now() - start,
      });
      return { ok: true, message: result.message, usage: totalUsage };
    }

    // Adiciona assistant com tool_calls.
    conversation.push({
      role: "assistant",
      content: result.message,
      toolCalls: result.toolCalls,
    });

    // Executa cada tool e adiciona resultado como role: "tool".
    for (const tc of result.toolCalls) {
      const toolResult = await executeTool(
        tc.name,
        (tc.arguments ?? {}) as Record<string, unknown>,
        args.accountId,
      );
      conversation.push({
        role: "tool",
        toolCallId: tc.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  // Loop esgotou — registra como erro e retorna mensagem amigável.
  void logUsage({
    provider: client.provider,
    model: client.model,
    tokensInput: totalUsage.tokensInput,
    tokensOutput: totalUsage.tokensOutput,
    costUsd: totalUsage.costUsd,
    promptChars: JSON.stringify(args.messages).length,
    responseChars: 0,
    userId: args.userId,
    durationMs: Date.now() - start,
    errorMessage: "max_iterations_exceeded",
  });
  return {
    ok: false,
    error: "O agente ficou em loop. Tente reformular a pergunta.",
  };
}
