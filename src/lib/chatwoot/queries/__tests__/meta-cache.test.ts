/**
 * Testes do meta-cache multi-tenant: confirma que `cacheKey()` inclui
 * `connectionId` e que a versão é `:v2` (era `:v1` em pre-fase-1).
 */

const cacheKeySpy = jest.fn(
  (args: { scope: string; name: string; accountId: number }) =>
    `cache:${args.scope}:${args.name}:a${args.accountId}`,
);

jest.mock("@/lib/nexus-chat/pool", () => ({
  queryNexusChat: jest.fn(),
}));
jest.mock("@/lib/cache/pull-through", () => ({
  withCache: ({ key, fetcher }: any) =>
    fetcher().then((data: any) => ({
      data,
      stale: false,
      cached: false,
      __key: key,
    })),
}));
jest.mock("../../resilience", () => ({
  withChatwootResilience: (fn: any) => fn().then((data: any) => ({ data })),
}));
jest.mock("@/lib/cache/keys", () => ({
  cacheKey: (...args: unknown[]) => cacheKeySpy(args[0] as any),
}));

import {
  getInboxes,
  getTeams,
  getUsers,
  getLabels,
} from "@/lib/chatwoot/queries/meta-cache";
import { queryNexusChat } from "@/lib/nexus-chat/pool";

const CONN_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("meta-cache — cacheKey inclui connectionId (v2)", () => {
  beforeEach(() => {
    cacheKeySpy.mockClear();
    (queryNexusChat as jest.Mock).mockReset();
    (queryNexusChat as jest.Mock).mockResolvedValue({ rows: [] });
  });

  it("getInboxes: cacheKey recebe connectionId", async () => {
    await getInboxes(CONN_A, 1);
    expect(cacheKeySpy).toHaveBeenCalled();
    const arg = cacheKeySpy.mock.calls[0][0];
    // `name` carrega o sufixo `-v2` (bump de versão para invalidar cache antigo).
    expect(arg.name).toMatch(/^inboxes(-v2)?$/);
    expect(arg.accountId).toBe(1);
    // connectionId entra na chave para evitar colisão entre connections com
    // mesmo accountId.
    expect((arg as any).connectionId ?? "").toBe(CONN_A);
  });

  it("getInboxes: query Postgres usa connectionId como 1º arg", async () => {
    await getInboxes(CONN_A, 9);
    const call = (queryNexusChat as jest.Mock).mock.calls[0];
    expect(call[0]).toBe(CONN_A);
    expect(call[2]).toEqual([9]);
  });

  it("getTeams: assinatura (connectionId, accountId)", async () => {
    await getTeams(CONN_A, 9);
    const call = (queryNexusChat as jest.Mock).mock.calls[0];
    expect(call[0]).toBe(CONN_A);
    expect(call[2]).toEqual([9]);
    const arg = cacheKeySpy.mock.calls[0][0];
    expect((arg as any).connectionId).toBe(CONN_A);
  });

  it("getUsers: assinatura (connectionId, accountId)", async () => {
    await getUsers(CONN_A, 9);
    const call = (queryNexusChat as jest.Mock).mock.calls[0];
    expect(call[0]).toBe(CONN_A);
    expect(call[2]).toEqual([9]);
  });

  it("getLabels: assinatura (connectionId, accountId)", async () => {
    await getLabels(CONN_A, 9);
    const call = (queryNexusChat as jest.Mock).mock.calls[0];
    expect(call[0]).toBe(CONN_A);
    expect(call[2]).toEqual([9]);
  });

  it("connections diferentes geram chaves de cache distintas (sem colisão)", async () => {
    const CONN_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    await getInboxes(CONN_A, 9);
    await getInboxes(CONN_B, 9);
    const argA = cacheKeySpy.mock.calls[0][0] as any;
    const argB = cacheKeySpy.mock.calls[1][0] as any;
    expect(argA.connectionId).toBe(CONN_A);
    expect(argB.connectionId).toBe(CONN_B);
    expect(argA).not.toEqual(argB);
  });
});
