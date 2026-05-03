jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, "")),
}));

import { pgPool } from "@/lib/pg-pool";
import {
  ensureLlmTables,
  __resetEnsureLlmTablesCache,
} from "../ensure-tables";

const mockedQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => {
  __resetEnsureLlmTablesCache();
  mockedQuery.mockReset();
});

describe("ensureLlmTables — schema bootstrap", () => {
  it("cria tabelas, indexes e roda ALTERs no cenário fresh", async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await ensureLlmTables();

    const sql = mockedQuery.mock.calls.map((c) => String(c[0]));
    expect(sql.some((s) => s.includes('CREATE TABLE IF NOT EXISTS "llm_configs"'))).toBe(true);
    expect(sql.some((s) => s.includes('CREATE TABLE IF NOT EXISTS "llm_usage"'))).toBe(true);
    expect(sql.some((s) => s.includes('CREATE TABLE IF NOT EXISTS "llm_credentials"'))).toBe(true);
    expect(sql.some((s) => s.includes('ALTER TABLE "llm_configs" ADD COLUMN IF NOT EXISTS "credential_id"'))).toBe(true);
    expect(sql.some((s) => s.includes('ALTER TABLE "llm_configs" ALTER COLUMN "encrypted_api_key" DROP NOT NULL'))).toBe(true);
    expect(sql.some((s) => s.includes('ALTER TABLE "llm_usage" ADD COLUMN IF NOT EXISTS "cost_brl"'))).toBe(true);
    expect(sql.some((s) => s.includes('ALTER TABLE "llm_usage" ADD COLUMN IF NOT EXISTS "usd_to_brl_rate"'))).toBe(true);
  });

  it("é idempotente (rodar 2x não duplica)", async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await ensureLlmTables();
    const firstCount = mockedQuery.mock.calls.length;
    await ensureLlmTables();
    expect(mockedQuery.mock.calls.length).toBe(firstCount);
  });

  it("migra rows antigas: cria credencial e popula credential_id", async () => {
    mockedQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, provider, encrypted_api_key")) {
        return {
          rows: [
            {
              id: "11111111-1111-1111-1111-111111111111",
              provider: "openai",
              encrypted_api_key: "enc:sk-LIVEKEY1234",
            },
          ],
          rowCount: 1,
        } as never;
      }
      if (sql.includes("SELECT COUNT(*) AS count FROM llm_credentials")) {
        return { rows: [{ count: 0 }], rowCount: 1 } as never;
      }
      if (sql.includes("INSERT INTO llm_credentials")) {
        return { rows: [{ id: "cred-id-1" }], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    await ensureLlmTables();

    const inserts = mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes("INSERT INTO llm_credentials"));
    expect(inserts.length).toBe(1);
    const updates = mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes("UPDATE llm_configs SET credential_id"));
    expect(updates.length).toBe(1);
  });

  it("ignora rows cujo decrypt falha (loga warning, segue)", async () => {
    const enc = require("@/lib/encryption");
    (enc.decrypt as jest.Mock).mockImplementationOnce(() => {
      throw new Error("auth tag failure");
    });

    mockedQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT id, provider, encrypted_api_key")) {
        return {
          rows: [
            {
              id: "22222222-2222-2222-2222-222222222222",
              provider: "openai",
              encrypted_api_key: "enc:CORRUPT",
            },
          ],
          rowCount: 1,
        } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(ensureLlmTables()).resolves.toBeUndefined();
    const inserts = mockedQuery.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes("INSERT INTO llm_credentials"));
    expect(inserts.length).toBe(0);
    warn.mockRestore();
  });

  it("ALTER TABLE adiciona is_playground BOOLEAN DEFAULT false (idempotente)", async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await ensureLlmTables();

    const alterCall = mockedQuery.mock.calls.find((c) =>
      String(c[0]).match(/ADD COLUMN IF NOT EXISTS\s+"?is_playground/i),
    );
    expect(alterCall).toBeDefined();
    expect(String(alterCall![0])).toMatch(/BOOLEAN/i);
    expect(String(alterCall![0])).toMatch(/DEFAULT\s+false/i);
  });
});
