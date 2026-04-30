jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock("@/lib/encryption", () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, "")),
}));

jest.mock("../ensure-tables", () => ({
  ensureLlmTables: jest.fn(async () => {}),
}));

import { pgPool } from "@/lib/pg-pool";
import {
  listCredentials,
  createCredential,
  updateCredential,
  deleteCredential,
  CREDENTIAL_IN_USE,
} from "../credentials";

const q = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => {
  q.mockReset();
});

describe("listCredentials", () => {
  it("retorna summaries por provider", async () => {
    q.mockResolvedValueOnce({
      rows: [
        {
          id: "id-1",
          provider: "openai",
          label: "Chave 1",
          last4: "ABCD",
          created_at: new Date("2026-04-01"),
          updated_at: new Date("2026-04-15"),
        },
      ],
      rowCount: 1,
    } as never);
    const out = await listCredentials("openai");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ provider: "openai", label: "Chave 1", last4: "ABCD" });
    expect((out[0] as { encryptedApiKey?: string }).encryptedApiKey).toBeUndefined();
  });
});

describe("createCredential", () => {
  it("autogera label 'Chave 1' quando label vazio", async () => {
    q.mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 } as never);
    q.mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 } as never);
    q.mockResolvedValueOnce({
      rows: [{ id: "new-id", label: "Chave 1", last4: "9999" }],
      rowCount: 1,
    } as never);
    const r = await createCredential({
      provider: "openai",
      apiKey: "sk-AAAAAAAAA9999",
    });
    expect(r).toEqual({ id: "new-id", label: "Chave 1", last4: "9999" });
  });

  it("autogera label sequencial quando 'Chave 1' já existe", async () => {
    q.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 } as never);
    q.mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 } as never);
    q.mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 } as never);
    q.mockResolvedValueOnce({
      rows: [{ id: "new-id", label: "Chave 2", last4: "0000" }],
      rowCount: 1,
    } as never);
    const r = await createCredential({
      provider: "anthropic",
      apiKey: "sk-1234567890",
    });
    expect(r.label).toBe("Chave 2");
  });

  it("rejeita label duplicado explícito", async () => {
    q.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 } as never);
    await expect(
      createCredential({
        provider: "openai",
        label: "Conta principal",
        apiKey: "sk-9999999999",
      }),
    ).rejects.toThrow(/já existe/);
  });

  it("rejeita apiKey muito curta", async () => {
    await expect(
      createCredential({ provider: "openai", apiKey: "short" }),
    ).rejects.toThrow(/inválida/);
  });

  it("rejeita label > 60 chars", async () => {
    await expect(
      createCredential({
        provider: "openai",
        label: "X".repeat(61),
        apiKey: "sk-9999999999",
      }),
    ).rejects.toThrow(/60/);
  });
});

describe("updateCredential", () => {
  it("renomear apenas: dispara UPDATE label sem mexer em encrypted_api_key", async () => {
    q.mockResolvedValueOnce({ rows: [{ provider: "openai" }], rowCount: 1 } as never); // SELECT provider
    q.mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 } as never); // unique check
    q.mockResolvedValueOnce({
      rows: [{ provider: "openai", label: "Novo", last4: "ABCD" }],
      rowCount: 1,
    } as never);
    const out = await updateCredential("id-1", { label: "Novo" });
    expect(out.label).toBe("Novo");
    const sqls = q.mock.calls.map((c) => String(c[0]));
    const updates = sqls.filter((s) => s.includes("UPDATE llm_credentials"));
    expect(updates.length).toBe(1);
    expect(updates[0]).not.toContain("encrypted_api_key");
  });

  it("rotacionar key: atualiza encrypted_api_key e last4", async () => {
    q.mockResolvedValueOnce({
      rows: [{ provider: "openai", label: "x", last4: "WXYZ" }],
      rowCount: 1,
    } as never);
    const out = await updateCredential("id-1", { apiKey: "sk-NEWKEY12WXYZ" });
    expect(out.last4).toBe("WXYZ");
  });
});

describe("deleteCredential", () => {
  it("permite delete quando não há config ativa apontando", async () => {
    q.mockResolvedValueOnce({ rows: [{ count: "0" }], rowCount: 1 } as never);
    q.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    await expect(deleteCredential("id-1")).resolves.toBeUndefined();
  });

  it("bloqueia com CREDENTIAL_IN_USE quando há config ativa", async () => {
    q.mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 } as never);
    await expect(deleteCredential("id-1")).rejects.toThrow(CREDENTIAL_IN_USE);
  });
});
