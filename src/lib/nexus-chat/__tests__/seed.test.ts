jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    nexusChatConnection: {
      create: jest.fn(),
    },
    userAccountAccess: {
      findMany: jest.fn(),
    },
    companyChatBinding: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/encryption", () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
}));

jest.mock("../ensure-tables", () => ({
  ensureNexusChatTables: jest.fn().mockResolvedValue(undefined),
}));

import { pgPool } from "@/lib/pg-pool";
import { prisma } from "@/lib/prisma";
import { runConnectionsSeedIfNeeded } from "../seed";

const queryMock = pgPool.query as jest.MockedFunction<typeof pgPool.query>;
const findFlagMock = (
  prisma as unknown as { appSetting: { findUnique: jest.Mock } }
).appSetting.findUnique;
const createFlagMock = (
  prisma as unknown as { appSetting: { create: jest.Mock } }
).appSetting.create;
const createConnMock = (
  prisma as unknown as { nexusChatConnection: { create: jest.Mock } }
).nexusChatConnection.create;
const findAccountsMock = (
  prisma as unknown as { userAccountAccess: { findMany: jest.Mock } }
).userAccountAccess.findMany;
const createBindingMock = (
  prisma as unknown as { companyChatBinding: { create: jest.Mock } }
).companyChatBinding.create;

beforeEach(() => {
  queryMock.mockReset();
  findFlagMock.mockReset();
  createFlagMock.mockReset();
  createConnMock.mockReset();
  findAccountsMock.mockReset();
  createBindingMock.mockReset();
  process.env.CHATWOOT_DATABASE_URL =
    "postgresql://user:secret@chatwoot.host:5432/chatwoot_prod";
});

describe("runConnectionsSeedIfNeeded", () => {
  it("retorna { seeded: false } se outro processo segura advisory lock", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ locked: false }],
      rowCount: 1,
    } as never);

    const result = await runConnectionsSeedIfNeeded();

    expect(result).toEqual({ seeded: false });
    expect(findFlagMock).not.toHaveBeenCalled();
  });

  it("retorna { seeded: false } se flag connections_seeded_at já existe (idempotência)", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ locked: true }] } as never) // pg_try_advisory_lock
      .mockResolvedValueOnce({ rows: [] } as never); // pg_advisory_unlock
    findFlagMock.mockResolvedValue({
      key: "connections_seeded_at",
      value: { at: "2026-05-01" },
    });

    const result = await runConnectionsSeedIfNeeded();

    expect(result).toEqual({ seeded: false });
    expect(createConnMock).not.toHaveBeenCalled();
  });

  it("cria connection + bindings + backfill quando flag não existe", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ locked: true }] } as never) // lock
      // 6 backfill UPDATEs:
      .mockResolvedValue({ rows: [], rowCount: 5 } as never);
    findFlagMock.mockResolvedValue(null);
    createConnMock.mockResolvedValue({ id: "conn-uuid", name: "Padrão (legado)" });
    findAccountsMock.mockResolvedValue([
      { chatwootAccountId: 9, chatwootAccountName: "Matrix" },
      { chatwootAccountId: 2, chatwootAccountName: "Invest" },
    ]);
    createBindingMock.mockResolvedValue({});
    createFlagMock.mockResolvedValue({});

    const result = await runConnectionsSeedIfNeeded();

    expect(result.seeded).toBe(true);
    expect(result.connectionId).toBe("conn-uuid");
    expect(result.bindingsCreated).toBe(2);

    expect(createConnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Padrão (legado)",
          host: "chatwoot.host",
          port: 5432,
          database: "chatwoot_prod",
          username: "user",
          passwordEnc: "enc:secret",
          status: "active",
        }),
      }),
    );

    expect(createBindingMock).toHaveBeenCalledTimes(2);
    expect(createBindingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          connectionId: "conn-uuid",
          chatwootAccountId: 9,
          displayName: "Matrix",
          enabled: true,
        }),
      }),
    );

    // backfill nas 6 tabelas chatwoot_facts_*
    const updateSqls = queryMock.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes("UPDATE") && s.includes("chatwoot_facts"));
    expect(updateSqls.length).toBe(6);

    expect(createFlagMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ key: "connections_seeded_at" }),
      }),
    );
  });

  it("falha se CHATWOOT_DATABASE_URL não está definida", async () => {
    delete process.env.CHATWOOT_DATABASE_URL;
    queryMock.mockResolvedValueOnce({ rows: [{ locked: true }] } as never);
    queryMock.mockResolvedValue({ rows: [] } as never);
    findFlagMock.mockResolvedValue(null);

    await expect(runConnectionsSeedIfNeeded()).rejects.toThrow(
      "CHATWOOT_DATABASE_URL",
    );
  });

  it("libera advisory lock mesmo em caso de erro (finally)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ locked: true }] } as never);
    queryMock.mockResolvedValue({ rows: [] } as never);
    findFlagMock.mockRejectedValueOnce(new Error("db down"));

    await expect(runConnectionsSeedIfNeeded()).rejects.toThrow("db down");

    const unlockCalls = queryMock.mock.calls.filter((c) =>
      String(c[0]).includes("pg_advisory_unlock"),
    );
    expect(unlockCalls.length).toBe(1);
  });
});
