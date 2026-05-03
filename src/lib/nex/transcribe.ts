import "server-only";

import { getActiveLlmConfig } from "@/lib/llm/get-active-config";

/** Cap defensivo igual Whisper API (25 MB). */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

interface TranscribeUsage {
  type?: string;
  input_tokens?: number;
  input_token_details?: { text_tokens?: number; audio_tokens?: number };
  output_tokens?: number;
  total_tokens?: number;
}

interface GptTranscribeJsonResponse {
  text?: string;
  usage?: TranscribeUsage;
}

interface WhisperVerboseJsonResponse {
  text?: string;
  duration?: number;
}

export interface TranscribeResult {
  text: string;
  durationSeconds: number;
  inputTokens: number;
  outputTokens: number;
  modelUsed: "gpt-4o-mini-transcribe" | "whisper-1";
}

/**
 * Transcreve um áudio usando primeiro `gpt-4o-mini-transcribe` (token-based, ~50%
 * mais barato e retorna `usage` com tokens reais) e cai pra `whisper-1` (cobrança
 * por minuto, sem tokens) em qualquer 4xx/5xx ou exception.
 *
 * Requer config LLM ativa do provider `openai`. Erros do whisper-1 são propagados
 * como `Error` com mensagem clara em português pra UI mostrar via toast.
 */
export async function transcribeAudio(
  audio: Blob,
  language: string = "pt",
): Promise<TranscribeResult> {
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new Error(
      `Áudio acima do limite de 25 MB (recebido ${(
        audio.size /
        (1024 * 1024)
      ).toFixed(1)} MB).`,
    );
  }

  const config = await getActiveLlmConfig();
  if (!config || config.provider !== "openai") {
    throw new Error(
      "Whisper requer uma credencial OpenAI ativa. Selecione um modelo OpenAI em Agente Nex → Modelo.",
    );
  }

  const start = Date.now();

  // Tentativa 1: gpt-4o-mini-transcribe (token-based, retorna usage)
  try {
    const form = new FormData();
    form.append("file", audio, "audio.webm");
    form.append("model", "gpt-4o-mini-transcribe");
    form.append("response_format", "json");
    form.append("language", language);

    const response = await fetch(WHISPER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: form,
    });

    if (response.ok) {
      const data = (await response.json()) as GptTranscribeJsonResponse;
      const usage = data.usage;
      const audioTokens = usage?.input_token_details?.audio_tokens ?? 0;
      const textTokens = usage?.input_token_details?.text_tokens ?? 0;
      const detailSum = audioTokens + textTokens;
      const inputTokens = detailSum > 0 ? detailSum : usage?.input_tokens ?? 0;
      return {
        text: data.text ?? "",
        durationSeconds: (Date.now() - start) / 1000,
        inputTokens,
        outputTokens: usage?.output_tokens ?? 0,
        modelUsed: "gpt-4o-mini-transcribe",
      };
    }

    // v0.26.0: log inclui body do erro pra debug em produção (motivo do fallback).
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
      /* noop */
    }
    console.warn(
      `[transcribe] gpt-4o-mini-transcribe ${response.status} — ${errorBody.slice(0, 200)} — fallback whisper-1`,
    );
  } catch (err) {
    console.warn(
      "[transcribe] gpt-4o-mini-transcribe falhou — fallback whisper-1:",
      err,
    );
  }

  // Fallback: whisper-1 (cobrança por minuto, sem tokens)
  const formW = new FormData();
  formW.append("file", audio, "audio.webm");
  formW.append("model", "whisper-1");
  formW.append("response_format", "verbose_json");
  formW.append("language", language);

  const responseW = await fetch(WHISPER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: formW,
  });

  if (!responseW.ok) {
    let errorBody = "";
    try {
      errorBody = await responseW.text();
    } catch {
      errorBody = "";
    }
    throw new Error(
      `Whisper ${responseW.status}: ${errorBody || responseW.statusText}`,
    );
  }

  const dataW = (await responseW.json()) as WhisperVerboseJsonResponse;
  return {
    text: dataW.text ?? "",
    durationSeconds:
      typeof dataW.duration === "number"
        ? dataW.duration
        : (Date.now() - start) / 1000,
    inputTokens: 0,
    outputTokens: 0,
    modelUsed: "whisper-1",
  };
}
