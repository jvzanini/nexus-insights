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
 *
 * v0.15.0 (T8): system prompt é composto dinamicamente a partir de
 * `nex_settings` + KB (via `composeSystemPrompt`). Caller pode passar
 * `promptOverride` (usado pelo Playground) e `isPlayground=true` para
 * pular `logUsage` (testes não devem inflar consumo real).
 */

import { shouldExcludeMatrixIAForRole } from "@/lib/reports/exclude-matrix-ia";
import { composeSystemPrompt, getNexPromptConfig } from "@/lib/nex/prompt";
import { getKbDocsForPrompt } from "@/lib/nex/kb";

import { getActiveLlmClient } from "../get-client";
import { NEX_TOOLS } from "../tools/definitions";
import { executeTool } from "../tools/executor";
import type { ChatMessage, ChatUsage, ProviderClient } from "../types";

import { buildActiveCompanyContext } from "./active-company-context";
import { logUsage } from "./usage-logger";

const MAX_ITERATIONS = 5;

/** Cap defensivo para `promptOverride` (Playground). */
const MAX_PROMPT_OVERRIDE_LEN = 50_000;

/**
 * v0.31.0: regex ANCORADA em início-de-linha — exige que `[[suggestions]]`
 * esteja em sua própria linha (não no meio de texto). Aceita início de string
 * OU `\n` antes. Sem flag `s` (compatível ES2017).
 */
const SUGGESTIONS_RE = /(?:^|\n)\[\[suggestions\]\]:([^\n]+?)(?:\n|$)/;
const MAX_SUGGESTIONS = 3;
const MAX_SUGGESTION_LEN = 60;

/**
 * Extrai sugestões do sufixo `[[suggestions]]:item1|item2|...` quando
 * presente em linha própria no fim da resposta. Retorna `message` sem o
 * sufixo + array de sugestões (cap 4 itens, ≤80 chars cada).
 *
 * Quando não há sufixo, devolve a mensagem intacta + array vazio.
 */
export function extractSuggestions(text: string): {
  message: string;
  suggestions: string[];
} {
  const match = text.match(SUGGESTIONS_RE);
  if (!match) return { message: text, suggestions: [] };
  const raw = match[1].trim();
  const suggestions = raw
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= MAX_SUGGESTION_LEN)
    .slice(0, MAX_SUGGESTIONS);
  const message = text.replace(match[0], "").trimEnd();
  return { message, suggestions };
}

/** Fallback usado se a leitura de `nex_settings` ou da KB falhar. */
const FALLBACK_SYSTEM_PROMPT = "Você é o Agente Nex.";

/**
 * Resolve o system prompt:
 *  - Se `promptOverride` for fornecido (Playground): usa direto, com cap.
 *  - Senão: lê config + KB e compõe via `composeSystemPrompt`.
 *  - Em caso de falha (DB indisponível), devolve fallback mínimo.
 */
async function resolveSystemPrompt(
  promptOverride?: string,
): Promise<string> {
  if (typeof promptOverride === "string" && promptOverride.length > 0) {
    return promptOverride.slice(0, MAX_PROMPT_OVERRIDE_LEN);
  }
  try {
    const cfg = await getNexPromptConfig();
    const kbDocs = cfg.kbEnabled ? await getKbDocsForPrompt() : [];
    return composeSystemPrompt(cfg, kbDocs);
  } catch (err) {
    console.warn("[runNexAgent] resolveSystemPrompt falhou:", err);
    return FALLBACK_SYSTEM_PROMPT;
  }
}

export interface RunNexInput {
  messages: ChatMessage[];
  accountId: number;
  userId?: string;
  /** Nome do usuário corrente — usado em `buildActiveCompanyContext`. */
  userName?: string | null;
  /** Role do usuário corrente — propagado para `shouldExcludeMatrixIAForRole`. */
  platformRole?: string | null;
  /** Injeção opcional para testes — quando ausente, usa `getActiveLlmClient()`. */
  clientOverride?: ProviderClient | null;
  /** Override completo do system prompt (Playground). */
  promptOverride?: string;
  /** Quando true, pula TODOS os `logUsage` calls (Playground). */
  isPlayground?: boolean;
}

export type RunNexResult =
  | { ok: true; message: string; suggestions: string[]; usage: ChatUsage }
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

  const baseSystemPrompt = await resolveSystemPrompt(args.promptOverride);
  const companyContext = await buildActiveCompanyContext(
    args.accountId,
    args.userId
      ? { name: args.userName ?? null, platformRole: args.platformRole ?? null }
      : undefined,
  );
  const systemPrompt = baseSystemPrompt + "\n\n" + companyContext;

  const conversation: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...args.messages,
  ];

  const totalUsage: ChatUsage = {
    tokensInput: 0,
    tokensOutput: 0,
    costUsd: 0,
  };
  const start = Date.now();

  // Resolve a regra de visibility do Matrix IA UMA VEZ pra essa conversa.
  // Usa o role explícito vindo do caller (já resolvido pelo `auth()` da
  // Server Action) em vez de chamar `auth()` reentrante — fix do bug
  // v0.13.9 onde super_admin com visibility=super_admin_only era tratado
  // como sem role (excluía Matrix IA indevidamente).
  let excludeMatrixIA = false;
  try {
    excludeMatrixIA = await shouldExcludeMatrixIAForRole(args.platformRole);
  } catch (err) {
    console.warn("[runNexAgent] shouldExcludeMatrixIAForRole falhou:", err);
  }

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const iterStart = Date.now();
    const result = await client.chat({
      messages: conversation,
      tools: NEX_TOOLS,
    });

    totalUsage.tokensInput += result.usage.tokensInput;
    totalUsage.tokensOutput += result.usage.tokensOutput;
    totalUsage.costUsd += result.usage.costUsd;

    // Registra UMA row por iteração — alinha com a contagem do dashboard do
    // provider (cada `client.chat()` é cobrado/contado separadamente). v0.12.2
    // agregava em 1 row no fim, mascarando chamadas intermediárias de
    // tool-calling.
    //
    // v0.31.0: SEMPRE logamos (remove skip de v0.16). Propaga `isPlayground`
    // como flag — `usage-logger` (T-D2) persiste em `llm_usage.is_playground`
    // pra distinguir Bubble (false) vs Playground (true) no dashboard.
    void logUsage({
      provider: client.provider,
      model: client.model,
      tokensInput: result.usage.tokensInput,
      tokensOutput: result.usage.tokensOutput,
      costUsd: result.usage.costUsd,
      promptChars: i === 0 ? JSON.stringify(args.messages).length : 0,
      responseChars: result.message.length,
      userId: args.userId,
      durationMs: Date.now() - iterStart,
      errorMessage:
        i === MAX_ITERATIONS - 1 && result.toolCalls?.length
          ? "max_iterations_exceeded"
          : undefined,
      isPlayground: args.isPlayground ?? false,
    });

    if (!result.toolCalls?.length) {
      // Resposta final — extrai sufixo `[[suggestions]]` se presente (v0.31).
      const { message, suggestions } = extractSuggestions(result.message);
      return { ok: true, message, suggestions, usage: totalUsage };
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
        excludeMatrixIA,
        args.platformRole ?? null,
      );
      conversation.push({
        role: "tool",
        toolCallId: tc.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  // Loop esgotou — `logUsage` da última iteração já marcou max_iterations_exceeded.
  // Tempo total disponível em `start` se precisar.
  void start;
  return {
    ok: false,
    error: "O agente ficou em loop. Tente reformular a pergunta.",
  };
}
