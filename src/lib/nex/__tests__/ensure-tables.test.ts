jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

import { pgPool } from "@/lib/pg-pool";
import {
  ensureNexTables,
  __resetEnsureNexTablesCache,
} from "../ensure-tables";

const q = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => {
  __resetEnsureNexTablesCache();
  q.mockReset();
  q.mockResolvedValue({ rows: [], rowCount: 0 } as never);
});

describe("ensureNexTables", () => {
  it("cria nex_settings com check singleton + nex_kb_documents + seed", async () => {
    await ensureNexTables();
    const sqls = q.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('CREATE TABLE IF NOT EXISTS "nex_settings"'))).toBe(true);
    expect(sqls.some((s) => s.includes(`CHECK (id = 'global')`))).toBe(true);
    expect(sqls.some((s) => s.includes('CREATE TABLE IF NOT EXISTS "nex_kb_documents"'))).toBe(true);
    expect(sqls.some((s) => s.includes('CREATE INDEX IF NOT EXISTS "nex_kb_documents_created_at_idx"'))).toBe(true);
    expect(
      sqls.some((s) =>
        s.includes("INSERT INTO nex_settings (id) VALUES ('global')") &&
        s.includes("ON CONFLICT (id) DO NOTHING"),
      ),
    ).toBe(true);
  });

  it("é idempotente", async () => {
    await ensureNexTables();
    const first = q.mock.calls.length;
    await ensureNexTables();
    expect(q.mock.calls.length).toBe(first);
  });
});
