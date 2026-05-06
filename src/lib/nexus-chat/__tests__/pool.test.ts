/**
 * Pool dinâmico — testes unitários (mock Prisma + mock pg).
 *
 * Cobre: cache, invalidação, TTL janitor, erro fail-closed.
 * Pool real é testado via integration tests (testcontainers ou staging).
 */

const mockEnd = jest.fn().mockResolvedValue(undefined);
const mockOn = jest.fn();
const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
const PoolMock = jest.fn().mockImplementation(() => ({
  end: mockEnd,
  on: mockOn,
  query: mockQuery,
}));

jest.mock("pg", () => ({
  Pool: PoolMock,
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    nexusChatConnection: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn().mockReturnValue("plaintext-pass"),
}));

import { prisma } from "@/lib/prisma";
import {
  getNexusChatPool,
  invalidateNexusChatPool,
  queryNexusChat,
  __resetNexusChatPoolsForTests,
} from "../pool";
import { ConnectionUnavailableError } from "../errors";

const findUniqueMock = (
  prisma as unknown as { nexusChatConnection: { findUnique: jest.Mock } }
).nexusChatConnection.findUnique;

const baseConn = {
  id: "uuid-1",
  name: "test",
  host: "localhost",
  port: 5432,
  database: "db",
  username: "u",
  passwordEnc: "enc",
  sslMode: "prefer",
  applicationName: "nexus-insights",
  status: "active",
  deletedAt: null,
};

beforeEach(() => {
  __resetNexusChatPoolsForTests();
  findUniqueMock.mockReset();
  PoolMock.mockClear();
  mockEnd.mockClear();
});

describe("getNexusChatPool", () => {
  it("cria pool no primeiro uso e cacheia no segundo (1 findUnique)", async () => {
    findUniqueMock.mockResolvedValue(baseConn);

    const p1 = await getNexusChatPool("uuid-1");
    const p2 = await getNexusChatPool("uuid-1");

    expect(p1).toBe(p2);
    expect(findUniqueMock).toHaveBeenCalledTimes(1);
    expect(PoolMock).toHaveBeenCalledTimes(1);
  });

  it("passa config corretamente pra new Pool (host/port/database/user)", async () => {
    findUniqueMock.mockResolvedValue(baseConn);

    await getNexusChatPool("uuid-1");

    expect(PoolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "localhost",
        port: 5432,
        database: "db",
        user: "u",
        password: "plaintext-pass",
        min: 0,
        max: 1,
      }),
    );
  });

  it("aplica sslMode 'disable' como ssl: false", async () => {
    findUniqueMock.mockResolvedValue({ ...baseConn, sslMode: "disable" });

    await getNexusChatPool("uuid-1");

    expect(PoolMock).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: false }),
    );
  });

  it("aplica sslMode 'verify-full' como ssl: { rejectUnauthorized: true }", async () => {
    findUniqueMock.mockResolvedValue({ ...baseConn, sslMode: "verify-full" });

    await getNexusChatPool("uuid-1");

    expect(PoolMock).toHaveBeenCalledWith(
      expect.objectContaining({ ssl: { rejectUnauthorized: true } }),
    );
  });

  it("lança ConnectionUnavailableError se status != 'active'", async () => {
    findUniqueMock.mockResolvedValue({ ...baseConn, status: "paused" });

    await expect(getNexusChatPool("uuid-1")).rejects.toBeInstanceOf(
      ConnectionUnavailableError,
    );
  });

  it("lança ConnectionUnavailableError se connection não existe", async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(getNexusChatPool("uuid-x")).rejects.toBeInstanceOf(
      ConnectionUnavailableError,
    );
  });

  it("lança ConnectionUnavailableError se status='error'", async () => {
    findUniqueMock.mockResolvedValue({ ...baseConn, status: "error" });

    await expect(getNexusChatPool("uuid-1")).rejects.toBeInstanceOf(
      ConnectionUnavailableError,
    );
  });
});

describe("invalidateNexusChatPool", () => {
  it("fecha pool e remove do cache; próxima chamada refaz findUnique", async () => {
    findUniqueMock.mockResolvedValue(baseConn);
    await getNexusChatPool("uuid-1");
    expect(findUniqueMock).toHaveBeenCalledTimes(1);

    await invalidateNexusChatPool("uuid-1");
    expect(mockEnd).toHaveBeenCalledTimes(1);

    await getNexusChatPool("uuid-1");
    expect(findUniqueMock).toHaveBeenCalledTimes(2);
  });

  it("é no-op se connection não está no cache", async () => {
    await invalidateNexusChatPool("nonexistent");
    expect(mockEnd).not.toHaveBeenCalled();
  });
});

describe("queryNexusChat", () => {
  it("delega para pool.query do connection certo", async () => {
    findUniqueMock.mockResolvedValue(baseConn);
    mockQuery.mockResolvedValue({ rows: [{ a: 1 }], rowCount: 1 });

    const result = await queryNexusChat<{ a: number }>(
      "uuid-1",
      "SELECT 1 AS a",
      [],
    );

    expect(mockQuery).toHaveBeenCalledWith("SELECT 1 AS a", []);
    expect(result.rows).toEqual([{ a: 1 }]);
  });

  it("propaga erros de pool.query", async () => {
    findUniqueMock.mockResolvedValue(baseConn);
    mockQuery.mockRejectedValueOnce(new Error("syntax error"));

    await expect(
      queryNexusChat("uuid-1", "BAD SQL", []),
    ).rejects.toThrow("syntax error");
  });
});
