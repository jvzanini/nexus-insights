const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.mock("@/lib/pg-pool", () => ({
  pgPool: { connect: () => Promise.resolve(mockClient) },
}));
jest.mock("@/lib/chatwoot/pool", () => ({
  chatwootQuery: jest.fn(),
}));

import {
  refreshAccountsDim,
  refreshAllDimSnapshots,
} from "../dim-sync";
import { chatwootQuery } from "@/lib/chatwoot/pool";

const mockChatwoot = chatwootQuery as jest.MockedFunction<
  typeof chatwootQuery
>;

describe("dim-sync", () => {
  beforeEach(() => {
    mockClient.query.mockReset();
    mockClient.release.mockClear();
    mockChatwoot.mockReset();
  });

  describe("refreshAccountsDim", () => {
    it("upsert quando há rows", async () => {
      mockChatwoot.mockResolvedValueOnce([
        { id: 1, name: "Account A", status: "active" },
        { id: 2, name: "Account B", status: null },
      ] as never);
      mockClient.query.mockResolvedValue({ rowCount: 0 });

      const result = await refreshAccountsDim();
      expect(result.dim).toBe("dim_accounts");
      expect(result.upserted).toBe(2);
      expect(result.errors).toEqual([]);

      const calls = mockClient.query.mock.calls.map((c) => c[0] as string);
      expect(calls.some((s) => /INSERT INTO powerbi/i.test(s))).toBe(true);
      expect(calls.some((s) => /ON CONFLICT/i.test(s))).toBe(true);
      expect(calls.some((s) => /COMMIT/i.test(s))).toBe(true);
    });

    it("retorna sem erro quando 0 rows (skip insert)", async () => {
      mockChatwoot.mockResolvedValueOnce([] as never);

      const result = await refreshAccountsDim();
      expect(result.upserted).toBe(0);
      expect(result.errors).toEqual([]);
      // Sem queries no pgPool
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it("captura erro do chatwootQuery", async () => {
      mockChatwoot.mockRejectedValueOnce(new Error("connection refused"));

      const result = await refreshAccountsDim();
      expect(result.errors).toContain("connection refused");
      expect(result.upserted).toBe(0);
    });

    it("rollback em falha de COMMIT", async () => {
      mockChatwoot.mockResolvedValueOnce([
        { id: 1, name: "A", status: null },
      ] as never);
      mockClient.query.mockImplementation(async (sql: string) => {
        if (/COMMIT/i.test(sql)) throw new Error("disk full");
        return { rowCount: 0 };
      });

      const result = await refreshAccountsDim();
      expect(result.errors.length).toBeGreaterThan(0);

      const calls = mockClient.query.mock.calls.map((c) => c[0] as string);
      expect(calls.some((s) => /ROLLBACK/i.test(s))).toBe(true);
    });
  });

  describe("refreshAllDimSnapshots", () => {
    it("retorna 4 results (1 por dim)", async () => {
      mockChatwoot.mockResolvedValue([] as never);
      const results = await refreshAllDimSnapshots();
      expect(results).toHaveLength(4);
      expect(results.map((r) => r.dim)).toEqual([
        "dim_accounts",
        "dim_inboxes",
        "dim_agents",
        "dim_teams",
      ]);
    });

    it("falha em uma não para outras", async () => {
      mockChatwoot
        .mockRejectedValueOnce(new Error("accounts down")) // accounts falha
        .mockResolvedValueOnce([] as never) // inboxes ok
        .mockResolvedValueOnce([] as never) // agents ok
        .mockResolvedValueOnce([] as never); // teams ok

      const results = await refreshAllDimSnapshots();
      expect(results[0].errors.length).toBeGreaterThan(0);
      expect(results[1].errors).toEqual([]);
      expect(results[2].errors).toEqual([]);
      expect(results[3].errors).toEqual([]);
    });
  });
});
