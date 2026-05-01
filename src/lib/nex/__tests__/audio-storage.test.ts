/**
 * @jest-environment node
 *
 * Testa o early-return defensivo em ambiente sem `indexedDB` (SSR / node).
 * O comportamento real (leitura/escrita) só acontece no browser; aqui
 * garantimos que as funções viram no-op silenciosa em vez de explodir.
 */

import {
  clearAllAudios,
  deleteAudio,
  getAudio,
  saveAudio,
} from "@/lib/nex/audio-storage";

describe("audio-storage (SSR / não-cliente)", () => {
  it("saveAudio é no-op sem indexedDB (não throw)", async () => {
    await expect(
      saveAudio("ua_1", new Blob(["x"], { type: "audio/webm" })),
    ).resolves.toBeUndefined();
  });

  it("getAudio retorna null sem indexedDB", async () => {
    await expect(getAudio("ua_1")).resolves.toBeNull();
  });

  it("deleteAudio é no-op sem indexedDB", async () => {
    await expect(deleteAudio("ua_1")).resolves.toBeUndefined();
  });

  it("clearAllAudios é no-op sem indexedDB", async () => {
    await expect(clearAllAudios()).resolves.toBeUndefined();
  });
});
