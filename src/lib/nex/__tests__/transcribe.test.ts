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

  it("rejeita áudio acima de MAX_AUDIO_BYTES", async () => {
    getActive.mockResolvedValueOnce({
      id: "cfg",
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-openai",
      credentialId: null,
      credentialLabel: null,
    });
    const blob = makeBlob(MAX_AUDIO_BYTES + 1);
    await expect(transcribeAudio(blob)).rejects.toThrow(/25/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("retorna { text, durationSeconds } em sucesso", async () => {
    getActive.mockResolvedValueOnce({
      id: "cfg",
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-openai",
      credentialId: null,
      credentialLabel: null,
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ text: "olá mundo", duration: 4.2 }),
    });
    const blob = makeBlob(1024);
    const result = await transcribeAudio(blob);
    expect(result).toEqual({ text: "olá mundo", durationSeconds: 4.2 });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-openai",
        }),
      }),
    );
  });

  it("propaga erro do Whisper com status e texto", async () => {
    getActive.mockResolvedValueOnce({
      id: "cfg",
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-openai",
      credentialId: null,
      credentialLabel: null,
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
      text: async () => "internal whisper boom",
      json: async () => ({}),
    });
    const blob = makeBlob(1024);
    await expect(transcribeAudio(blob)).rejects.toThrow(
      /Whisper 500.*internal whisper boom/,
    );
  });

  it("usa language passada na FormData", async () => {
    getActive.mockResolvedValueOnce({
      id: "cfg",
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-openai",
      credentialId: null,
      credentialLabel: null,
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ text: "hello", duration: 1 }),
    });
    const blob = makeBlob(1024);
    await transcribeAudio(blob, "en");
    const callArgs = (global.fetch as jest.Mock).mock.calls[0];
    const body = callArgs[1].body as FormData;
    expect(body.get("language")).toBe("en");
    expect(body.get("model")).toBe("whisper-1");
    expect(body.get("response_format")).toBe("verbose_json");
  });
});
