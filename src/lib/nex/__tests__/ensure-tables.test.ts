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

describe("ensure-tables — guardrails seed v2 + backfill (v0.26)", () => {
  it("seed novo NÃO inclui 'Sempre cite a fonte do número'", async () => {
    await ensureNexTables();
    const seedCall = q.mock.calls.find((c) =>
      String(c[0]).includes("Nunca exponha dados"),
    );
    expect(seedCall).toBeDefined();
    expect(String(seedCall![0])).not.toMatch(/Sempre cite a fonte do número/);
  });

  it("backfill usa match EXATO 'cite a fonte do número' (preserva customizações que mencionem 'cite a fonte' em outro contexto)", async () => {
    await ensureNexTables();
    const backfillCall = q.mock.calls.find((c) =>
      String(c[0]).match(/seeded_v2_at\s*=\s*now\(\)/i),
    );
    expect(backfillCall).toBeDefined();
    const backfillSql = String(backfillCall![0]);
    expect(backfillSql).toMatch(/cite a fonte do número/i);
    expect(backfillSql).not.toMatch(/ILIKE\s+'%cite a fonte%'/i);
  });

  it("seed da column seeded_v2_at é IF NOT EXISTS (idempotente)", async () => {
    await ensureNexTables();
    const alterCall = q.mock.calls.find((c) =>
      String(c[0]).match(/ADD COLUMN IF NOT EXISTS\s+"?seeded_v2_at/i),
    );
    expect(alterCall).toBeDefined();
  });

  it("backfill condicional: WHERE seeded_v2_at IS NULL (idempotente — só roda 1 vez por install)", async () => {
    await ensureNexTables();
    const backfillCall = q.mock.calls.find((c) =>
      String(c[0]).match(/seeded_v2_at\s*=\s*now\(\)/i),
    );
    expect(String(backfillCall![0])).toMatch(/seeded_v2_at IS NULL/);
  });
});

describe("ensure-tables — identity_base column (v0.28)", () => {
  it("adiciona column identity_base TEXT NULL via IF NOT EXISTS (idempotente)", async () => {
    await ensureNexTables();
    const alterCall = q.mock.calls.find((c) =>
      String(c[0]).match(/ADD COLUMN IF NOT EXISTS\s+"?identity_base/i),
    );
    expect(alterCall).toBeDefined();
    expect(String(alterCall![0])).toMatch(/TEXT/i);
  });
});

describe("ensure-tables — terminology + suggestions_enabled + seeded_v3_at (v0.31)", () => {
  it("ALTER TABLE adiciona terminology JSONB DEFAULT '{}'", async () => {
    await ensureNexTables();
    const alterCall = q.mock.calls.find((c) =>
      String(c[0]).match(/ADD COLUMN IF NOT EXISTS\s+"?terminology/i),
    );
    expect(alterCall).toBeDefined();
    expect(String(alterCall![0])).toMatch(/JSONB/i);
    expect(String(alterCall![0])).toMatch(/DEFAULT\s+'\{\}'::jsonb/i);
  });

  it("ALTER TABLE adiciona suggestions_enabled BOOLEAN DEFAULT false", async () => {
    await ensureNexTables();
    const alterCall = q.mock.calls.find((c) =>
      String(c[0]).match(/ADD COLUMN IF NOT EXISTS\s+"?suggestions_enabled/i),
    );
    expect(alterCall).toBeDefined();
    expect(String(alterCall![0])).toMatch(/BOOLEAN/i);
    expect(String(alterCall![0])).toMatch(/DEFAULT\s+false/i);
  });

  it("ALTER TABLE adiciona seeded_v3_at TIMESTAMPTZ NULL (flag de pre-seed idempotente)", async () => {
    await ensureNexTables();
    const alterCall = q.mock.calls.find((c) =>
      String(c[0]).match(/ADD COLUMN IF NOT EXISTS\s+"?seeded_v3_at/i),
    );
    expect(alterCall).toBeDefined();
    expect(String(alterCall![0])).toMatch(/TIMESTAMPTZ/i);
  });

  it("UPDATE pre-seed terminology Matrix gated por seeded_v3_at IS NULL (idempotente)", async () => {
    await ensureNexTables();
    const seedCall = q.mock.calls.find((c) =>
      String(c[0]).replace(/\n/g, " ").match(/UPDATE\s+"nex_settings".*SET\s+"terminology"/i),
    );
    expect(seedCall).toBeDefined();
    const sql = String(seedCall![0]);
    expect(sql).toMatch(/"estados":\s*"inboxes"/);
    expect(sql).toMatch(/"colaboradores":\s*"agentes"/);
    expect(sql).toMatch(/"departamento":\s*"teams"/);
    expect(sql).toMatch(/AND\s+"?seeded_v3_at"?\s+IS\s+NULL/i);
    expect(sql).toMatch(/"seeded_v3_at"\s*=\s*now\(\)/i);
  });
});
