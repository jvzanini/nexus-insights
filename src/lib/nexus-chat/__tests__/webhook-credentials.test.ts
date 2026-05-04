import { generateWebhookToken } from "../webhook-credentials";

describe("generateWebhookToken", () => {
  it("retorna token de 64 chars hex (32 bytes random)", () => {
    expect(generateWebhookToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("entropia: chamadas seguidas geram tokens distintos", () => {
    const a = generateWebhookToken();
    const b = generateWebhookToken();
    expect(a).not.toBe(b);
  });
});
