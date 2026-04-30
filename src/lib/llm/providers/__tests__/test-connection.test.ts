import {
  deepTest,
  deepTestOpenAI,
  deepTestAnthropic,
  deepTestGemini,
  deepTestOpenRouter,
  describeErrorKind,
} from "../test-connection";

type FetchMock = jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>;

function mockJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockText(text: string, status = 200): Response {
  return new Response(text, { status });
}

describe("test-connection", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: FetchMock;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("deepTestOpenAI", () => {
    it("401 → invalid_key", async () => {
      fetchMock.mockResolvedValueOnce(mockJson({}, 401));
      const r = await deepTestOpenAI("badkey", "gpt-4o");
      expect(r.reachable).toBe(false);
      expect(r.errorKind).toBe("invalid_key");
    });

    it("modelo fora da lista → model_not_found", async () => {
      // GET /v1/models OK mas sem o modelo procurado
      fetchMock.mockResolvedValueOnce(
        mockJson({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }, 200),
      );
      const r = await deepTestOpenAI("k", "gpt-9000");
      expect(r.reachable).toBe(false);
      expect(r.errorKind).toBe("model_not_found");
    });

    it("429 com insufficient_quota → no_credit", async () => {
      // GET /v1/models OK
      fetchMock.mockResolvedValueOnce(mockJson({ data: [{ id: "gpt-4o" }] }, 200));
      // POST /chat/completions 429
      fetchMock.mockResolvedValueOnce(
        mockText(
          JSON.stringify({ error: { code: "insufficient_quota" } }),
          429,
        ),
      );
      const r = await deepTestOpenAI("k", "gpt-4o");
      expect(r.errorKind).toBe("no_credit");
      expect(r.creditOk).toBe(false);
    });

    it("200 → reachable=true", async () => {
      fetchMock.mockResolvedValueOnce(mockJson({ data: [{ id: "gpt-4o" }] }, 200));
      fetchMock.mockResolvedValueOnce(
        mockJson(
          {
            choices: [{ message: { content: "ok" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          },
          200,
        ),
      );
      const r = await deepTestOpenAI("k", "gpt-4o");
      expect(r.reachable).toBe(true);
      expect(r.tokensInput).toBe(1);
    });

    it("network failure → errorKind network", async () => {
      fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      const r = await deepTestOpenAI("k", "gpt-4o");
      expect(r.reachable).toBe(false);
      expect(r.errorKind).toBe("network");
    });
  });

  describe("deepTestAnthropic", () => {
    it("401 → invalid_key", async () => {
      fetchMock.mockResolvedValueOnce(mockJson({}, 401));
      const r = await deepTestAnthropic("badkey", "claude-3-5-sonnet-20241022");
      expect(r.errorKind).toBe("invalid_key");
    });

    it("erro 'Invalid model' → model_not_found", async () => {
      fetchMock.mockResolvedValueOnce(
        mockJson(
          {
            error: { type: "not_found_error", message: "Invalid model: foo" },
          },
          400,
        ),
      );
      const r = await deepTestAnthropic("k", "foo-bar");
      expect(r.errorKind).toBe("model_not_found");
    });

    it("404 direto → model_not_found", async () => {
      fetchMock.mockResolvedValueOnce(mockJson({}, 404));
      const r = await deepTestAnthropic("k", "foo-bar");
      expect(r.errorKind).toBe("model_not_found");
    });

    it("429 + credit_balance_too_low → no_credit", async () => {
      fetchMock.mockResolvedValueOnce(
        mockJson(
          { error: { message: "Your credit_balance_too_low" } },
          429,
        ),
      );
      const r = await deepTestAnthropic("k", "claude-3-5-sonnet-20241022");
      expect(r.errorKind).toBe("no_credit");
      expect(r.creditOk).toBe(false);
    });

    it("200 → reachable=true", async () => {
      fetchMock.mockResolvedValueOnce(
        mockJson(
          {
            content: [{ type: "text", text: "ok" }],
            usage: { input_tokens: 1, output_tokens: 1 },
          },
          200,
        ),
      );
      const r = await deepTestAnthropic("k", "claude-3-5-sonnet-20241022");
      expect(r.reachable).toBe(true);
    });
  });

  describe("deepTestGemini", () => {
    it("403 com API_KEY_INVALID → invalid_key", async () => {
      fetchMock.mockResolvedValueOnce(
        mockText(
          JSON.stringify({ error: { status: "API_KEY_INVALID" } }),
          403,
        ),
      );
      const r = await deepTestGemini("badkey", "gemini-2.0-flash");
      expect(r.errorKind).toBe("invalid_key");
    });

    it("400 com 'not found' → model_not_found", async () => {
      fetchMock.mockResolvedValueOnce(
        mockText("Model not found: foo", 400),
      );
      const r = await deepTestGemini("k", "foo");
      expect(r.errorKind).toBe("model_not_found");
    });

    it("429 → rate_limit", async () => {
      fetchMock.mockResolvedValueOnce(mockJson({}, 429));
      const r = await deepTestGemini("k", "gemini-2.0-flash");
      expect(r.errorKind).toBe("rate_limit");
    });

    it("200 → reachable=true", async () => {
      fetchMock.mockResolvedValueOnce(
        mockJson(
          {
            candidates: [{ content: { parts: [{ text: "ok" }] } }],
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
          },
          200,
        ),
      );
      const r = await deepTestGemini("k", "gemini-2.0-flash");
      expect(r.reachable).toBe(true);
    });
  });

  describe("deepTestOpenRouter", () => {
    it("401 no /credits → invalid_key", async () => {
      fetchMock.mockResolvedValueOnce(mockJson({}, 401));
      const r = await deepTestOpenRouter("badkey", "openai/gpt-4o");
      expect(r.errorKind).toBe("invalid_key");
    });

    it("saldo zero + chat 200 → reachable mas creditOk=false", async () => {
      fetchMock.mockResolvedValueOnce(
        mockJson({ data: { total_credits: 5, total_usage: 5 } }, 200),
      );
      fetchMock.mockResolvedValueOnce(
        mockJson(
          {
            choices: [{ message: { content: "ok" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          },
          200,
        ),
      );
      const r = await deepTestOpenRouter("k", "openai/gpt-4o");
      expect(r.reachable).toBe(true);
      expect(r.creditOk).toBe(false);
      expect(r.creditRemainingUsd).toBe(0);
    });

    it("404 model_not_found → model_not_found", async () => {
      fetchMock.mockResolvedValueOnce(
        mockJson({ data: { total_credits: 10, total_usage: 0 } }, 200),
      );
      fetchMock.mockResolvedValueOnce(mockJson({}, 404));
      const r = await deepTestOpenRouter("k", "foo/bar");
      expect(r.errorKind).toBe("model_not_found");
    });

    it("saldo > 0 + chat 200 → reachable + creditOk=true", async () => {
      fetchMock.mockResolvedValueOnce(
        mockJson({ data: { total_credits: 10, total_usage: 1 } }, 200),
      );
      fetchMock.mockResolvedValueOnce(
        mockJson(
          {
            choices: [{ message: { content: "ok" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          },
          200,
        ),
      );
      const r = await deepTestOpenRouter("k", "openai/gpt-4o");
      expect(r.reachable).toBe(true);
      expect(r.creditOk).toBe(true);
      expect(r.creditRemainingUsd).toBe(9);
    });
  });

  describe("deepTest dispatcher", () => {
    it.each(["openai", "anthropic", "gemini", "openrouter"] as const)(
      "%s dispara para handler correto",
      async (p) => {
        fetchMock.mockResolvedValue(mockJson({}, 401));
        const r = await deepTest(p, "k", "m");
        expect(r.errorKind).toBe("invalid_key");
      },
    );
  });

  describe("describeErrorKind", () => {
    it("retorna PT-BR para cada kind", () => {
      expect(describeErrorKind("invalid_key")).toContain("inválida");
      expect(describeErrorKind("no_credit")).toContain("crédito");
      expect(describeErrorKind("rate_limit")).toContain("Limite");
      expect(describeErrorKind("model_not_found", undefined, "x")).toContain('"x"');
      expect(describeErrorKind("network")).toContain("rede");
      expect(describeErrorKind("other", "boom")).toContain("boom");
      expect(describeErrorKind(undefined)).toBeUndefined();
    });
  });
});
