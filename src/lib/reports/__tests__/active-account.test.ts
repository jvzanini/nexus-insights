jest.mock("next/headers");
jest.mock("@/lib/tenant", () => ({
  getAccessibleAccountIds: jest.fn(),
  getKnownAccounts: jest.fn(),
  getAccessibleTeamIds: jest.fn(),
  assertAccountAccess: jest.fn(),
}));
jest.mock("react", () => {
  const actual = jest.requireActual("react");
  return {
    ...actual,
    cache: <T extends (...a: unknown[]) => unknown>(fn: T): T => fn,
  };
});

import { cookies } from "next/headers";
import {
  getActiveAccountId,
  NoAccessibleAccountError,
} from "@/lib/reports/active-account";
import * as tenant from "@/lib/tenant";
import type { AuthUser } from "@/lib/auth-helpers";

const mockedCookies = cookies as jest.MockedFunction<typeof cookies>;
const mockedGetAccessibleAccountIds =
  tenant.getAccessibleAccountIds as jest.MockedFunction<
    typeof tenant.getAccessibleAccountIds
  >;

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "u1",
    email: "u1@x.com",
    name: "User 1",
    platformRole: "viewer",
    isOwner: false,
    mustChangePassword: false,
    avatarUrl: null,
    theme: "dark",
    accountIds: [2, 9],
    teamIds: [],
    ...overrides,
  } as AuthUser;
}

function setCookie(value: string | undefined) {
  const get = jest
    .fn()
    .mockReturnValue(value === undefined ? undefined : { value });
  mockedCookies.mockResolvedValue({
    get,
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

describe("getActiveAccountId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("retorna primeira conta permitida quando cookie ausente (não 9 hardcoded)", async () => {
    setCookie(undefined);
    mockedGetAccessibleAccountIds.mockResolvedValue([2, 9]);
    expect(await getActiveAccountId(makeUser({ accountIds: [2, 9] }))).toBe(2);
  });

  it("retorna cookie quando válido e user tem acesso", async () => {
    setCookie("9");
    mockedGetAccessibleAccountIds.mockResolvedValue([2, 9]);
    expect(await getActiveAccountId(makeUser({ accountIds: [2, 9] }))).toBe(9);
  });

  it("ignora cookie inválido e cai pra primeira permitida", async () => {
    mockedGetAccessibleAccountIds.mockResolvedValue([2, 9]);
    for (const bad of ["abc", "-1", "0", ""]) {
      setCookie(bad);
      expect(await getActiveAccountId(makeUser({ accountIds: [2, 9] }))).toBe(
        2,
      );
    }
  });

  it("cookie aponta pra conta proibida → primeira permitida", async () => {
    setCookie("99");
    mockedGetAccessibleAccountIds.mockResolvedValue([2, 9]);
    expect(await getActiveAccountId(makeUser({ accountIds: [2, 9] }))).toBe(2);
  });

  it("user sem nenhuma conta acessível → throws NoAccessibleAccountError", async () => {
    setCookie(undefined);
    mockedGetAccessibleAccountIds.mockResolvedValue([]);
    await expect(
      getActiveAccountId(makeUser({ accountIds: [] })),
    ).rejects.toBeInstanceOf(NoAccessibleAccountError);
  });
});
