/**
 * Testes do orquestrador `runNexAgent`.
 *
 * Estratégia:
 *  - `clientOverride: null` → simula ausência de provedor configurado.
 *  - `clientOverride: <fake>` → simula provider que responde direto ou pede tool call.
 *  - `executeTool` é mockado para evitar tocar no Postgres em testes.
 *  - `usage-logger` é mockado para evitar `pg`.
 */

jest.mock("@/lib/llm/tools/executor", () => ({
  executeTool: jest.fn(async () => ({ result: { mocked: true } })),
}));

jest.mock("@/lib/llm/agent/usage-logger", () => ({
  logUsage: jest.fn(async () => {}),
}));

// shouldExcludeMatrixIA toca em auth() (NextAuth) que não roda em ambiente
// jest. v0.13.7: mockamos para isolar o orquestrador.
jest.mock("@/lib/reports/exclude-matrix-ia", () => ({
  shouldExcludeMatrixIA: jest.fn(async () => false),
  shouldExcludeMatrixIAForRole: jest.fn(async () => false),
}));

// T8: runNexAgent compõe o system prompt dinamicamente via @/lib/nex/prompt +
// @/lib/nex/kb. Mockamos para isolar o orquestrador dos efeitos de DB/server-only.
jest.mock("@/lib/nex/prompt", () => ({
  getNexPromptConfig: jest.fn(async () => ({
    personality: "",
    tone: "",
    guardrails: [],
    advancedOverride: null,
    audioInputEnabled: false,
    kbEnabled: false,
  })),
  composeSystemPrompt: jest.fn(() => "BASE"),
}));

jest.mock("@/lib/nex/kb", () => ({
  getKbDocsForPrompt: jest.fn(async () => []),
}));

// T6: run-nex importa buildActiveCompanyContext que vai em @/lib/tenant
// (Prisma). Mockamos para isolar.
jest.mock("@/lib/llm/agent/active-company-context", () => ({
  buildActiveCompanyContext: jest.fn(async () => "CTX"),
}));

import { runNexAgent } from "@/lib/llm/agent/run-nex";
import { executeTool } from "@/lib/llm/tools/executor";
import { logUsage } from "@/lib/llm/agent/usage-logger";
import type { ChatRequest, ChatResult, ProviderClient } from "@/lib/llm/types";

function makeFakeClient(handlers: Array<(req: ChatRequest) => ChatResult>): ProviderClient {
  let i = 0;
  return {
    provider: "openai",
    model: "gpt-4o-mini",
    async chat(req: ChatRequest): Promise<ChatResult> {
      const handler = handlers[Math.min(i, handlers.length - 1)];
      i += 1;
      return handler(req);
    },
  };
}

describe("runNexAgent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna erro quando não há provider configurado", async () => {
    const result = await runNexAgent({
      messages: [{ role: "user", content: "Olá" }],
      accountId: 9,
      clientOverride: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/provedor de IA/i);
    }
  });

  it("retorna a mensagem direta quando o modelo responde sem tool calls", async () => {
    const fake = makeFakeClient([
      () => ({
        message: "Resposta direta do modelo.",
        usage: { tokensInput: 10, tokensOutput: 5, costUsd: 0.0001 },
      }),
    ]);

    const result = await runNexAgent({
      messages: [{ role: "user", content: "Quantas conversas?" }],
      accountId: 9,
      clientOverride: fake,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe("Resposta direta do modelo.");
      expect(result.usage.tokensInput).toBe(10);
      expect(result.usage.tokensOutput).toBe(5);
    }
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("executa a tool quando o modelo solicita e retorna a resposta final do segundo turno", async () => {
    const fake = makeFakeClient([
      () => ({
        message: "",
        toolCalls: [
          {
            id: "call_1",
            name: "query_conversations",
            arguments: { status: 0 },
          },
        ],
        usage: { tokensInput: 20, tokensOutput: 8, costUsd: 0.0002 },
      }),
      () => ({
        message: "Existem 42 conversas em aberto.",
        usage: { tokensInput: 30, tokensOutput: 10, costUsd: 0.0003 },
      }),
    ]);

    const result = await runNexAgent({
      messages: [{ role: "user", content: "Quantas em aberto?" }],
      accountId: 9,
      clientOverride: fake,
    });

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith(
      "query_conversations",
      { status: 0 },
      9,
      false, // excludeMatrixIA — mock retorna false (não exclui)
      null, // platformRole — não passado neste cenário
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe("Existem 42 conversas em aberto.");
      // Soma de usage dos dois turnos.
      expect(result.usage.tokensInput).toBe(50);
      expect(result.usage.tokensOutput).toBe(18);
    }
  });

  it("aborta após o limite de iterações se o modelo só pede tools", async () => {
    const fake = makeFakeClient([
      () => ({
        message: "",
        toolCalls: [
          { id: "x", name: "query_conversations", arguments: {} },
        ],
        usage: { tokensInput: 5, tokensOutput: 1, costUsd: 0 },
      }),
    ]);

    const result = await runNexAgent({
      messages: [{ role: "user", content: "loop" }],
      accountId: 9,
      clientOverride: fake,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/loop/i);
    }
  });

  it("não chama logUsage quando isPlayground=true", async () => {
    const fake = makeFakeClient([
      () => ({
        message: "Resposta playground.",
        usage: { tokensInput: 12, tokensOutput: 6, costUsd: 0.0001 },
      }),
    ]);

    const result = await runNexAgent({
      messages: [{ role: "user", content: "Teste" }],
      accountId: 9,
      clientOverride: fake,
      isPlayground: true,
    });

    expect(result.ok).toBe(true);
    expect(logUsage).not.toHaveBeenCalled();
  });

  it("usa promptOverride como system prompt quando fornecido", async () => {
    let capturedSystem: string | null = null;
    const fake: ProviderClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      async chat(req: ChatRequest): Promise<ChatResult> {
        const sys = req.messages.find((m) => m.role === "system");
        capturedSystem =
          (sys && typeof sys.content === "string" ? sys.content : null) ?? null;
        return {
          message: "ok",
          usage: { tokensInput: 1, tokensOutput: 1, costUsd: 0 },
        };
      },
    };

    const result = await runNexAgent({
      messages: [{ role: "user", content: "oi" }],
      accountId: 9,
      clientOverride: fake,
      promptOverride: "CUSTOM",
    });

    expect(result.ok).toBe(true);
    // T6: agora é baseSystemPrompt + "\n\n" + companyContext.
    expect(capturedSystem).toBe("CUSTOM\n\nCTX");
  });
});
