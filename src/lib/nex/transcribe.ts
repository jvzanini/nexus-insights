import "server-only";

import { getActiveLlmConfig } from "@/lib/llm/get-active-config";

/** Cap defensivo igual Whisper API (25 MB). */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

export interface TranscribeResult {
  text: string;
  durationSeconds: number;
}

interface WhisperVerboseJsonResponse {
  text?: string;
  duration?: number;
}

/**
 * Transcreve um áudio usando Whisper (OpenAI) e retorna texto + duração.
 *
 * Requer que a config LLM ativa seja do provider `openai` (Whisper hoje só
 * existe na OpenAI). Erros são propagados como `Error` com mensagem clara em
 * português pra UI mostrar via toast.
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

  const form = new FormData();
  form.append("file", audio, "audio.webm");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("language", language);

  const response = await fetch(WHISPER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
      errorBody = "";
    }
    throw new Error(
      `Whisper ${response.status}: ${errorBody || response.statusText}`,
    );
  }

  const data = (await response.json()) as WhisperVerboseJsonResponse;
  return {
    text: data.text ?? "",
    durationSeconds: typeof data.duration === "number" ? data.duration : 0,
  };
}
