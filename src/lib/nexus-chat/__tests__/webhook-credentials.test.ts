jest.mock("@/lib/encryption", () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, "")),
}));

import { generateWebhookCredentials } from "../webhook-credentials";

describe("generateWebhookCredentials", () => {
  it("retorna token de 64 chars hex (32 bytes random)", () => {
    const c = generateWebhookCredentials();
    expect(c.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("retorna secret cifrado (não em plain) e plain separado para mostrar 1x na UI", () => {
    const c = generateWebhookCredentials();
    expect(c.secretEnc).toMatch(/^enc:/);
    expect(c.secretPlain).toMatch(/^[0-9a-f]{64}$/);
    expect(c.secretEnc).not.toBe(c.secretPlain);
  });

  it("token e secret são diferentes em chamadas seguidas (entropia ok)", () => {
    const a = generateWebhookCredentials();
    const b = generateWebhookCredentials();
    expect(a.token).not.toBe(b.token);
    expect(a.secretPlain).not.toBe(b.secretPlain);
  });

  it("token e secret nunca colidem (são gerados independentemente)", () => {
    for (let i = 0; i < 10; i++) {
      const c = generateWebhookCredentials();
      expect(c.token).not.toBe(c.secretPlain);
    }
  });
});
