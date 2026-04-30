jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, "")),
}));

jest.mock("../ensure-tables", () => ({
  ensureLlmTables: jest.fn(async () => {}),
}));

import { pgPool } from "@/lib/pg-pool";
import {
  getActiveLlmConfig,
  getPublicActiveLlmConfig,
} from "../get-active-config";

const q = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => q.mockReset());

describe("getActiveLlmConfig", () => {
  it("retorna config via JOIN quando credential_id está populado", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
          id: "cfg-1",
          provider: "openai",
          model: "gpt-4o",
          encrypted_api_key: "enc:sk-LIVE9999",
          credential_id: "cred-1",
          label: "Conta principal",
          last4: "9999",
          legacy_encrypted_api_key: null,
        },
      ],
      rowCount: 1,
    } as never);

    const r = await getActiveLlmConfig();
    expect(r).toEqual({
      id: "cfg-1",
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-LIVE9999",
      credentialId: "cred-1",
      credentialLabel: "Conta principal",
    });
  });

  it("fallback: usa encrypted_api_key direto quando credential_id é NULL", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
          id: "cfg-2",
          provider: "anthropic",
          model: "claude-4",
          encrypted_api_key: null,
          credential_id: null,
          label: null,
          last4: null,
          legacy_encrypted_api_key: "enc:sk-LEGACY1234",
        },
      ],
      rowCount: 1,
    } as never);

    const r = await getActiveLlmConfig();
    expect(r?.apiKey).toBe("sk-LEGACY1234");
    expect(r?.credentialId).toBeNull();
  });

  it("retorna null quando não há config ativa", async () => {
    q.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    expect(await getActiveLlmConfig()).toBeNull();
  });

  it("retorna null quando provider inválido", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
          id: "x",
          provider: "outro",
          model: "m",
          encrypted_api_key: "enc:k",
          credential_id: null,
          label: null,
          last4: null,
          legacy_encrypted_api_key: null,
        },
      ],
      rowCount: 1,
    } as never);
    expect(await getActiveLlmConfig()).toBeNull();
  });

  it("retorna null quando ambas as fontes de chave são NULL", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
          id: "cfg-x",
          provider: "openai",
          model: "gpt-4o",
          encrypted_api_key: null,
          credential_id: null,
          label: null,
          last4: null,
          legacy_encrypted_api_key: null,
        },
      ],
      rowCount: 1,
    } as never);
    expect(await getActiveLlmConfig()).toBeNull();
  });
});

describe("getPublicActiveLlmConfig", () => {
  it("mascara chave usando last4 quando disponível", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
          id: "cfg-3",
          provider: "openai",
          model: "gpt-4o",
          encrypted_api_key: "enc:sk-LIVE9999",
          credential_id: "cred-1",
          label: "Conta principal",
          last4: "9999",
          legacy_encrypted_api_key: null,
        },
      ],
      rowCount: 1,
    } as never);

    const r = await getPublicActiveLlmConfig();
    expect(r).toMatchObject({
      provider: "openai",
      model: "gpt-4o",
      apiKeyMasked: "••••••••9999",
      credentialId: "cred-1",
      credentialLabel: "Conta principal",
    });
  });
});
