jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

import { pgPool } from "@/lib/pg-pool";
import {
  ensureNexusChatTables,
  __resetEnsureNexusChatTablesCache,
} from "../ensure-tables";

const mockedQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => {
  __resetEnsureNexusChatTablesCache();
  mockedQuery.mockReset();
});

describe("ensureNexusChatTables — schema bootstrap multi-tenant", () => {
  it("cria nexus_chat_connections e company_chat_bindings (cenário fresh)", async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await ensureNexusChatTables();

    const sql = mockedQuery.mock.calls.map((c) => String(c[0]));
    expect(
      sql.some((s) =>
        s.includes('CREATE TABLE IF NOT EXISTS "nexus_chat_connections"'),
      ),
    ).toBe(true);
    expect(
      sql.some((s) =>
        s.includes('CREATE TABLE IF NOT EXISTS "company_chat_bindings"'),
      ),
    ).toBe(true);
  });

  it("adiciona connection_id NULLABLE em chatwoot_facts_*", async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await ensureNexusChatTables();
    const sql = mockedQuery.mock.calls.map((c) => String(c[0]));
    const tables = [
      "chatwoot_facts_daily_by_account",
      "chatwoot_facts_daily_by_inbox",
      "chatwoot_facts_daily_by_agent",
      "chatwoot_facts_daily_by_team",
      "chatwoot_facts_hourly_by_account",
      "chatwoot_facts_meta",
    ];
    for (const t of tables) {
      expect(
        sql.some((s) =>
          s.includes(
            `ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "connection_id" UUID`,
          ),
        ),
      ).toBe(true);
    }
  });

  it("cria índices secundários (connection_id, account_id) em facts", async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await ensureNexusChatTables();
    const sql = mockedQuery.mock.calls.map((c) => String(c[0]));
    expect(
      sql.some((s) =>
        s.includes(
          'CREATE INDEX IF NOT EXISTS "chatwoot_facts_daily_by_account_connection_id_account_id_idx"',
        ),
      ),
    ).toBe(true);
  });

  it("cria FK company_chat_bindings → nexus_chat_connections", async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await ensureNexusChatTables();
    const sql = mockedQuery.mock.calls.map((c) => String(c[0]));
    expect(
      sql.some((s) =>
        s.includes(
          "FOREIGN KEY",
        ) && s.includes("nexus_chat_connections"),
      ),
    ).toBe(true);
  });

  it("é idempotente (rodar 2x não duplica chamadas)", async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    await ensureNexusChatTables();
    const firstCount = mockedQuery.mock.calls.length;
    await ensureNexusChatTables();
    expect(mockedQuery.mock.calls.length).toBe(firstCount);
  });
});
