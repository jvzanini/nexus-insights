/**
 * Mock compartilhável de `MediaRecorder` + `navigator.mediaDevices.getUserMedia`
 * para uso em testes (jsdom não implementa nenhum dos dois).
 *
 * Uso:
 *
 * ```ts
 * import { installMediaRecorderMock } from "@/test-utils/media-recorder-mock";
 * installMediaRecorderMock();
 * // ... testes que usam <AudioRecorder /> ...
 * ```
 *
 * O mock é minimalista — só reflete o subset da API que `AudioRecorder` consome:
 *   - `start(timeslice?)` move state → "recording"
 *   - `pause()` move state → "paused"
 *   - `resume()` move state → "recording"
 *   - `stop()` move state → "inactive" e dispara `onstop`
 *   - `static isTypeSupported()` sempre `true` (testa fallback de mime sem complicar)
 *
 * Não dispara `ondataavailable` automaticamente — quem precisar testar geração
 * de Blob real pode chamar `onstop?.()` manualmente após simular dados.
 */

export class MockMediaRecorder {
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType = "audio/webm";

  static isTypeSupported(): boolean {
    return true;
  }

  constructor(
    public stream: MediaStream,
    public options?: { mimeType: string },
  ) {
    if (options?.mimeType) this.mimeType = options.mimeType;
  }

  start(_timeslice?: number): void {
    this.state = "recording";
  }

  pause(): void {
    this.state = "paused";
  }

  resume(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.onstop?.();
  }
}

/**
 * Instala o mock como global. Chamar uma vez no topo do test file (antes do
 * import do componente, ou em `beforeAll`).
 */
export function installMediaRecorderMock(): void {
  // @ts-expect-error mock global no ambiente jsdom
  global.MediaRecorder = MockMediaRecorder;

  Object.defineProperty(global.navigator, "mediaDevices", {
    value: {
      getUserMedia: jest.fn(async () => ({
        getTracks: () =>
          [{ stop: jest.fn() }] as unknown as MediaStreamTrack[],
      })),
    },
    configurable: true,
  });
}
