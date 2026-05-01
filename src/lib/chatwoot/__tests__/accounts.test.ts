/**
 * Testes de `src/lib/chatwoot/accounts.ts`.
 *
 * Lê accountIds distintos da tabela `chatwoot_facts_daily_by_account`
 * (banco interno) via pgPool.query — padrão canônico do projeto.
 */

jest.mock("@/lib/pg-pool", () => ({
  pgPool: { query: jest.fn() },
}));

import { pgPool } from "@/lib/pg-pool";
import { listKnownAccountIds } from "../accounts";

const mockedQuery = pgPool.query as jest.MockedFunction<typeof pgPool.query>;

beforeEach(() => {
  mockedQuery.mockReset();
});

describe("listKnownAccountIds", () => {
  it("retorna lista de accountIds distintos ordenada asc", async () => {
    mockedQuery.mockResolvedValueOnce({
      rowCount: 3,
      rows: [
        { account_id: 2 },
        { account_id: 7 },
        { account_id: 9 },
      ],
    } as never);

    const result = await listKnownAccountIds();

    expect(result).toEqual([
      { accountId: 2 },
      { accountId: 7 },
      { accountId: 9 },
    ]);

    // Verifica que SQL usa DISTINCT, lê da tabela correta e ordena asc
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    const sql = String(mockedQuery.mock.calls[0]?.[0] ?? "");
    expect(sql).toMatch(/SELECT\s+DISTINCT/i);
    expect(sql).toContain("chatwoot_facts_daily_by_account");
    expect(sql).toMatch(/ORDER BY\s+account_id\s+ASC/i);
  });

  it("retorna array vazio quando não há rows", async () => {
    mockedQuery.mockResolvedValueOnce({
      rowCount: 0,
      rows: [],
    } as never);

    const result = await listKnownAccountIds();

    expect(result).toEqual([]);
  });
});
