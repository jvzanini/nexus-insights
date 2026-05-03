jest.mock("@/lib/llm/get-active-config", () => ({
  getActiveLlmConfig: jest.fn(),
}));

import { getActiveLlmConfig } from "@/lib/llm/get-active-config";
import { transcribeAudio, MAX_AUDIO_BYTES } from "../transcribe";

const getActive = getActiveLlmConfig as jest.MockedFunction<
  typeof getActiveLlmConfig
>;

const originalFetch = global.fetch;

beforeEach(() => {
  getActive.mockReset();
  global.fetch = jest.fn() as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

function makeBlob(size: number, type = "audio/webm"): Blob {
  // Cria um Blob com size bytes preenchidos.
  const bytes = new Uint8Array(size);
  return new Blob([bytes], { type });
}

function mockOpenAIConfig() {
  getActive.mockResolvedValueOnce({
    id: "cfg",
    provider: "openai",
    model: "gpt-4o",
    apiKey: "sk-openai",
    credentialId: null,
    credentialLabel: null,
  });
}

describe("transcribeAudio", () => {
  it("rejeita quando provider ativo não é openai", async () => {
    getActive.mockResolvedValueOnce({
      id: "cfg",
      provider: "anthropic",
      model: "claude-3-5-sonnet",
      apiKey: "sk-ant",
      credentialId: null,
      credentialLabel: null,
    });
    const blob = makeBlob(1024);
    await expect(transcribeAudio(blob)).rejects.toThrow(/OpenAI/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejeita quando getActiveLlmConfig retorna null", async () => {
    getActive.mockResolvedValueOnce(null);
    const blob = makeBlob(1024);
    await expect(transcribeAudio(blob)).rejects.toThrow(/OpenAI/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejeita áudio acima de MAX_AUDIO_BYTES sem chamar API", async () => {
    mockOpenAIConfig();
    const blob = makeBlob(MAX_AUDIO_BYTES + 1);
    await expect(transcribeAudio(blob)).rejects.toThrow(/25/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("usa gpt-4o-mini-transcribe e retorna tokens reais (audio + text)", async () => {
    mockOpenAIConfig();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        text: "olá mundo",
        usage: {
          type: "tokens",
          input_tokens: 1500,
          input_token_details: {
            text_tokens: 14,
            audio_tokens: 1486,
          },
          output_tokens: 6,
          total_tokens: 1506,
        },
      }),
    });
    const blob = makeBlob(1024);
    const result = await transcribeAudio(blob);

    expect(result.text).toBe("olá mundo");
    expect(result.modelUsed).toBe("gpt-4o-mini-transcribe");
    expect(result.inputTokens).toBe(1500); // 1486 + 14
    expect(result.outputTokens).toBe(6);
    expect(typeof result.durationSeconds).toBe("number");
    expect(result.durationSeconds).toBeGreaterThanOrEqual(0);

    // 1ª chamada deve ter sido pra gpt-4o-mini-transcribe com response_format=json
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    expect(callArgs[0]).toBe(
      "https://api.openai.com/v1/audio/transcriptions",
    );
    const body = callArgs[1].body as FormData;
    expect(body.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(body.get("response_format")).toBe("json");
    expect(callArgs[1].headers).toMatchObject({
      Authorization: "Bearer sk-openai",
    });
  });

  it("fallback whisper-1 quando gpt-4o-mini-transcribe retorna 4xx", async () => {
    mockOpenAIConfig();
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    // 1ª chamada (gpt-4o-mini-transcribe) → 400
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "model unsupported",
    });
    // 2ª chamada (whisper-1) → sucesso
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ text: "olá", duration: 3.5 }),
    });

    const blob = makeBlob(1024);
    const result = await transcribeAudio(blob);

    expect(result).toEqual({
      text: "olá",
      durationSeconds: 3.5,
      inputTokens: 0,
      outputTokens: 0,
      modelUsed: "whisper-1",
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const secondCall = (global.fetch as jest.Mock).mock.calls[1];
    const body = secondCall[1].body as FormData;
    expect(body.get("model")).toBe("whisper-1");
    expect(body.get("response_format")).toBe("verbose_json");

    warnSpy.mockRestore();
  });

  it("fallback whisper-1 quando gpt-4o-mini-transcribe lança exception", async () => {
    mockOpenAIConfig();
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ text: "olá", duration: 2 }),
      });

    const blob = makeBlob(1024);
    const result = await transcribeAudio(blob);

    expect(result.modelUsed).toBe("whisper-1");
    expect(result.text).toBe("olá");
    expect(result.durationSeconds).toBe(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it("propaga erro do whisper-1 quando ambos falham", async () => {
    mockOpenAIConfig();
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    // gpt-4o-mini-transcribe falha
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "boom mini",
    });
    // whisper-1 também falha
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
      text: async () => "internal whisper boom",
    });

    const blob = makeBlob(1024);
    await expect(transcribeAudio(blob)).rejects.toThrow(
      /Whisper 500.*internal whisper boom/,
    );

    warnSpy.mockRestore();
  });

  it("usa language passada na FormData (gpt-4o-mini-transcribe)", async () => {
    mockOpenAIConfig();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        text: "hello",
        usage: {
          input_tokens: 10,
          input_token_details: { audio_tokens: 8, text_tokens: 2 },
          output_tokens: 1,
        },
      }),
    });
    const blob = makeBlob(1024);
    await transcribeAudio(blob, "en");
    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = callArgs[1].body as FormData;
    expect(body.get("language")).toBe("en");
    expect(body.get("model")).toBe("gpt-4o-mini-transcribe");
  });

  it("derruba para input_tokens quando input_token_details ausente", async () => {
    mockOpenAIConfig();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        text: "x",
        usage: { input_tokens: 42, output_tokens: 3 },
      }),
    });
    const blob = makeBlob(1024);
    const result = await transcribeAudio(blob);
    expect(result.inputTokens).toBe(42);
    expect(result.outputTokens).toBe(3);
  });

  it("v0.26: console.warn inclui body do erro 4xx do gpt-4o-mini-transcribe (debug em prod)", async () => {
    mockOpenAIConfig();
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () =>
          JSON.stringify({ error: { message: "model_not_available" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ text: "fallback", duration: 1 }),
      });

    const blob = makeBlob(1024);
    await transcribeAudio(blob);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /gpt-4o-mini-transcribe.*400.*model_not_available.*fallback whisper-1/,
      ),
    );
    warnSpy.mockRestore();
  });
});
